const express = require("express");
const router = express.Router();

const PortalUser = require("../models/portalUser");
const portalAuthMiddleware = require("../middleware/portalAuthMiddleware");
const { twoFactorLimiter } = require("../middleware/rateLimiters");
const { verifyLoginChallenge, startNewSession } = require("../utils/jwtSession");
const {
  getOrCreateSetupSecret,
  verifyUserTwoFactorCode,
  activateTwoFactor,
  clearTwoFactor,
} = require("../utils/twoFactor");
const { verifyPassword } = require("../utils/passwordHash");
const { toPublicUser } = require("../utils/sanitizeUser");
const { logActivity } = require("../utils/activityLogger");
const { sendError, sendSuccess } = require("../utils/apiResponse");
const { TWO_FACTOR_REQUIRED_ROLES } = require("../config/constants");

const CHALLENGE_EXPIRED = {
  success: false,
  message: "This login step expired. Please sign in again.",
  code: "LOGIN_CHALLENGE_EXPIRED",
};

// ---------------------------------------------------------------------------
// POST /google-auth-2fa/verifyLoginTwoFactorCode  { challengeToken, code }
// Second step of login. Finishes 2FA setup (first login of an Admin/SuperAdmin)
// or checks the code of an account that already has 2FA, then starts the session.
// ---------------------------------------------------------------------------
router.post("/verifyLoginTwoFactorCode", twoFactorLimiter, async (req, res) => {
  try {
    const { challengeToken, code } = req.body || {};
    if (!challengeToken) return res.status(401).json(CHALLENGE_EXPIRED);

    let decoded;
    try {
      decoded = verifyLoginChallenge(challengeToken);
    } catch (error) {
      return res.status(401).json(CHALLENGE_EXPIRED);
    }

    const user = await PortalUser.findById(decoded.userId).select(PortalUser.SECURE_FIELDS);
    // challenge must be the latest one issued for this user (single use)
    if (!user || !user.loginChallengeId || user.loginChallengeId !== decoded.challengeId) {
      return res.status(401).json(CHALLENGE_EXPIRED);
    }
    if (user.isBlocked) {
      return sendError(res, 403, "Your account is blocked. Contact the SuperAdmin.", { code: "ACCOUNT_BLOCKED" });
    }

    const settingUp = !user.isTwoFactorEnabled;
    const result = await verifyUserTwoFactorCode(user, code, { useTempSecret: settingUp });
    if (!result.ok) {
      await user.save();
      return sendError(res, result.status, result.message, { code: result.code });
    }

    if (settingUp) activateTwoFactor(user);
    const session = await startNewSession(res, user, req); // also clears the challenge

    if (settingUp) {
      await logActivity({ req, actor: user, action: "TWO_FACTOR_ENABLED", targetType: "PortalUser", targetId: user._id });
    }
    await logActivity({ req, actor: user, action: "LOGIN_SUCCESS", targetType: "PortalUser", targetId: user._id, details: { twoFactor: true } });

    return sendSuccess(
      res,
      { user: toPublicUser(user), session, twoFactorJustEnabled: settingUp },
      settingUp ? "Two-factor authentication is now active" : "Verified"
    );
  } catch (error) {
    console.error("verifyLoginTwoFactorCode error:", error);
    return sendError(res, 500, "Internal server error");
  }
});

// ---------------------------------------------------------------------------
// GET /google-auth-2fa/getTwoFactorStatus
// ---------------------------------------------------------------------------
router.get("/getTwoFactorStatus", portalAuthMiddleware, async (req, res) => {
  return sendSuccess(res, {
    isTwoFactorEnabled: !!req.user.isTwoFactorEnabled,
    twoFactorEnabledAt: req.user.twoFactorEnabledAt || null,
    isMandatory: TWO_FACTOR_REQUIRED_ROLES.includes(req.user.role),
  });
});

// ---------------------------------------------------------------------------
// POST /google-auth-2fa/generateTwoFactorSetup
// A plain User can turn 2FA on voluntarily. Returns QR + manual key.
// ---------------------------------------------------------------------------
router.post("/generateTwoFactorSetup", portalAuthMiddleware, twoFactorLimiter, async (req, res) => {
  try {
    if (req.user.isTwoFactorEnabled) return sendError(res, 400, "Two-factor authentication is already enabled");
    const setup = await getOrCreateSetupSecret(req.user);
    await req.user.save();
    return sendSuccess(res, { qrCode: setup.qrCode, manualKey: setup.secret });
  } catch (error) {
    console.error("generateTwoFactorSetup error:", error);
    return sendError(res, 500, "Internal server error");
  }
});

// ---------------------------------------------------------------------------
// POST /google-auth-2fa/enableTwoFactor  { code }
// ---------------------------------------------------------------------------
router.post("/enableTwoFactor", portalAuthMiddleware, twoFactorLimiter, async (req, res) => {
  try {
    if (req.user.isTwoFactorEnabled) return sendError(res, 400, "Two-factor authentication is already enabled");
    if (!req.user.twoFactorTempSecret) return sendError(res, 400, "Start the setup first", { code: "TWO_FACTOR_SETUP_MISSING" });

    const result = await verifyUserTwoFactorCode(req.user, req.body?.code, { useTempSecret: true });
    if (!result.ok) {
      await req.user.save();
      return sendError(res, result.status, result.message, { code: result.code });
    }

    activateTwoFactor(req.user);
    await req.user.save();
    await logActivity({ req, actor: req.user, action: "TWO_FACTOR_ENABLED", targetType: "PortalUser", targetId: req.user._id });
    return sendSuccess(res, { user: toPublicUser(req.user) }, "Two-factor authentication enabled");
  } catch (error) {
    console.error("enableTwoFactor error:", error);
    return sendError(res, 500, "Internal server error");
  }
});

// ---------------------------------------------------------------------------
// POST /google-auth-2fa/disableTwoFactor  { code, password }
// Only a plain User may turn it off - for Admin / SuperAdmin it is mandatory.
// ---------------------------------------------------------------------------
router.post("/disableTwoFactor", portalAuthMiddleware, twoFactorLimiter, async (req, res) => {
  try {
    if (TWO_FACTOR_REQUIRED_ROLES.includes(req.user.role)) {
      return sendError(res, 403, "Two-factor authentication is mandatory for your role");
    }
    if (!req.user.isTwoFactorEnabled) return sendError(res, 400, "Two-factor authentication is not enabled");

    const passwordOk = await verifyPassword(String(req.body?.password || ""), req.user.password);
    if (!passwordOk) return sendError(res, 400, "Password is incorrect", { code: "WRONG_PASSWORD" });

    const result = await verifyUserTwoFactorCode(req.user, req.body?.code);
    if (!result.ok) {
      await req.user.save();
      return sendError(res, result.status, result.message, { code: result.code });
    }

    clearTwoFactor(req.user);
    await req.user.save();
    await logActivity({ req, actor: req.user, action: "TWO_FACTOR_DISABLED", targetType: "PortalUser", targetId: req.user._id });
    return sendSuccess(res, { user: toPublicUser(req.user) }, "Two-factor authentication disabled");
  } catch (error) {
    console.error("disableTwoFactor error:", error);
    return sendError(res, 500, "Internal server error");
  }
});

module.exports = router;
