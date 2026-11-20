require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const mongoSanitize = require("express-mongo-sanitize");

const connectDB = require("./config/db");
const { MAX_INGEST_BODY } = require("./config/constants");
const csrfGuard = require("./middleware/csrfGuard");
const { apiLimiter } = require("./middleware/rateLimiters");

const userAuth = require("./routes/userAuth");
const googleAuth2fa = require("./routes/googleAuth2fa");
const userManagement = require("./routes/userManagement");
const recipientMailbox = require("./routes/recipientMailbox");
const emailInbox = require("./routes/emailInbox");
const emailIngest = require("./routes/emailIngest");
const ingestClients = require("./routes/ingestClients");
const activityLogs = require("./routes/activityLogs");
const inviteReferral = require("./routes/inviteReferral");
const apiLogs = require("./routes/apiLogs");
const apiLogger = require("./middleware/apiLogger");

const REQUIRED_ENV = ["MONGODB_URL", "APP_SECRET", "PRIVATE_PEM", "PUBLIC_PEM", "SERVICE_JWT_SECRET", "DATA_ENCRYPTION_KEY"];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing env: ${missing.join(", ")}`);
  process.exit(1);
}

(async () => {
  await connectDB();

  const app = express();
  const port = process.env.PORT || 5050;
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(
    helmet({
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: "same-site" },
      referrerPolicy: { policy: "no-referrer" },
    })
  );

  // ---------------- API logs: every call (request + response) -> "apilogs" ----------------
  // Mounted before every route so nothing is missed; secrets are redacted.
  app.use(apiLogger);

  // ---------------- Health ----------------
  const health = (req, res) =>
    res.status(200).json({ status: "ok", service: "im-email-portal-backend", timestamp: new Date().toISOString() });
  app.get("/", (req, res) => res.send("InvoiceMate Email Portal API"));
  app.get("/health", health);
  app.get("/healthz", health);

  // ---------------- Project -> portal (server to server, HMAC signed) ----------------
  // Own JSON parser with a big limit + raw body for signature checks. No CORS: never called by a browser.
  app.use(
    "/email-ingest",
    express.json({
      limit: MAX_INGEST_BODY,
      verify: (req, res, buf) => {
        req.rawBody = buf;
      },
    }),
    emailIngest
  );

  // ---------------- Browser -> portal ----------------
  const allowedOrigins = String(process.env.FRONTEND_URLS || "")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);

  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
        return cb(null, false);
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE"],
      allowedHeaders: ["Content-Type", "X-Requested-With"],
      maxAge: 600,
    })
  );
  app.use(cookieParser());
  app.use(express.json({ limit: "1mb" }));
  app.use(mongoSanitize());
  app.use(csrfGuard);
  app.use(apiLimiter);

  app.use("/auth", userAuth);
  app.use("/google-auth-2fa", googleAuth2fa);
  app.use("/user-management", userManagement);
  app.use("/recipient-mailbox", recipientMailbox);
  app.use("/email-inbox", emailInbox);
  app.use("/ingest-clients", ingestClients);
  app.use("/activity-logs", activityLogs);
  app.use("/invite-referral", inviteReferral);
  app.use("/api-logs", apiLogs);

  // ---------------- 404 + errors ----------------
  app.use((req, res) => res.status(404).json({ success: false, message: "Route not found" }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === "entity.too.large") {
      return res.status(413).json({ success: false, message: "Request body is too large" });
    }
    if (err.type === "entity.parse.failed") {
      return res.status(400).json({ success: false, message: "Invalid JSON body" });
    }
    console.error("Unhandled error:", err);
    return res.status(500).json({ success: false, message: "Internal server error" });
  });

  app.listen(port, () => console.log(`Email Portal API running at http://localhost:${port}`));
})();
