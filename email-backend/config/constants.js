// Portal roles. Only three exist - nobody can be promoted to SuperAdmin from the API.
const ROLES = Object.freeze({
  SUPER_ADMIN: "SuperAdmin",
  ADMIN: "Admin",
  USER: "User",
});

const ALL_ROLES = Object.values(ROLES);

// Roles that MUST use Google Authenticator - login is refused until it is set up.
const TWO_FACTOR_REQUIRED_ROLES = [ROLES.SUPER_ADMIN, ROLES.ADMIN];

// Roles the SuperAdmin is allowed to give to someone else.
const ASSIGNABLE_ROLES = [ROLES.ADMIN, ROLES.USER];

const SESSION_COOKIE_NAME = "im_mail_session";
const SESSION_HOURS = Number(process.env.SESSION_HOURS || 6);

// Login brute-force protection
const MAX_FAILED_LOGINS = 5;
const LOGIN_LOCK_MINUTES = 15;

// 2FA brute-force protection (login challenge + step-up codes)
const MAX_FAILED_TWO_FACTOR = 5;
const TWO_FACTOR_LOCK_MINUTES = 10;
const LOGIN_CHALLENGE_MINUTES = 5;

// Ingest limits
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB per attachment
const MAX_INGEST_BODY = "30mb";
const SIGNATURE_WINDOW_SECONDS = 300; // signed requests older/newer than 5 min are refused

const requiresTwoFactor = (user) =>
  TWO_FACTOR_REQUIRED_ROLES.includes(user.role) || !!user.isTwoFactorEnabled;

module.exports = {
  ROLES,
  ALL_ROLES,
  TWO_FACTOR_REQUIRED_ROLES,
  ASSIGNABLE_ROLES,
  SESSION_COOKIE_NAME,
  SESSION_HOURS,
  MAX_FAILED_LOGINS,
  LOGIN_LOCK_MINUTES,
  MAX_FAILED_TWO_FACTOR,
  TWO_FACTOR_LOCK_MINUTES,
  LOGIN_CHALLENGE_MINUTES,
  MAX_ATTACHMENT_BYTES,
  MAX_INGEST_BODY,
  SIGNATURE_WINDOW_SECONDS,
  requiresTwoFactor,
};
