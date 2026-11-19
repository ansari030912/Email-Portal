const { requiresTwoFactor } = require("../config/constants");
const { verifyUserTwoFactorCode } = require("../utils/twoFactor");
const { sendError } = require("../utils/apiResponse");

// Step-up check for sensitive actions (password / profile change, role change, ...).
// SuperAdmin & Admin ALWAYS need a fresh Google Authenticator code (body.twoFactorCode),
// even though they are logged in. A User needs it only if they turned 2FA on.
// Each code works once (replay protected) and 5 wrong codes lock 2FA for 10 minutes.
//
// Returns null when the action may continue, otherwise { status, body } to send back.
const checkStepUpTwoFactor = async (user, code) => {
  if (!requiresTwoFactor(user)) return null;

  if (!user.isTwoFactorEnabled) {
    // Admin roles always have it (login forces setup) - this is only a safety net.
    return {
      status: 403,
      body: { success: false, message: "Set up two-factor authentication first", code: "TWO_FACTOR_SETUP_REQUIRED" },
    };
  }

  if (!code) {
    return {
      status: 401,
      body: {
        success: false,
        message: "Enter your Google Authenticator code to confirm",
        code: "TWO_FACTOR_REQUIRED",
        twoFactorRequired: true,
      },
    };
  }

  const result = await verifyUserTwoFactorCode(user, code);
  await user.save();
  if (!result.ok) {
    return {
      status: result.status,
      body: { success: false, message: result.message, code: result.code, twoFactorInvalid: true },
    };
  }
  return null;
};

const requireTwoFactorCode = async (req, res, next) => {
  try {
    const failure = await checkStepUpTwoFactor(req.user, req.body?.twoFactorCode);
    if (failure) return res.status(failure.status).json(failure.body);
    req.twoFactorVerified = true;
    next();
  } catch (error) {
    console.error("requireTwoFactorCode error:", error);
    return sendError(res, 500, "Internal server error");
  }
};

module.exports = requireTwoFactorCode;
module.exports.checkStepUpTwoFactor = checkStepUpTwoFactor;
