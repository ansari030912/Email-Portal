const { sendError } = require("../utils/apiResponse");

// Usage: router.get("/x", portalAuthMiddleware, requireRole(ROLES.SUPER_ADMIN), handler)
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return sendError(res, 403, "You don't have permission to do this", { code: "FORBIDDEN" });
  }
  next();
};

module.exports = requireRole;
