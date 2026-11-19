const mongoose = require("mongoose");

// A project (DEFA, PayMate, ...) allowed to push emails into the portal.
// Each one signs its requests with its own secret (HMAC-SHA256).
const ingestClientSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    projectKey: { type: String, required: true, unique: true, trim: true, lowercase: true },
    keyId: { type: String, required: true, unique: true },
    secretEncrypted: { type: String, required: true, select: false },
    secretPreview: { type: String }, // last 4 chars - so people can tell keys apart
    isActive: { type: Boolean, default: true },
    allowedIps: [{ type: String }], // optional IP allow list - empty = any IP
    emailCount: { type: Number, default: 0 },
    lastUsedAt: { type: Date },
    lastUsedIp: { type: String },
    secretRotatedAt: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "PortalUser" },
  },
  { timestamps: true, collection: "ingestclients" }
);

module.exports = mongoose.model("IngestClient", ingestClientSchema);
