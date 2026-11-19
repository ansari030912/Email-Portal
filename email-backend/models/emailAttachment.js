const mongoose = require("mongoose");

// Attachment bytes live in their own collection so a big file never pushes the
// email document over MongoDB's 16 MB limit and inbox lists stay fast.
const emailAttachmentSchema = new mongoose.Schema(
  {
    emailId: { type: mongoose.Schema.Types.ObjectId, ref: "Email", index: true },
    filename: { type: String },
    contentType: { type: String },
    size: { type: Number },
    data: { type: Buffer, required: true },
  },
  { timestamps: true, collection: "emailattachments" }
);

module.exports = mongoose.model("EmailAttachment", emailAttachmentSchema);
