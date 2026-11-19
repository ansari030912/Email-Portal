const crypto = require("crypto");
const IngestClient = require("../models/ingestClient");
const { decryptSecret, safeEqual } = require("../utils/secretBox");
const { getClientIp } = require("../utils/requestInfo");
const { SIGNATURE_WINDOW_SECONDS } = require("../config/constants");

// Server-to-server auth for projects pushing emails (same idea as DEFA verifyHmac,
// plus a timestamp so a captured request can't be replayed later).
//
// Headers the project sends:
//   x-portal-key-id     the project's public key id (imk_...)
//   x-portal-timestamp  unix seconds when the request was signed
//   x-portal-signature  hex HMAC-SHA256(secret, `${timestamp}.${rawBody}`)
const UNAUTHORIZED = { success: false, message: "Unauthorized" };

const verifyIngestSignature = async (req, res, next) => {
  try {
    const keyId = req.headers["x-portal-key-id"];
    const timestamp = req.headers["x-portal-timestamp"];
    const signature = req.headers["x-portal-signature"];
    if (!keyId || !timestamp || !signature) return res.status(401).json(UNAUTHORIZED);

    const ts = Number(timestamp);
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isFinite(ts) || Math.abs(now - ts) > SIGNATURE_WINDOW_SECONDS) {
      return res.status(401).json({ ...UNAUTHORIZED, message: "Request expired - check the server clock" });
    }

    const client = await IngestClient.findOne({ keyId: String(keyId) }).select("+secretEncrypted");
    if (!client || !client.isActive) return res.status(401).json(UNAUTHORIZED);

    const secret = decryptSecret(client.secretEncrypted);
    if (!secret) return res.status(401).json(UNAUTHORIZED);

    const body = req.rawBody ? req.rawBody.toString("utf8") : "";
    const expected = crypto.createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
    if (!safeEqual(expected, String(signature))) return res.status(401).json(UNAUTHORIZED);

    const ip = getClientIp(req);
    if (client.allowedIps?.length && !client.allowedIps.includes(ip)) {
      return res.status(403).json({ success: false, message: "IP not allowed for this project" });
    }

    req.ingestClient = client;
    req.ingestRequestIp = ip;
    next();
  } catch (error) {
    console.error("verifyIngestSignature error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

module.exports = verifyIngestSignature;
