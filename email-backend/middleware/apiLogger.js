const ApiLog = require("../models/apiLog");
const { getRequestMeta } = require("../utils/requestInfo");

// Logs EVERY API call (request + response) to the "apilogs" collection.
// - Secrets are never stored (passwords, 2FA codes, tokens, project secrets, referral codes ...)
// - Emails pushed by projects (save-email API) are stored complete, exactly as sent
// - Runs after the response is sent, so logging can never slow down or break a request

const SKIP_PATHS = new Set(["/", "/health", "/healthz", "/favicon.ico"]);

const SENSITIVE_KEYS = new Set(
  [
    "password", "currentPassword", "newPassword", "confirmPassword",
    "twoFactorCode", "otp", "challengeToken", "token", "accessToken", "refreshToken",
    "secret", "secretEncrypted", "manualKey", "qrCode", "otpauth",
    "inviteCode", "codeHash", "apiKey", "authorization", "cookie", "set-cookie",
    "x-portal-signature", "contentBase64", "content",
  ].map((k) => k.toLowerCase())
);

// "code" holds secrets (6 digit 2FA code, referral code) but also readable error codes
// like "TWO_FACTOR_INVALID" - hide only the secret-looking ones.
const SECRET_CODE = /^(\d{6}|[A-Z0-9]{4}-?[A-Z0-9]{4}-?[A-Z0-9]{4})$/i;
const isSensitive = (key, val) => {
  if (val === undefined || val === null || val === "") return false;
  const k = key.toLowerCase();
  if (k === "code") return typeof val === "string" && SECRET_CODE.test(val.trim());
  return SENSITIVE_KEYS.has(k);
};

const MAX_STRING = 2000; // characters kept per string value
const MAX_DEPTH = 6;
const MAX_ARRAY = 50;

// Deep copy with secrets replaced and long values trimmed.
// opts.maxString: characters kept per string (Infinity = keep everything)
// opts.keep:      keys that are never hidden (e.g. attachment content of an email payload)
const redact = (value, depth = 0, opts = {}) => {
  const maxString = opts.maxString ?? MAX_STRING;
  const maxDepth = opts.maxDepth ?? MAX_DEPTH;
  const maxArray = opts.maxArray ?? MAX_ARRAY;
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return value.length > maxString ? `${value.slice(0, maxString)}… [${value.length} chars]` : value;
  if (typeof value !== "object") return value;
  if (Buffer.isBuffer(value)) return `[binary ${value.length} bytes]`;
  if (depth >= maxDepth) return "[…]";
  if (Array.isArray(value)) {
    const list = value.slice(0, maxArray).map((v) => redact(v, depth + 1, opts));
    if (value.length > maxArray) list.push(`[+${value.length - maxArray} more]`);
    return list;
  }
  const out = {};
  for (const [key, val] of Object.entries(value)) {
    // "$" / "." are not allowed in Mongo field names
    const safeKey = key.replace(/^\$/, "＄").replace(/\./g, "．");
    const hide = !opts.keep?.has(key) && isSensitive(key, val);
    out[safeKey] = hide ? "[REDACTED]" : redact(val, depth + 1, opts);
  }
  return out;
};

// The save-email payload is stored COMPLETE, exactly as the project sent it (full html,
// text, template data, headers, attachments incl. their base64 content).
// A MongoDB document can't exceed 16 MB, so only if the payload is bigger than
// ~12 MB the attachment bytes are replaced by a note - everything else stays complete.
const MAX_FULL_LOG_BYTES = 12 * 1024 * 1024;
const INGEST_KEEP = new Set(["content", "contentBase64"]);
const fullIngestBody = (body) => {
  if (!body || typeof body !== "object") return body;
  const full = redact(body, 0, { maxString: Infinity, maxDepth: 30, maxArray: 1000, keep: INGEST_KEEP });
  if (JSON.stringify(full).length <= MAX_FULL_LOG_BYTES) return full;

  const mail = full.mail && typeof full.mail === "object" ? full.mail : full;
  if (Array.isArray(mail.attachments)) {
    mail.attachments = mail.attachments.map((a) => {
      if (!a || typeof a !== "object") return a;
      const copy = { ...a };
      for (const k of ["contentBase64", "content"]) {
        if (typeof copy[k] === "string") {
          const bytes = k === "contentBase64" ? Math.floor((copy[k].length * 3) / 4) : copy[k].length;
          copy[k] = `[${(bytes / 1024 / 1024).toFixed(1)} MB - stored with the email]`;
        }
      }
      return copy;
    });
  }
  return full;
};

const apiLogger = (req, res, next) => {
  const path = (req.originalUrl || req.url || "").split("?")[0];
  if (req.method === "OPTIONS" || SKIP_PATHS.has(path)) return next();
  // reading the logs page must not flood the logs with its own GET calls
  if (req.method === "GET" && path.startsWith("/api-logs/")) return next();

  const started = process.hrtime.bigint();
  let responseBody;

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    responseBody = body;
    return originalJson(body);
  };

  res.on("finish", () => {
    // fire and forget - never awaited by the request
    setImmediate(async () => {
      try {
        const isIngest = path.startsWith("/email-ingest");
        const meta = getRequestMeta(req);
        const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
        const failed = res.statusCode >= 400;

        const responseHeaders = typeof res.getHeaders === "function" ? res.getHeaders() : {};
        await ApiLog.create({
          method: req.method,
          path,
          url: (req.originalUrl || "").slice(0, 1000),
          fullUrl: `${req.protocol}://${req.get("host") || "localhost"}${req.originalUrl || ""}`.slice(0, 1200),
          requestHeaders: redact({ ...req.headers }),
          responseHeaders: redact({ ...responseHeaders }),
          responseSize: Number(responseHeaders["content-length"] || 0),
          route: `/${path.split("/")[1] || ""}`,
          status: res.statusCode,
          durationMs: Math.round(durationMs * 10) / 10,
          ip: isIngest ? req.ingestRequestIp || meta.ip : meta.ip,
          userAgent: meta.userAgent,
          origin: req.headers.origin || req.headers.referer || null,
          userId: req.user?._id || null,
          userEmail: req.user?.email || null,
          userRole: req.user?.role || null,
          projectKey: req.ingestClient?.projectKey || null,
          query: req.query && Object.keys(req.query).length ? redact(req.query) : null,
          requestBody: req.body && Object.keys(req.body).length ? (isIngest ? fullIngestBody(req.body) : redact(req.body)) : null,
          responseBody: responseBody === undefined ? null : redact(responseBody),
          requestSize: Number(req.headers["content-length"] || 0),
          errorMessage: failed && responseBody && typeof responseBody === "object" ? String(responseBody.message || "").slice(0, 500) || null : null,
        });
      } catch (error) {
        console.error("api log failed:", error.message);
      }
    });
  });

  next();
};

module.exports = apiLogger;
module.exports.redact = redact;
