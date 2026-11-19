const mongoose = require("mongoose");

// One document per address that ever appeared in to / cc / bcc ("toEmails" collection).
// user_id is empty until the SuperAdmin assigns the address to one or more portal users.
// Emails of an address are visible ONLY to the users in user_id - nobody else, not even
// the SuperAdmin, unless they are assigned too.
const recipientMailboxSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    displayName: { type: String, default: null },
    user_id: [{ type: mongoose.Schema.Types.ObjectId, ref: "PortalUser" }],

    // Linked account in the source project (DEFA user / PayMate admin ...) - last one seen
    sourceUserId: { type: String, default: null },
    sourceUserType: { type: String, default: null },

    projects: [{ type: String }], // project keys this address received mail from
    emailCount: { type: Number, default: 0 },
    firstEmailAt: { type: Date },
    lastEmailAt: { type: Date },
    assignedAt: { type: Date },
  },
  { timestamps: true, collection: "toEmails" }
);

recipientMailboxSchema.index({ user_id: 1 });
recipientMailboxSchema.index({ lastEmailAt: -1 });

module.exports = mongoose.model("RecipientMailbox", recipientMailboxSchema);
