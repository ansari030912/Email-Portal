const otplib = require("otplib");
const qrcode = require("qrcode");
const { encryptSecret, decryptSecret } = require("./secretBox");
const { MAX_FAILED_TWO_FACTOR, TWO_FACTOR_LOCK_MINUTES } = require("../config/constants");

const ISSUER = () => process.env.TOTP_ISSUER || "InvoiceMate Email Portal";

const normalizeCode = (code) => String(code || "").replace(/\s+/g, "");
const isCodeFormat = (code) => /^\d{6}$/.test(normalizeCode(code));

// Creates (or reuses) the pending Google Authenticator secret and returns the QR.
// Reusing the temp secret means a refresh does not invalidate a QR the user already scanned.
// Mutates the user - the caller must save().
const getOrCreateSetupSecret = async (user) => {
  let secret = user.twoFactorTempSecret ? decryptSecret(user.twoFactorTempSecret) : null;
  if (!secret) {
    secret = await otplib.generateSecret();
    user.twoFactorTempSecret = encryptSecret(secret);
  }
  const otpauth = await otplib.generateURI({ label: user.email, issuer: ISSUER(), secret });
  const qrCode = await qrcode.toDataURL(otpauth, { margin: 1, width: 240 });
  return { secret, otpauth, qrCode };
};

const isTwoFactorLocked = (user) =>
  !!(user.twoFactorLockUntil && user.twoFactorLockUntil.getTime() > Date.now());

const registerTwoFactorFailure = (user) => {
  user.twoFactorFailedAttempts = (user.twoFactorFailedAttempts || 0) + 1;
  if (user.twoFactorFailedAttempts >= MAX_FAILED_TWO_FACTOR) {
    user.twoFactorLockUntil = new Date(Date.now() + TWO_FACTOR_LOCK_MINUTES * 60 * 1000);
    user.twoFactorFailedAttempts = 0;
  }
};

// Verifies a 6 digit code for this user. `useTempSecret` is used while setting 2FA up.
// Blocks replay: a code (time step) that was already accepted can't be used again.
// Mutates the user (attempt counters / last step) - the caller must save().
// Returns { ok: true } or { ok: false, status, message, code }.
const verifyUserTwoFactorCode = async (user, rawCode, { useTempSecret = false } = {}) => {
  if (isTwoFactorLocked(user)) {
    const minutes = Math.ceil((user.twoFactorLockUntil.getTime() - Date.now()) / 60000);
    return {
      ok: false,
      status: 429,
      code: "TWO_FACTOR_LOCKED",
      message: `Too many wrong codes. Try again in ${minutes} minute${minutes > 1 ? "s" : ""}.`,
    };
  }

  const code = normalizeCode(rawCode);
  if (!isCodeFormat(code)) {
    return {
      ok: false,
      status: 400,
      code: "TWO_FACTOR_INVALID",
      message: "Enter the 6 digit code from Google Authenticator",
    };
  }

  const sealed = useTempSecret ? user.twoFactorTempSecret : user.twoFactorSecret;
  const secret = decryptSecret(sealed);
  if (!secret) {
    return {
      ok: false,
      status: 400,
      code: useTempSecret ? "TWO_FACTOR_SETUP_MISSING" : "TWO_FACTOR_NOT_ENABLED",
      message: useTempSecret ? "2FA setup has not been started" : "Two-factor authentication is not enabled",
    };
  }

  let result;
  try {
    // epochTolerance 30s = accepts the previous / next code too (phone clock drift)
    result = await otplib.verify({ token: code, secret, epochTolerance: 30 });
  } catch (error) {
    result = { valid: false };
  }

  if (!result.valid) {
    registerTwoFactorFailure(user);
    return { ok: false, status: 400, code: "TWO_FACTOR_INVALID", message: "Invalid verification code" };
  }

  if (user.lastTotpTimeStep && result.timeStep <= user.lastTotpTimeStep) {
    return {
      ok: false,
      status: 400,
      code: "TWO_FACTOR_REUSED",
      message: "This code was already used. Wait for the next code.",
    };
  }

  user.lastTotpTimeStep = result.timeStep;
  user.twoFactorFailedAttempts = 0;
  user.twoFactorLockUntil = undefined;
  return { ok: true };
};

// Turns the verified temp secret into the active secret.
const activateTwoFactor = (user) => {
  user.twoFactorSecret = user.twoFactorTempSecret;
  user.twoFactorTempSecret = undefined;
  user.isTwoFactorEnabled = true;
  user.twoFactorEnabledAt = new Date();
};

const clearTwoFactor = (user) => {
  user.twoFactorSecret = undefined;
  user.twoFactorTempSecret = undefined;
  user.isTwoFactorEnabled = false;
  user.twoFactorEnabledAt = undefined;
  user.lastTotpTimeStep = undefined;
  user.twoFactorFailedAttempts = 0;
  user.twoFactorLockUntil = undefined;
};

module.exports = {
  getOrCreateSetupSecret,
  verifyUserTwoFactorCode,
  activateTwoFactor,
  clearTwoFactor,
  isCodeFormat,
  normalizeCode,
};
