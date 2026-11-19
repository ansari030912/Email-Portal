const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { SESSION_COOKIE_NAME, SESSION_HOURS, LOGIN_CHALLENGE_MINUTES } = require("../config/constants");
const { getClientIp } = require("./requestInfo");

const ISSUER = "im-email-portal";
const pem = (value) => String(value || "").replace(/\\n/g, "\n");

// Single-session login (same idea as DEFA utils/session.js): every login stores
// a fresh id on the user and puts it in the JWT. A later login overwrites it,
// so the older token stops matching and that session is logged out.
const newSessionId = () => crypto.randomBytes(16).toString("hex");

const signSessionToken = (user) =>
  jwt.sign(
    {
      userId: String(user._id),
      role: user.role,
      sessionId: user.activeSessionId,
      tokenVersion: user.tokenVersion || 1,
      type: "session",
    },
    { key: pem(process.env.PRIVATE_PEM), passphrase: process.env.APP_SECRET },
    { algorithm: "RS256", expiresIn: `${SESSION_HOURS}h`, issuer: ISSUER }
  );

const verifySessionToken = (token) =>
  jwt.verify(token, pem(process.env.PUBLIC_PEM), { algorithms: ["RS256"], issuer: ISSUER });

// Short-lived token handed out after a correct password when a 2FA code is still
// needed. It proves the password step only - it is never accepted as a session.
const signLoginChallenge = ({ userId, challengeId, mode }) =>
  jwt.sign({ userId: String(userId), challengeId, mode, type: "login-2fa" }, process.env.SERVICE_JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: `${LOGIN_CHALLENGE_MINUTES}m`,
    issuer: ISSUER,
    audience: "login-2fa",
  });

const verifyLoginChallenge = (token) =>
  jwt.verify(token, process.env.SERVICE_JWT_SECRET, {
    algorithms: ["HS256"],
    issuer: ISSUER,
    audience: "login-2fa",
  });

const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
  path: "/",
  ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {}),
});

const setSessionCookie = (res, token) =>
  res.cookie(SESSION_COOKIE_NAME, token, { ...cookieOptions(), maxAge: SESSION_HOURS * 60 * 60 * 1000 });

const clearSessionCookie = (res) => res.clearCookie(SESSION_COOKIE_NAME, cookieOptions());

// Issues a brand-new session for the user (logs out any older one) and sets the cookie.
const startNewSession = async (res, user, req) => {
  user.activeSessionId = newSessionId();
  user.lastLoginAt = new Date();
  if (req) user.lastLoginIp = getClientIp(req);
  user.loginChallengeId = undefined;
  await user.save();
  const token = signSessionToken(user);
  setSessionCookie(res, token);
  const { exp } = jwt.decode(token);
  return { expiresAt: new Date(exp * 1000) };
};

module.exports = {
  newSessionId,
  signSessionToken,
  verifySessionToken,
  signLoginChallenge,
  verifyLoginChallenge,
  setSessionCookie,
  clearSessionCookie,
  startNewSession,
};
