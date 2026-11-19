const express = require("express");
const crypto = require("crypto");
const router = express.Router();

const PortalUser = require("../models/portalUser");
const portalAuthMiddleware = require("../middleware/portalAuthMiddleware");
const { checkStepUpTwoFactor } = require("../middleware/requireTwoFactorCode");
const { loginLimiter, registerLimiter } = require("../middleware/rateLimiters");
const { hashPassword, verifyPassword, validatePasswordStrength } = require("../utils/passwordHash");
const { startNewSession, clearSessionCookie, signLoginChallenge } = require("../utils/jwtSession");
const { getOrCreateSetupSecret } = require("../utils/twoFactor");
const { toPublicUser } = require("../utils/sanitizeUser");
const { logActivity } = require("../utils/activityLogger");
const { normalizeEmail, isValidEmail } = require("../utils/emailAddress");
const { sendError, sendSuccess } = require("../utils/apiResponse");
const {
  ROLES,
  requiresTwoFactor,
  MAX_FAILED_LOGINS,
  LOGIN_LOCK_MINUTES,
  LOGIN_CHALLENGE_MINUTES,
} = require("../config/constants");

const PASSWORD_HINT = "Password must be at least 8 characters with upper & lower case letters, a number and a symbol";
const INVALID_LOGIN = "Invalid email or password";

// A real argon2 hash to verify against when the email doesn't exist, so the
// response time doesn't reveal which emails have accounts.
let dummyHashPromise = null;
const getDummyHash = () => (dummyHashPromise ||= hashPassword(crypto.randomBytes(16).toString("hex")));

// ---------------------------------------------------------------------------
// POST /auth/registerUser  - anyone can create a plain "User" account.
// A new account sees NO emails until the SuperAdmin assigns mailboxes to it.
// ---------------------------------------------------------------------------
router.post("/registerUser", registerLimiter, async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;

    if (name.length < 2 || name.length > 80) return sendError(res, 400, "Enter your full name (2-80 characters)");
    if (!isValidEmail(email)) return sendError(res, 400, "Enter a valid email address");
    if (!validatePasswordStrength(password)) return sendError(res, 400, PASSWORD_HINT);

    const exists = await PortalUser.exists({ email });
    if (exists) return sendError(res, 409, "An account with this email already exists");

    const user = await PortalUser.create({
      name,
      email,
      password: await hashPassword(password),
      role: ROLES.USER, // role can only be raised by the SuperAdmin
      passwordChangedAt: new Date(),
    });

    await logActivity({ req, actor: user, action: "USER_REGISTERED", targetType: "PortalUser", targetId: user._id });
    return sendSuccess(res, { user: toPublicUser(user) }, "Account created. You can log in now.", 201);
  } catch (error) {
    if (error?.code === 11000) return sendError(res, 409, "An account with this email already exists");
    console.error("registerUser error:", error);
    return sendError(res, 500, "Internal server error");
  }
});

// ---------------------------------------------------------------------------
// POST /auth/loginUser  { email, password }
//  - User without 2FA      -> session started straight away
//  - SuperAdmin / Admin    -> 2FA is mandatory:
//        not set up yet -> { twoFactorSetupRequired, qrCode, manualKey, challengeToken }
//        already set up -> { twoFactorRequired, challengeToken }
//    then POST /google-auth-2fa/verifyLoginTwoFactorCode { challengeToken, code }
// A new login always ends the previous session (single active session).
// ---------------------------------------------------------------------------
router.post("/loginUser", loginLimiter, async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");
    if (!email || !password) return sendError(res, 400, "Email and password are required");

    const user = await PortalUser.findOne({ email }).select(PortalUser.SECURE_FIELDS);
    if (!user) {
      await verifyPassword(password, await getDummyHash());
      return sendError(res, 401, INVALID_LOGIN, { code: "INVALID_CREDENTIALS" });
    }

    if (user.loginLockUntil && user.loginLockUntil.getTime() > Date.now()) {
      const minutes = Math.ceil((user.loginLockUntil.getTime() - Date.now()) / 60000);
      return sendError(res, 429, `Account temporarily locked after too many wrong passwords. Try again in ${minutes} min.`, {
        code: "ACCOUNT_LOCKED",
      });
    }

    const passwordOk = await verifyPassword(password, user.password);
    if (!passwordOk) {
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
      if (user.failedLoginAttempts >= MAX_FAILED_LOGINS) {
        user.loginLockUntil = new Date(Date.now() + LOGIN_LOCK_MINUTES * 60 * 1000);
        user.failedLoginAttempts = 0;
        await logActivity({ req, actor: user, action: "LOGIN_LOCKED", targetType: "PortalUser", targetId: user._id });
      }
      await user.save();
      return sendError(res, 401, INVALID_LOGIN, { code: "INVALID_CREDENTIALS" });
    }

    if (user.isBlocked) {
      return sendError(res, 403, "Your account is blocked. Contact the SuperAdmin.", { code: "ACCOUNT_BLOCKED" });
    }

    user.failedLoginAttempts = 0;
    user.loginLockUntil = undefined;

    // Plain user without 2FA -> straight in
    if (!requiresTwoFactor(user)) {
      const session = await startNewSession(res, user, req);
      await logActivity({ req, actor: user, action: "LOGIN_SUCCESS", targetType: "PortalUser", targetId: user._id });
      return sendSuccess(res, { user: toPublicUser(user), session }, "Logged in");
    }

    // Password is right but a 2FA code is still needed
    const challengeId = crypto.randomBytes(16).toString("hex");
    user.loginChallengeId = challengeId;
    const mode = user.isTwoFactorEnabled ? "verify" : "setup";

    let setup = null;
    if (mode === "setup") setup = await getOrCreateSetupSecret(user);
    await user.save();

    const challengeToken = signLoginChallenge({ userId: user._id, challengeId, mode });
    const basic = { name: user.name, email: user.email, role: user.role };

    if (mode === "setup") {
      return sendSuccess(res, {
        twoFactorSetupRequired: true,
        challengeToken,
        expiresInSeconds: LOGIN_CHALLENGE_MINUTES * 60,
        qrCode: setup.qrCode,
        manualKey: setup.secret,
        user: basic,
      }, "Set up Google Authenticator to continue");
    }

    return sendSuccess(res, {
      twoFactorRequired: true,
      challengeToken,
      expiresInSeconds: LOGIN_CHALLENGE_MINUTES * 60,
      user: basic,
    }, "Enter your Google Authenticator code");
  } catch (error) {
    console.error("loginUser error:", error);
    return sendError(res, 500, "Internal server error");
  }
});

// ---------------------------------------------------------------------------
// POST /auth/logoutUser
// ---------------------------------------------------------------------------
router.post("/logoutUser", portalAuthMiddleware, async (req, res) => {
  try {
    req.user.activeSessionId = undefined;
    await req.user.save();
    clearSessionCookie(res);
    await logActivity({ req, actor: req.user, action: "LOGOUT", targetType: "PortalUser", targetId: req.user._id });
    return sendSuccess(res, {}, "Logged out");
  } catch (error) {
    console.error("logoutUser error:", error);
    clearSessionCookie(res);
    return sendError(res, 500, "Internal server error");
  }
});

// ---------------------------------------------------------------------------
// GET /auth/getMyProfile  - who am I + when does my session end
// ---------------------------------------------------------------------------
router.get("/getMyProfile", portalAuthMiddleware, async (req, res) => {
  return sendSuccess(res, { user: toPublicUser(req.user), session: req.session });
});

// ---------------------------------------------------------------------------
// PUT /auth/updateMyProfile  { name, twoFactorCode }
// Admin / SuperAdmin must confirm with a fresh 2FA code.
// ---------------------------------------------------------------------------
router.put("/updateMyProfile", portalAuthMiddleware, async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    if (name.length < 2 || name.length > 80) return sendError(res, 400, "Enter your full name (2-80 characters)");
    if (name === req.user.name) return sendError(res, 400, "Nothing changed");

    const stepUp = await checkStepUpTwoFactor(req.user, req.body?.twoFactorCode);
    if (stepUp) return res.status(stepUp.status).json(stepUp.body);

    const oldName = req.user.name;
    req.user.name = name;
    await req.user.save();
    await logActivity({
      req,
      actor: req.user,
      action: "PROFILE_UPDATED",
      targetType: "PortalUser",
      targetId: req.user._id,
      details: { from: oldName, to: name },
    });
    return sendSuccess(res, { user: toPublicUser(req.user) }, "Profile updated");
  } catch (error) {
    console.error("updateMyProfile error:", error);
    return sendError(res, 500, "Internal server error");
  }
});

// ---------------------------------------------------------------------------
// PUT /auth/changeMyPassword  { currentPassword, newPassword, twoFactorCode }
// Checks the current password first (so a typo doesn't burn the 2FA code), then the
// 2FA code for Admin / SuperAdmin. Bumps tokenVersion -> every other session is logged
// out, and this device gets a fresh session.
// ---------------------------------------------------------------------------
router.put("/changeMyPassword", portalAuthMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) return sendError(res, 400, "Current and new password are required");
    if (!validatePasswordStrength(newPassword)) return sendError(res, 400, PASSWORD_HINT);
    if (currentPassword === newPassword) return sendError(res, 400, "New password must be different from the current one");

    const currentOk = await verifyPassword(currentPassword, req.user.password);
    if (!currentOk) return sendError(res, 400, "Current password is incorrect", { code: "WRONG_PASSWORD" });

    const stepUp = await checkStepUpTwoFactor(req.user, req.body?.twoFactorCode);
    if (stepUp) return res.status(stepUp.status).json(stepUp.body);

    req.user.password = await hashPassword(newPassword);
    req.user.passwordChangedAt = new Date();
    req.user.tokenVersion = (req.user.tokenVersion || 1) + 1;
    const session = await startNewSession(res, req.user, req);

    await logActivity({ req, actor: req.user, action: "PASSWORD_CHANGED", targetType: "PortalUser", targetId: req.user._id });
    return sendSuccess(res, { user: toPublicUser(req.user), session }, "Password changed. Other sessions were logged out.");
  } catch (error) {
    console.error("changeMyPassword error:", error);
    return sendError(res, 500, "Internal server error");
  }
});

module.exports = router;
