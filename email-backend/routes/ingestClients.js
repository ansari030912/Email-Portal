const express = require("express");
const router = express.Router();

const IngestClient = require("../models/ingestClient");
const portalAuthMiddleware = require("../middleware/portalAuthMiddleware");
const requireRole = require("../middleware/requireRole");
const requireTwoFactorCode = require("../middleware/requireTwoFactorCode");
const { createIngestClient, rotateIngestClientSecret } = require("../utils/ingestKeys");
const { logActivity } = require("../utils/activityLogger");
const { sendError, sendSuccess, isValidObjectId } = require("../utils/apiResponse");
const { cleanIp } = require("../utils/requestInfo");
const { ROLES } = require("../config/constants");

// Connected projects (DEFA, PayMate, ... any future project). SuperAdmin only.
router.use(portalAuthMiddleware, requireRole(ROLES.SUPER_ADMIN));

const toClientDto = (c) => ({
  _id: String(c._id),
  name: c.name,
  projectKey: c.projectKey,
  keyId: c.keyId,
  secretPreview: c.secretPreview,
  isActive: c.isActive,
  allowedIps: c.allowedIps || [],
  emailCount: c.emailCount || 0,
  lastUsedAt: c.lastUsedAt,
  lastUsedIp: c.lastUsedIp,
  secretRotatedAt: c.secretRotatedAt,
  createdAt: c.createdAt,
});

const loadClient = async (req, res) => {
  const { clientId } = req.body || {};
  if (!isValidObjectId(String(clientId))) {
    sendError(res, 400, "Invalid project id");
    return null;
  }
  const client = await IngestClient.findById(clientId);
  if (!client) {
    sendError(res, 404, "Project not found");
    return null;
  }
  return client;
};

// ---------------------------------------------------------------------------
// GET /ingest-clients/getAllIngestClients
// ---------------------------------------------------------------------------
router.get("/getAllIngestClients", async (req, res) => {
  try {
    const clients = await IngestClient.find().sort({ createdAt: 1 }).lean();
    return sendSuccess(res, { clients: clients.map(toClientDto) });
  } catch (error) {
    console.error("getAllIngestClients error:", error);
    return sendError(res, 500, "Internal server error");
  }
});

// ---------------------------------------------------------------------------
// POST /ingest-clients/createIngestClient { name, projectKey, twoFactorCode }
// Returns the secret ONE time - it is stored encrypted and never shown again.
// ---------------------------------------------------------------------------
router.post("/createIngestClient", requireTwoFactorCode, async (req, res) => {
  try {
    const { client, keyId, secret } = await createIngestClient({
      name: req.body?.name,
      projectKey: req.body?.projectKey,
      createdBy: req.user._id,
    });
    await logActivity({
      req,
      actor: req.user,
      action: "PROJECT_KEY_CREATED",
      targetType: "IngestClient",
      targetId: client._id,
      details: { projectKey: client.projectKey },
    });
    return sendSuccess(res, { client: toClientDto(client), credentials: { keyId, secret } }, "Project connected", 201);
  } catch (error) {
    if (error.status) return sendError(res, error.status, error.message);
    console.error("createIngestClient error:", error);
    return sendError(res, 500, "Internal server error");
  }
});

// ---------------------------------------------------------------------------
// PUT /ingest-clients/rotateIngestClientSecret { clientId, twoFactorCode }
// ---------------------------------------------------------------------------
router.put("/rotateIngestClientSecret", requireTwoFactorCode, async (req, res) => {
  try {
    const client = await loadClient(req, res);
    if (!client) return;
    const secret = await rotateIngestClientSecret(client);
    await logActivity({
      req,
      actor: req.user,
      action: "PROJECT_KEY_ROTATED",
      targetType: "IngestClient",
      targetId: client._id,
      details: { projectKey: client.projectKey },
    });
    return sendSuccess(
      res,
      { client: toClientDto(client), credentials: { keyId: client.keyId, secret } },
      "New secret generated - update the project's env now"
    );
  } catch (error) {
    console.error("rotateIngestClientSecret error:", error);
    return sendError(res, 500, "Internal server error");
  }
});

// ---------------------------------------------------------------------------
// PUT /ingest-clients/updateIngestClientSettings { clientId, isActive, allowedIps[], twoFactorCode }
// ---------------------------------------------------------------------------
router.put("/updateIngestClientSettings", requireTwoFactorCode, async (req, res) => {
  try {
    const client = await loadClient(req, res);
    if (!client) return;

    if (typeof req.body?.isActive === "boolean") client.isActive = req.body.isActive;
    if (Array.isArray(req.body?.allowedIps)) {
      const ips = req.body.allowedIps.map((ip) => cleanIp(ip)).filter(Boolean);
      if (ips.length > 20 || ips.some((ip) => !/^[0-9a-fA-F:.]{3,45}$/.test(ip))) {
        return sendError(res, 400, "Enter up to 20 valid IP addresses");
      }
      client.allowedIps = [...new Set(ips)];
    }
    await client.save();

    await logActivity({
      req,
      actor: req.user,
      action: "PROJECT_SETTINGS_UPDATED",
      targetType: "IngestClient",
      targetId: client._id,
      details: { projectKey: client.projectKey, isActive: client.isActive, allowedIps: client.allowedIps },
    });
    return sendSuccess(res, { client: toClientDto(client) }, "Project updated");
  } catch (error) {
    console.error("updateIngestClientSettings error:", error);
    return sendError(res, 500, "Internal server error");
  }
});

// ---------------------------------------------------------------------------
// DELETE /ingest-clients/deleteIngestClient { clientId, twoFactorCode }
// Removes the project's key - it can't push emails anymore. Emails it already
// saved stay in the portal (they keep their project name / key).
// ---------------------------------------------------------------------------
router.delete("/deleteIngestClient", requireTwoFactorCode, async (req, res) => {
  try {
    const client = await loadClient(req, res);
    if (!client) return;
    await IngestClient.deleteOne({ _id: client._id });
    await logActivity({
      req,
      actor: req.user,
      action: "PROJECT_DELETED",
      targetType: "IngestClient",
      targetId: client._id,
      details: { projectKey: client.projectKey, name: client.name, emailCount: client.emailCount },
    });
    return sendSuccess(res, { clientId: String(client._id) }, `${client.name} disconnected`);
  } catch (error) {
    console.error("deleteIngestClient error:", error);
    return sendError(res, 500, "Internal server error");
  }
});

module.exports = router;
