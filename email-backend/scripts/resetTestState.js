/**
 * DEV ONLY - wipes captured emails / mailboxes and resets every account's 2FA,
 * sessions and seeded roles. Use before handing the portal to the team.
 *   node scripts/resetTestState.js --yes
 */
require("dotenv").config();
require("../config/dnsFix");
const mongoose = require("mongoose");

(async () => {
  if (!process.argv.includes("--yes")) {
    console.log("This deletes all emails, mailboxes and 2FA setups. Run with --yes to confirm.");
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URL);
  const PortalUser = require("../models/portalUser");
  await PortalUser.updateMany(
    {},
    {
      $unset: { twoFactorSecret: 1, twoFactorTempSecret: 1, lastTotpTimeStep: 1, twoFactorLockUntil: 1, activeSessionId: 1, loginChallengeId: 1, loginLockUntil: 1, twoFactorEnabledAt: 1 },
      $set: { isTwoFactorEnabled: false, twoFactorFailedAttempts: 0, failedLoginAttempts: 0 },
      $inc: { tokenVersion: 1 },
    }
  );
  await require("../models/email").deleteMany({});
  await require("../models/emailAttachment").deleteMany({});
  await require("../models/recipientMailbox").deleteMany({});
  await require("../models/activityLog").deleteMany({});
  await mongoose.disconnect();
  console.log("Reset done. Now run: node scripts/seedPortalUsers.js");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
