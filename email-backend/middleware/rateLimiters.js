const { rateLimit, ipKeyGenerator } = require("express-rate-limit");

const message = (text) => ({ success: false, message: text, code: "RATE_LIMITED" });

// Login: 10 tries / 15 min per IP + email (account lockout after 5 wrong passwords is separate)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip)}_${String(req.body?.email || "").toLowerCase()}`,
  message: message("Too many login attempts. Please wait 15 minutes."),
});

// Account creation: 5 / hour per IP
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: message("Too many accounts created from this network. Try again later."),
});

// 2FA codes: 15 / 5 min per IP (per-user lock after 5 wrong codes is separate)
const twoFactorLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 15,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: message("Too many verification attempts. Please wait a few minutes."),
});

// Everything else a logged-in user does
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: message("Too many requests. Slow down a little."),
});

// Projects pushing emails: 600 / minute per key
const ingestLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 600,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => String(req.headers["x-portal-key-id"] || ipKeyGenerator(req.ip)),
  message: message("Too many emails pushed in one minute"),
});

module.exports = { loginLimiter, registerLimiter, twoFactorLimiter, apiLimiter, ingestLimiter };
