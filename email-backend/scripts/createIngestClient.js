/**
 * Connects a project to the portal and prints its credentials (shown only once).
 *   node scripts/createIngestClient.js <project-key> "<Project Name>"
 *   node scripts/createIngestClient.js defa-s2-be "DeFa S2 Backend"
 * The SuperAdmin can do the same from the portal UI (Projects page).
 */
require("dotenv").config();
require("../config/dnsFix");
const mongoose = require("mongoose");
const { createIngestClient } = require("../utils/ingestKeys");

(async () => {
  const [projectKey, name] = process.argv.slice(2);
  if (!projectKey || !name) {
    console.log('Usage: node scripts/createIngestClient.js <project-key> "<Project Name>"');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URL);
  const { client, keyId, secret } = await createIngestClient({ name, projectKey });
  console.log(`\nProject "${client.name}" (${client.projectKey}) connected.\nAdd to the project's beta env:\n`);
  console.log("EMAIL_DELIVERY_MODE=portal");
  console.log("EMAIL_PORTAL_URL=<portal backend url>");
  console.log(`EMAIL_PORTAL_KEY_ID=${keyId}`);
  console.log(`EMAIL_PORTAL_SECRET=${secret}\n`);
  await mongoose.disconnect();
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
