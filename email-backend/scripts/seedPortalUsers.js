/**
 * Creates the initial portal accounts (passwords are argon2id hashed).
 *   node scripts/seedPortalUsers.js                 -> creates missing accounts, fixes roles
 *   node scripts/seedPortalUsers.js --reset-passwords -> also resets the passwords below
 */
require("dotenv").config();
require("../config/dnsFix");
const mongoose = require("mongoose");
const PortalUser = require("../models/portalUser");
const Email = require("../models/email");
const RecipientMailbox = require("../models/recipientMailbox");
const IngestClient = require("../models/ingestClient");
const EmailAttachment = require("../models/emailAttachment");
const ActivityLog = require("../models/activityLog");
const { hashPassword } = require("../utils/passwordHash");
const { ROLES } = require("../config/constants");

const DEFAULT_PASSWORD = "Hello@123";

const ACCOUNTS = [
  { name: "Super Admin", email: "howrex95@gmail.com", role: ROLES.SUPER_ADMIN },
  { name: "Admin One", email: "admin@gmail.com", role: ROLES.ADMIN },
  { name: "Admin Two", email: "admin2@gmail.com", role: ROLES.ADMIN },
  { name: "User One", email: "user@gmail.com", role: ROLES.USER },
  { name: "User Two", email: "user2@gmail.com", role: ROLES.USER },
];

(async () => {
  const resetPasswords = process.argv.includes("--reset-passwords");
  await mongoose.connect(process.env.MONGODB_URL);
  console.log("Connected to im-emails");

  // make sure all indexes exist
  for (const model of [PortalUser, Email, RecipientMailbox, IngestClient, EmailAttachment, ActivityLog]) {
    await model.syncIndexes();
  }

  for (const account of ACCOUNTS) {
    const existing = await PortalUser.findOne({ email: account.email });
    if (!existing) {
      await PortalUser.create({
        ...account,
        password: await hashPassword(DEFAULT_PASSWORD),
        passwordChangedAt: new Date(),
      });
      console.log(`created  ${account.role.padEnd(10)} ${account.email}`);
      continue;
    }
    const changes = [];
    if (existing.role !== account.role) {
      existing.role = account.role;
      existing.tokenVersion = (existing.tokenVersion || 1) + 1;
      changes.push(`role -> ${account.role}`);
    }
    if (resetPasswords) {
      existing.password = await hashPassword(DEFAULT_PASSWORD);
      existing.passwordChangedAt = new Date();
      existing.tokenVersion = (existing.tokenVersion || 1) + 1;
      changes.push("password reset");
    }
    if (changes.length) await existing.save();
    console.log(`exists   ${account.role.padEnd(10)} ${account.email}${changes.length ? ` (${changes.join(", ")})` : ""}`);
  }

  await mongoose.disconnect();
  console.log("Done.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
