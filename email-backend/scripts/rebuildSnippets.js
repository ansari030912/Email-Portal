/**
 * Recomputes the inbox preview line (snippet) of every saved email.
 *   node scripts/rebuildSnippets.js
 */
require("dotenv").config();
require("../config/dnsFix");
const mongoose = require("mongoose");
const Email = require("../models/email");
const { buildSnippet } = require("../routes/emailIngest");

(async () => {
  await mongoose.connect(process.env.MONGODB_URL);
  let updated = 0;
  for await (const email of Email.find().select("html text snippet").cursor()) {
    const snippet = buildSnippet(email.text, email.html);
    if (snippet !== email.snippet) {
      await Email.updateOne({ _id: email._id }, { $set: { snippet } });
      updated++;
    }
  }
  console.log(`Snippets rebuilt: ${updated}`);
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
