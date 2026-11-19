const mongoose = require("mongoose");

// Registration is invite-only: the SuperAdmin creates a referral for ONE email.
// The code is shown once and stored only as an HMAC hash.
const inviteSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, trim: true, lowercase: true, index: true },
    codeHash: { type: String, required: true, unique: true, select: false },
    codeHint: { type: String }, // last 2 characters - so people can tell codes apart
    status: { type: String, enum: ["pending", "used", "revoked"], default: "pending", index: true },
    expiresAt: { type: Date, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "PortalUser" },
    usedAt: { type: Date },
    usedBy: { type: mongoose.Schema.Types.ObjectId, ref: "PortalUser" },
    revokedAt: { type: Date },
    revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: "PortalUser" },
  },
  { timestamps: true, collection: "invites" }
);

inviteSchema.index({ createdAt: -1 });

// "expired" is computed (a pending invite past its expiry date)
inviteSchema.statics.effectiveStatus = (invite) =>
  invite.status === "pending" && new Date(invite.expiresAt).getTime() <= Date.now() ? "expired" : invite.status;

module.exports = mongoose.model("Invite", inviteSchema);
