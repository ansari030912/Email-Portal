const express = require("express");
const router = express.Router();

const ActivityLog = require("../models/activityLog");
const portalAuthMiddleware = require("../middleware/portalAuthMiddleware");
const requireRole = require("../middleware/requireRole");
const { sendError, sendSuccess, escapeRegex, parsePagination } = require("../utils/apiResponse");
const { ROLES } = require("../config/constants");

router.use(portalAuthMiddleware, requireRole(ROLES.SUPER_ADMIN));

// ---------------------------------------------------------------------------
// GET /activity-logs/getActivityLogs?action=&search=&page=&limit=
// ---------------------------------------------------------------------------
router.get("/getActivityLogs", async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query, 30, 100);
    const filter = {};
    if (req.query.action) filter.action = String(req.query.action);
    const search = String(req.query.search || "").trim();
    if (search) {
      const rx = new RegExp(escapeRegex(search), "i");
      filter.$or = [{ actorEmail: rx }, { action: rx }, { "details.email": rx }, { ip: rx }];
    }
    const [logs, total, actions] = await Promise.all([
      ActivityLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      ActivityLog.countDocuments(filter),
      ActivityLog.distinct("action"),
    ]);
    return sendSuccess(res, {
      logs: logs.map((l) => ({ ...l, _id: String(l._id) })),
      actions: actions.sort(),
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (error) {
    console.error("getActivityLogs error:", error);
    return sendError(res, 500, "Internal server error");
  }
});

module.exports = router;
