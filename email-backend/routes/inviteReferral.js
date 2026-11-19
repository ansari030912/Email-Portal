const express = require("express");
const router = express.Router();

const Invite = require("../models/invite");
const PortalUser = require("../models/portalUser");
const portalAuthMiddleware = require("../middleware/portalAuthMiddleware");
const requireRole = require("../middleware/requireRole");
const requireTwoFactorCode = require("../middleware/requireTwoFactorCode");
const { inviteCheckLimiter } = require("../middleware/rateLimiters");
const { generateInviteCode, normalizeInviteCode, hashInviteCode } = require("../utils/inviteCodes");
const { logActivity } = require("../utils/activityLogger");
const { normalizeEmail, isValidEmail } = require("../utils/emailAddress");
const { sendError, sendSuccess, isValidObjectId, escapeRegex, parsePagination } = require("../utils/apiResponse");
const { ROLES } = require("../config/constants");

const ALLOWED_DAYS = [1, 3, 7, 14, 30];
const superAdminOnly = [portalAuthMiddleware, requireRole(ROLES.SUPER_ADMIN)];

const toInviteDto = (invite) => ({
  _id: String(invite._id),
  email: invite.email,
  codeHint: invite.codeHint,
  status: Invite.effectiveStatus(invite),
  expiresAt: invite.expiresAt,
  createdAt: invite.createdAt,
  createdBy: invite.createdBy && invite.createdBy.name ? { name: invite.createdBy.name, email: invite.createdBy.email } : null,
  usedAt: invite.usedAt || null,
  usedBy: invite.usedBy && invite.usedBy.name ? { name: invite.usedBy.name, email: invite.usedBy.email } : null,
  revokedAt: invite.revokedAt || null,
});

/**
 * Checks an (email, code) pair. Used by the public verify API and by registration.
 * Returns { ok: true, invite } or { ok: false, status, code, message }.
 * The messages are specific on purpose (the user asked for "different email" to be
 * reported) - the code space is far too large to guess, and checks are rate limited.
 */
const checkInvite = async (rawEmail, rawCode) => {
  const email = normalizeEmail(rawEmail);
  const normalized = normalizeInviteCode(rawCode);
  if (!isValidEmail(email)) return { ok: false, status: 400, code: "INVALID_EMAIL", message: "Enter a valid email address" };
  if (normalized.length !== 12) {
    return { ok: false, status: 400, code: "INVITE_INVALID", message: "Enter the 12 character referral code" };
  }

  const invite = await Invite.findOne({ codeHash: hashInviteCode(normalized) });
  if (!invite) return { ok: false, status: 400, code: "INVITE_INVALID", message: "This referral code is not valid" };
  if (invite.email !== email) {
    return {
      ok: false,
      status: 400,
      code: "INVITE_EMAIL_MISMATCH",
      message: "This referral code was issued for a different email address",
    };
  }
  const status = Invite.effectiveStatus(invite);
  if (status === "used") return { ok: false, status: 400, code: "INVITE_USED", message: "This referral code has already been used" };
  if (status === "revoked") return { ok: false, status: 400, code: "INVITE_REVOKED", message: "This referral code was cancelled" };
  if (status === "expired") return { ok: false, status: 400, code: "INVITE_EXPIRED", message: "This referral code has expired. Ask for a new one." };

  if (await PortalUser.exists({ email })) {
    return { ok: false, status: 409, code: "ACCOUNT_EXISTS", message: "An account with this email already exists" };
  }
  return { ok: true, invite, email };
};

// ---------------------------------------------------------------------------
// POST /invite-referral/verifyInviteReferral { email, code }  (public)
// Step 1 of the register page - is this code valid for this email?
// ---------------------------------------------------------------------------
router.post("/verifyInviteReferral", inviteCheckLimiter, async (req, res) => {
  try {
    const result = await checkInvite(req.body?.email, req.body?.code);
    if (!result.ok) return sendError(res, result.status, result.message, { code: result.code });
    return sendSuccess(res, { email: result.email, expiresAt: result.invite.expiresAt }, "Referral code verified");
  } catch (error) {
    console.error("verifyInviteReferral error:", error);
    return sendError(res, 500, "Internal server error");
  }
});

// ---------------------------------------------------------------------------
// POST /invite-referral/createInviteReferral { email, expiresInDays, twoFactorCode }
// SuperAdmin + fresh 2FA code. Replaces any pending referral of the same email.
// The code is returned ONCE.
// ---------------------------------------------------------------------------
router.post("/createInviteReferral", ...superAdminOnly, requireTwoFactorCode, async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const days = Number(req.body?.expiresInDays || 7);
    if (!isValidEmail(email)) return sendError(res, 400, "Enter a valid email address");
    if (!ALLOWED_DAYS.includes(days)) return sendError(res, 400, `Expiry must be one of ${ALLOWED_DAYS.join(", ")} days`);
    if (await PortalUser.exists({ email })) return sendError(res, 409, "This email already has an account");

    // only one live referral per email
    const replaced = await Invite.updateMany(
      { email, status: "pending" },
      { $set: { status: "revoked", revokedAt: new Date(), revokedBy: req.user._id } }
    );

    const code = generateInviteCode();
    const invite = await Invite.create({
      email,
      codeHash: hashInviteCode(code),
      codeHint: code.slice(-2),
      expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
      createdBy: req.user._id,
    });

    await logActivity({
      req,
      actor: req.user,
      action: "INVITE_CREATED",
      targetType: "Invite",
      targetId: invite._id,
      details: { email, expiresInDays: days, replacedPending: replaced.modifiedCount },
    });

    await invite.populate("createdBy", "name email");
    return sendSuccess(res, { invite: toInviteDto(invite), code }, "Referral created", 201);
  } catch (error) {
    console.error("createInviteReferral error:", error);
    return sendError(res, 500, "Internal server error");
  }
});

// ---------------------------------------------------------------------------
// GET /invite-referral/getAllInviteReferrals?status=all|pending|used|expired|revoked&search=&page=&limit=
// ---------------------------------------------------------------------------
router.get("/getAllInviteReferrals", ...superAdminOnly, async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query, 25, 100);
    const now = new Date();
    const filter = {};
    const search = String(req.query.search || "").trim();
    if (search) filter.email = new RegExp(escapeRegex(search.toLowerCase()), "i");
    switch (req.query.status) {
      case "pending":
        Object.assign(filter, { status: "pending", expiresAt: { $gt: now } });
        break;
      case "expired":
        Object.assign(filter, { status: "pending", expiresAt: { $lte: now } });
        break;
      case "used":
      case "revoked":
        filter.status = req.query.status;
        break;
      default:
        break;
    }

    const [items, total, pending, used, expired, revoked] = await Promise.all([
      Invite.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate("createdBy usedBy", "name email").lean(),
      Invite.countDocuments(filter),
      Invite.countDocuments({ status: "pending", expiresAt: { $gt: now } }),
      Invite.countDocuments({ status: "used" }),
      Invite.countDocuments({ status: "pending", expiresAt: { $lte: now } }),
      Invite.countDocuments({ status: "revoked" }),
    ]);

    return sendSuccess(res, {
      invites: items.map(toInviteDto),
      stats: { pending, used, expired, revoked },
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (error) {
    console.error("getAllInviteReferrals error:", error);
    return sendError(res, 500, "Internal server error");
  }
});

// ---------------------------------------------------------------------------
// PUT /invite-referral/revokeInviteReferral { inviteId, twoFactorCode }
// ---------------------------------------------------------------------------
router.put("/revokeInviteReferral", ...superAdminOnly, requireTwoFactorCode, async (req, res) => {
  try {
    const { inviteId } = req.body || {};
    if (!isValidObjectId(String(inviteId))) return sendError(res, 400, "Invalid referral id");
    const invite = await Invite.findOneAndUpdate(
      { _id: inviteId, status: "pending" },
      { $set: { status: "revoked", revokedAt: new Date(), revokedBy: req.user._id } },
      { new: true }
    ).populate("createdBy usedBy", "name email");
    if (!invite) return sendError(res, 404, "Referral not found or already used / cancelled");

    await logActivity({ req, actor: req.user, action: "INVITE_REVOKED", targetType: "Invite", targetId: invite._id, details: { email: invite.email } });
    return sendSuccess(res, { invite: toInviteDto(invite) }, "Referral cancelled");
  } catch (error) {
    console.error("revokeInviteReferral error:", error);
    return sendError(res, 500, "Internal server error");
  }
});

module.exports = router;
module.exports.checkInvite = checkInvite;
