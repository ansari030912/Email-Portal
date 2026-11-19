const ActivityLog = require("../models/activityLog");
const { getRequestMeta } = require("./requestInfo");

// Audit trail for every security relevant action. Never throws - logging must not break a request.
const logActivity = async ({ req, actor, action, targetType, targetId, details }) => {
  try {
    const meta = req ? getRequestMeta(req) : {};
    await ActivityLog.create({
      actorId: actor?._id || null,
      actorEmail: actor?.email || null,
      actorRole: actor?.role || null,
      action,
      targetType: targetType || null,
      targetId: targetId ? String(targetId) : null,
      details: details || {},
      ip: meta.ip || null,
      userAgent: meta.userAgent || null,
    });
  } catch (error) {
    console.error("activity log failed:", error.message);
  }
};

module.exports = { logActivity };
