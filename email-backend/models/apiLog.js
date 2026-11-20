const mongoose = require("mongoose");

// API logs are kept for 3 days. MongoDB deletes older documents automatically (TTL index).
const RETENTION_DAYS = 3;

// One document per API call made to the portal backend.
const apiLogSchema = new mongoose.Schema(
  {
    method: { type: String, index: true },
    path: { type: String, index: true }, // without query string
    url: { type: String }, // path incl. query string
    fullUrl: { type: String }, // protocol + host + path + query, e.g. http://localhost:5050/auth/loginUser
    route: { type: String }, // route group, e.g. "/auth", "/email-ingest"
    status: { type: Number, index: true },
    durationMs: { type: Number },

    // caller
    ip: { type: String },
    userAgent: { type: String },
    origin: { type: String },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "PortalUser", default: null, index: true },
    userEmail: { type: String, default: null },
    userRole: { type: String, default: null },
    projectKey: { type: String, default: null, index: true }, // ingest calls: which project pushed it

    // payloads (secrets redacted, big values trimmed)
    query: { type: mongoose.Schema.Types.Mixed, default: null },
    requestBody: { type: mongoose.Schema.Types.Mixed, default: null },
    responseBody: { type: mongoose.Schema.Types.Mixed, default: null },
    requestHeaders: { type: mongoose.Schema.Types.Mixed, default: null },
    responseHeaders: { type: mongoose.Schema.Types.Mixed, default: null },
    requestSize: { type: Number, default: 0 },
    responseSize: { type: Number, default: 0 },
    errorMessage: { type: String, default: null },

    createdAt: { type: Date, default: Date.now, expires: RETENTION_DAYS * 24 * 60 * 60 },
  },
  { collection: "apilogs", versionKey: false }
);

apiLogSchema.index({ createdAt: -1 });
apiLogSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("ApiLog", apiLogSchema);
module.exports.RETENTION_DAYS = RETENTION_DAYS;
