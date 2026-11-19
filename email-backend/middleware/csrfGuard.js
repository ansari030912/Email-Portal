const { sendError } = require("../utils/apiResponse");

// Session cookie is SameSite=Strict. On top of that, every state-changing portal
// request must carry this custom header. Browsers can't add custom headers to a
// cross-site form post, and CORS preflight blocks other origins from adding it.
const CSRF_HEADER = "x-requested-with";
const CSRF_VALUE = "EmailPortal";

const csrfGuard = (req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (req.headers[CSRF_HEADER] !== CSRF_VALUE) {
    return sendError(res, 403, "Request blocked", { code: "CSRF_BLOCKED" });
  }
  next();
};

module.exports = csrfGuard;
