const mongoose = require("mongoose");
const { ALL_ROLES, ROLES } = require("../config/constants");

// A person who logs into the email portal (team member).
const portalUserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ALL_ROLES, default: ROLES.USER, index: true },
    isBlocked: { type: Boolean, default: false },

    // Set manually by the SuperAdmin - links this portal member to their mail account.
    mailAccountId: { type: String, default: null, trim: true },
    mailAccountEmail: { type: String, default: null, trim: true, lowercase: true },

    // Google Authenticator (secrets are AES-256-GCM encrypted, never returned by the API)
    isTwoFactorEnabled: { type: Boolean, default: false },
    twoFactorSecret: { type: String, select: false },
    twoFactorTempSecret: { type: String, select: false },
    twoFactorEnabledAt: { type: Date },
    lastTotpTimeStep: { type: Number, select: false },
    twoFactorFailedAttempts: { type: Number, default: 0, select: false },
    twoFactorLockUntil: { type: Date, select: false },

    // Session control: single active session + tokenVersion bump = log out everywhere
    activeSessionId: { type: String, select: false },
    tokenVersion: { type: Number, default: 1 },
    loginChallengeId: { type: String, select: false },

    // Login brute-force protection
    failedLoginAttempts: { type: Number, default: 0, select: false },
    loginLockUntil: { type: Date, select: false },

    lastLoginAt: { type: Date },
    lastLoginIp: { type: String },
    passwordChangedAt: { type: Date },
  },
  { timestamps: true, collection: "portalusers" }
);

// Every field that is `select: false` - used when a route needs the full security state.
portalUserSchema.statics.SECURE_FIELDS =
  "+password +twoFactorSecret +twoFactorTempSecret +lastTotpTimeStep +twoFactorFailedAttempts " +
  "+twoFactorLockUntil +activeSessionId +loginChallengeId +failedLoginAttempts +loginLockUntil";

module.exports = mongoose.model("PortalUser", portalUserSchema);
