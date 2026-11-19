/**
 * Server-side 2FA recovery (e.g. the Super Admin lost their phone - nobody above them
 * can reset it from the portal). Clears 2FA + signs the account out everywhere; the
 * user sets Google Authenticator up again at the next login.
 *   node scripts/resetUserTwoFactor.js howrex95@gmail.com
 */
require("dotenv").config();
require("../config/dnsFix");
const mongoose = require("mongoose");
const PortalUser = require("../models/portalUser");
const ActivityLog = require("../models/activityLog");
const { clearTwoFactor } = require("../utils/twoFactor");

(async () => {
  const email = String(process.argv[2] || "").trim().toLowerCase();
  if (!email) {
    console.log("Usage: node scripts/resetUserTwoFactor.js <email>");
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URL);
  const user = await PortalUser.findOne({ email }).select(PortalUser.SECURE_FIELDS);
  if (!user) {
    console.log(`No portal account for ${email}`);
    process.exit(1);
  }
  clearTwoFactor(user);
  user.tokenVersion = (user.tokenVersion || 1) + 1;
  user.activeSessionId = undefined;
  user.loginChallengeId = undefined;
  await user.save();
  await ActivityLog.create({
    action: "USER_TWO_FACTOR_RESET",
    targetType: "PortalUser",
    targetId: String(user._id),
    details: { email, by: "server script" },
  });
  console.log(`2FA reset for ${email} (${user.role}). They set it up again at the next login.`);
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
