const mongoose = require("mongoose");

const addressSchema = new mongoose.Schema(
  { name: { type: String, default: null }, address: { type: String, required: true } },
  { _id: false }
);

const attachmentMetaSchema = new mongoose.Schema({
  filename: { type: String, default: "attachment" },
  contentType: { type: String, default: "application/octet-stream" },
  size: { type: Number, default: 0 },
  cid: { type: String, default: null },
  contentDisposition: { type: String, default: "attachment" },
  storageId: { type: mongoose.Schema.Types.ObjectId, ref: "EmailAttachment", default: null },
  remoteUrl: { type: String, default: null }, // attachment given as a URL path
  skippedReason: { type: String, default: null },
});

// One captured email - exactly what the project's email service was about to send.
const emailSchema = new mongoose.Schema(
  {
    // Trusted - comes from the signed ingest client, not from the payload
    project: {
      clientId: { type: mongoose.Schema.Types.ObjectId, ref: "IngestClient" },
      key: { type: String, index: true },
      name: { type: String },
    },

    // Where the email came from (sent by the project + what we saw on the request)
    source: {
      environment: { type: String, default: null },
      service: { type: String, default: null },
      appUrl: { type: String, default: null },
      domain: { type: String, default: null },
      serverHostname: { type: String, default: null },
      serverIps: [{ type: String }],
      requestIp: { type: String, default: null },
      userAgent: { type: String, default: null },
      nodeVersion: { type: String, default: null },
      sdkVersion: { type: String, default: null },
      trigger: { type: String, default: null }, // e.g. route / function that sent it
    },

    messageId: { type: String, required: true },
    idempotencyKey: { type: String, default: null },

    from: { type: addressSchema, default: null },
    sender: { type: addressSchema, default: null },
    replyTo: { type: [addressSchema], default: [] },
    to: { type: [addressSchema], default: [] },
    cc: { type: [addressSchema], default: [] },
    bcc: { type: [addressSchema], default: [] },
    // lowercase union of to/cc/bcc - used for access control & mailbox queries
    recipientAddresses: [{ type: String }],

    subject: { type: String, default: "(no subject)" },
    html: { type: String, default: null },
    text: { type: String, default: null },
    snippet: { type: String, default: "" },
    templateName: { type: String, default: null },
    templateDataJson: { type: String, default: null }, // original template variables (JSON text)
    headersJson: { type: String, default: null },
    priority: { type: String, default: "normal" },

    attachments: { type: [attachmentMetaSchema], default: [] },
    sizeBytes: { type: Number, default: 0 },

    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "PortalUser" }],
    starredBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "PortalUser" }],

    sentAt: { type: Date, default: Date.now }, // when the project tried to send it
  },
  { timestamps: true, collection: "emails" }
);

emailSchema.index({ recipientAddresses: 1, sentAt: -1 });
emailSchema.index({ sentAt: -1 });
emailSchema.index(
  { "project.clientId": 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } }
);

module.exports = mongoose.model("Email", emailSchema);
