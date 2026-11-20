const express = require("express");
const router = express.Router();

const ApiLog = require("../models/apiLog");
const portalAuthMiddleware = require("../middleware/portalAuthMiddleware");
const requireRole = require("../middleware/requireRole");
const { sendError, sendSuccess, isValidObjectId, escapeRegex, parsePagination } = require("../utils/apiResponse");
const { ROLES } = require("../config/constants");

// API logs are SuperAdmin only
router.use(portalAuthMiddleware, requireRole(ROLES.SUPER_ADMIN));

const buildFilter = (q) => {
  const filter = {};
  if (q.method) filter.method = String(q.method).toUpperCase();
  if (q.status === "2xx") filter.status = { $gte: 200, $lt: 300 };
  else if (q.status === "3xx") filter.status = { $gte: 300, $lt: 400 };
  else if (q.status === "4xx") filter.status = { $gte: 400, $lt: 500 };
  else if (q.status === "5xx") filter.status = { $gte: 500 };
  else if (q.status === "errors") filter.status = { $gte: 400 };
  if (q.route) filter.route = String(q.route);
  if (q.project) filter.projectKey = String(q.project);
  const search = String(q.search || "").trim();
  if (search) {
    const rx = new RegExp(escapeRegex(search), "i");
    filter.$or = [{ path: rx }, { userEmail: rx }, { ip: rx }, { errorMessage: rx }, { projectKey: rx }];
  }
  if (q.from || q.to) {
    filter.createdAt = {};
    if (q.from && !Number.isNaN(Date.parse(q.from))) filter.createdAt.$gte = new Date(q.from);
    if (q.to && !Number.isNaN(Date.parse(q.to))) filter.createdAt.$lte = new Date(q.to);
  }
  return filter;
};

const LIST_FIELDS = "method path route status durationMs ip userEmail userRole projectKey errorMessage createdAt";

// ---------------------------------------------------------------------------
// GET /api-logs/getApiLogs?method=&status=2xx|4xx|5xx|errors&route=&project=&search=&from=&to=&page=&limit=
// ---------------------------------------------------------------------------
router.get("/getApiLogs", async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query, 25, 100);
    const filter = buildFilter(req.query);
    const [logs, total] = await Promise.all([
      ApiLog.find(filter).select(LIST_FIELDS).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      ApiLog.countDocuments(filter),
    ]);
    return sendSuccess(res, {
      logs: logs.map((l) => ({ ...l, _id: String(l._id) })),
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (error) {
    console.error("getApiLogs error:", error);
    return sendError(res, 500, "Internal server error");
  }
});

// ---------------------------------------------------------------------------
// GET /api-logs/getApiLogById/:logId - full request / response of one call
// ---------------------------------------------------------------------------
router.get("/getApiLogById/:logId", async (req, res) => {
  try {
    if (!isValidObjectId(req.params.logId)) return sendError(res, 400, "Invalid log id");
    const log = await ApiLog.findById(req.params.logId).lean();
    if (!log) return sendError(res, 404, "Log not found");
    return sendSuccess(res, { log: { ...log, _id: String(log._id) } });
  } catch (error) {
    console.error("getApiLogById error:", error);
    return sendError(res, 500, "Internal server error");
  }
});

// ---------------------------------------------------------------------------
// GET /api-logs/getApiLogStats - last 24 hours overview + filter options
// ---------------------------------------------------------------------------
router.get("/getApiLogStats", async (req, res) => {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [overall, slowest, routes, projects] = await Promise.all([
      ApiLog.aggregate([
        { $match: { createdAt: { $gte: since } } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            errors: { $sum: { $cond: [{ $gte: ["$status", 400] }, 1, 0] } },
            serverErrors: { $sum: { $cond: [{ $gte: ["$status", 500] }, 1, 0] } },
            avgMs: { $avg: "$durationMs" },
          },
        },
      ]),
      ApiLog.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: { method: "$method", path: "$path" }, avgMs: { $avg: "$durationMs" }, calls: { $sum: 1 } } },
        { $sort: { avgMs: -1 } },
        { $limit: 1 },
      ]),
      ApiLog.distinct("route"),
      ApiLog.distinct("projectKey"),
    ]);
    const o = overall[0] || { total: 0, errors: 0, serverErrors: 0, avgMs: 0 };
    return sendSuccess(res, {
      stats: {
        total24h: o.total,
        errors24h: o.errors,
        serverErrors24h: o.serverErrors,
        errorRate24h: o.total ? Math.round((o.errors / o.total) * 1000) / 10 : 0,
        avgMs24h: Math.round((o.avgMs || 0) * 10) / 10,
        slowest: slowest[0] ? { method: slowest[0]._id.method, path: slowest[0]._id.path, avgMs: Math.round(slowest[0].avgMs) } : null,
        retentionDays: ApiLog.RETENTION_DAYS,
      },
      routes: routes.filter(Boolean).sort(),
      projects: projects.filter(Boolean).sort(),
    });
  } catch (error) {
    console.error("getApiLogStats error:", error);
    return sendError(res, 500, "Internal server error");
  }
});

module.exports = router;
