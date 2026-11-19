const crypto = require("crypto");
const IngestClient = require("../models/ingestClient");
const { encryptSecret } = require("./secretBox");

const PROJECT_KEY_RULE = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;

const generateKeyPair = () => {
  const keyId = `imk_${crypto.randomBytes(9).toString("hex")}`;
  const secret = `ims_${crypto.randomBytes(32).toString("base64url")}`;
  return { keyId, secret };
};

// Creates a project that may push emails. The plain secret is returned ONCE.
const createIngestClient = async ({ name, projectKey, createdBy }) => {
  const key = String(projectKey || "").trim().toLowerCase();
  if (!PROJECT_KEY_RULE.test(key)) {
    throw Object.assign(new Error("Project key: 3-50 chars, lowercase letters, numbers and dashes"), { status: 400 });
  }
  if (!String(name || "").trim()) throw Object.assign(new Error("Project name is required"), { status: 400 });
  if (await IngestClient.exists({ projectKey: key })) {
    throw Object.assign(new Error("A project with this key already exists"), { status: 409 });
  }
  const { keyId, secret } = generateKeyPair();
  const client = await IngestClient.create({
    name: String(name).trim().slice(0, 80),
    projectKey: key,
    keyId,
    secretEncrypted: encryptSecret(secret),
    secretPreview: secret.slice(-4),
    createdBy: createdBy || null,
  });
  return { client, keyId, secret };
};

const rotateIngestClientSecret = async (client) => {
  const { secret } = generateKeyPair();
  client.secretEncrypted = encryptSecret(secret);
  client.secretPreview = secret.slice(-4);
  client.secretRotatedAt = new Date();
  await client.save();
  return secret;
};

module.exports = { createIngestClient, rotateIngestClientSecret };
