const crypto = require("crypto");

// AES-256-GCM encryption for secrets stored at rest (2FA secrets, project ingest secrets).
// Stored format: "v1:<iv b64>:<tag b64>:<data b64>"
const getKey = () => {
  const hex = process.env.DATA_ENCRYPTION_KEY || "";
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("DATA_ENCRYPTION_KEY must be 64 hex characters (32 bytes)");
  }
  return Buffer.from(hex, "hex");
};

const encryptSecret = (plain) => {
  if (plain === undefined || plain === null) return plain;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const data = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${data.toString("base64")}`;
};

const decryptSecret = (sealed) => {
  if (!sealed) return null;
  const parts = String(sealed).split(":");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  try {
    const [, iv, tag, data] = parts;
    const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
  } catch (error) {
    console.error("decryptSecret failed:", error.message);
    return null;
  }
};

// Constant-time compare that never throws on length mismatch
const safeEqual = (a, b) => {
  const ab = Buffer.from(String(a), "utf8");
  const bb = Buffer.from(String(b), "utf8");
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
};

module.exports = { encryptSecret, decryptSecret, safeEqual };
