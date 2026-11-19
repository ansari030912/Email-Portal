const express = require("express");
const router = express.Router();

const PortalUser = require("../models/portalUser");
const RecipientMailbox = require("../models/recipientMailbox");
const portalAuthMiddleware = require("../middleware/portalAuthMiddleware");
const requireRole = require("../middleware/requireRole");
const requireTwoFactorCode = require("../middleware/requireTwoFactorCode");
const { clearTwoFactor } = require("../utils/twoFactor");
const { toPublicUser } = require("../utils/sanitizeUser");
const { logActivity } = require("../utils/activityLogger");
const { sendError, sendSuccess, isValidObjectId, escapeRegex } = require("../utils/apiResponse");
const { ROLES, ASSIGNABLE_ROLES, ALL_ROLES } = require("../config/constants");

// Every route here: logged in + SuperAdmin only
router.use(portalAuthMiddleware, requireRole(ROLES.SUPER_ADMIN));

// Loads the target user and refuses changes to yourself or to another SuperAdmin.
const loadManageableUser = async (req, res) => {
  const { userId } = req.body || {};
  if (!isValidObjectId(userId)) {
    sendError(res, 400, "Invalid user id");
    return null;
  }
  if (String(userId) === String(req.user._id)) {
    sendError(res, 403, "You can't change your own account here");
    return null;
  }
  const target = await PortalUser.findById(userId).select("+activeSessionId");
  if (!target) {
    sendError(res, 404, "User not found");
    return null;
  }
  if (target.role === ROLES.SUPER_ADMIN) {
    sendError(res, 403, "A SuperAdmin account can't be changed");
    return null;
  }
  return target;
};

// ---------------------------------------------------------------------------
// GET /user-management/getAllPortalUsers?search=&role=
// ---------------------------------------------------------------------------
router.get("/getAllPortalUsers", async (req, res) => {
  try {
    const filter = {};
    const search = String(req.query.search || "").trim();
    if (search) {
      const rx = new RegExp(escapeRegex(search), "i");
      filter.$or = [{ name: rx }, { email: rx }];
    }
    if (req.query.role && ALL_ROLES.includes(req.query.role)) filter.role = req.query.role;

    const users = await PortalUser.find(filter).sort({ createdAt: 1 }).lean();

    // how many mailboxes each user is assigned to
    const counts = await RecipientMailbox.aggregate([
      { $unwind: "$user_id" },
      { $group: { _id: "$user_id", count: { $sum: 1 } } },
    ]);
    const countMap = new Map(counts.map((c) => [String(c._id), c.count]));

    return sendSuccess(res, {
      users: users.map((u) => ({ ...toPublicUser(u), assignedMailboxCount: countMap.get(String(u._id)) || 0 })),
    });
  } catch (error) {
    console.error("getAllPortalUsers error:", error);
    return sendError(res, 500, "Internal server error");
  }
});

// ---------------------------------------------------------------------------
// PUT /user-management/updatePortalUserRole  { userId, role: "Admin" | "User", twoFactorCode }
// SuperAdmin confirms with 2FA. Nobody can be made SuperAdmin. The user is logged
// out so the new role (and the mandatory 2FA setup for Admin) applies at next login.
// ---------------------------------------------------------------------------
router.put("/updatePortalUserRole", requireTwoFactorCode, async (req, res) => {
  try {
    const role = req.body?.role;
    if (!ASSIGNABLE_ROLES.includes(role)) {
      return sendError(res, 400, `Role must be one of: ${ASSIGNABLE_ROLES.join(", ")}`);
    }
    const target = await loadManageableUser(req, res);
    if (!target) return;
    if (target.role === role) return sendError(res, 400, `User is already ${role}`);

    const previousRole = target.role;
    target.role = role;
    target.tokenVersion = (target.tokenVersion || 1) + 1; // force re-login
    target.activeSessionId = undefined;
    await target.save();

    await logActivity({
      req,
      actor: req.user,
      action: "USER_ROLE_CHANGED",
      targetType: "PortalUser",
      targetId: target._id,
      details: { email: target.email, from: previousRole, to: role },
    });
    return sendSuccess(res, { user: toPublicUser(target) }, `${target.name} is now ${role}`);
  } catch (error) {
    console.error("updatePortalUserRole error:", error);
    return sendError(res, 500, "Internal server error");
  }
});

// ---------------------------------------------------------------------------
// PUT /user-management/updatePortalUserStatus  { userId, isBlocked, twoFactorCode }
// ---------------------------------------------------------------------------
router.put("/updatePortalUserStatus", requireTwoFactorCode, async (req, res) => {
  try {
    const isBlocked = req.body?.isBlocked;
    if (typeof isBlocked !== "boolean") return sendError(res, 400, "isBlocked must be true or false");
    const target = await loadManageableUser(req, res);
    if (!target) return;

    target.isBlocked = isBlocked;
    if (isBlocked) {
      target.tokenVersion = (target.tokenVersion || 1) + 1; // kick them out right now
      target.activeSessionId = undefined;
    }
    await target.save();

    await logActivity({
      req,
      actor: req.user,
      action: isBlocked ? "USER_BLOCKED" : "USER_UNBLOCKED",
      targetType: "PortalUser",
      targetId: target._id,
      details: { email: target.email },
    });
    return sendSuccess(res, { user: toPublicUser(target) }, isBlocked ? "User blocked" : "User unblocked");
  } catch (error) {
    console.error("updatePortalUserStatus error:", error);
    return sendError(res, 500, "Internal server error");
  }
});

// ---------------------------------------------------------------------------
// PUT /user-management/resetPortalUserTwoFactor { userId, twoFactorCode }
// For a member who lost their phone: clears their 2FA and logs them out. An Admin
// will be forced to set it up again at next login.
// ---------------------------------------------------------------------------
router.put("/resetPortalUserTwoFactor", requireTwoFactorCode, async (req, res) => {
  try {
    const target = await loadManageableUser(req, res);
    if (!target) return;
    if (!target.isTwoFactorEnabled) return sendError(res, 400, "This user has no 2FA to reset");

    clearTwoFactor(target);
    target.tokenVersion = (target.tokenVersion || 1) + 1;
    target.activeSessionId = undefined;
    await target.save();

    await logActivity({
      req,
      actor: req.user,
      action: "USER_TWO_FACTOR_RESET",
      targetType: "PortalUser",
      targetId: target._id,
      details: { email: target.email },
    });
    return sendSuccess(res, { user: toPublicUser(target) }, "2FA reset. The user sets it up again at next login.");
  } catch (error) {
    console.error("resetPortalUserTwoFactor error:", error);
    return sendError(res, 500, "Internal server error");
  }
});

module.exports = router;
