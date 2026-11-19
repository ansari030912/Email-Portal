const crypto = require("crypto");

// No 0/O/1/I/L - easy to read out loud or type from a screenshot
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

// e.g. "K7QF-2MXP-9TRA" (12 random chars, ~59 bits)
const generateInviteCode = () => {
  const bytes = crypto.randomBytes(12);
  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
  return chars.match(/.{4}/g).join("-");
};

// Accepts any spacing / dashes / case the user typed
const normalizeInviteCode = (code) => String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

// Stored hash: HMAC so a database leak alone doesn't reveal or allow guessing codes
const hashInviteCode = (code) =>
  crypto
    .createHmac("sha256", process.env.DATA_ENCRYPTION_KEY || process.env.SERVICE_JWT_SECRET)
    .update(normalizeInviteCode(code))
    .digest("hex");

module.exports = { generateInviteCode, normalizeInviteCode, hashInviteCode };
