const PortalUser = require("../models/portalUser");
const { verifySessionToken, clearSessionCookie } = require("../utils/jwtSession");
const { SESSION_COOKIE_NAME } = require("../config/constants");
const { sendError } = require("../utils/apiResponse");

// Reads the httpOnly session cookie, verifies the RS256 JWT and loads the user.
// Rejects: expired token (6h), session replaced by a newer login, tokenVersion
// bumped (password / role change), blocked user.
const portalAuthMiddleware = async (req, res, next) => {
  try {
    const token = req.cookies?.[SESSION_COOKIE_NAME];
    if (!token) return sendError(res, 401, "Please log in to continue", { code: "NOT_AUTHENTICATED" });

    let decoded;
    try {
      decoded = verifySessionToken(token);
    } catch (error) {
      clearSessionCookie(res);
      const expired = error.name === "TokenExpiredError";
      return sendError(res, 401, expired ? "Your session expired. Please log in again." : "Invalid session", {
        code: expired ? "SESSION_EXPIRED" : "INVALID_SESSION",
      });
    }

    if (decoded.type !== "session") {
      clearSessionCookie(res);
      return sendError(res, 401, "Invalid session", { code: "INVALID_SESSION" });
    }

    const user = await PortalUser.findById(decoded.userId).select(PortalUser.SECURE_FIELDS);
    if (!user) {
      clearSessionCookie(res);
      return sendError(res, 401, "Account not found", { code: "INVALID_SESSION" });
    }

    if (user.isBlocked) {
      clearSessionCookie(res);
      return sendError(res, 403, "Your account is blocked. Contact the SuperAdmin.", { code: "ACCOUNT_BLOCKED" });
    }

    if (!user.activeSessionId || decoded.sessionId !== user.activeSessionId) {
      clearSessionCookie(res);
      return sendError(res, 401, "This account was logged in from another device. Please log in again.", {
        code: "SESSION_REPLACED",
        sessionReplaced: true,
      });
    }

    if ((user.tokenVersion || 1) !== decoded.tokenVersion) {
      clearSessionCookie(res);
      return sendError(res, 401, "Your account security changed. Please log in again.", {
        code: "SESSION_REVOKED",
      });
    }

    req.user = user;
    req.session = { expiresAt: new Date(decoded.exp * 1000) };
    next();
  } catch (error) {
    console.error("portalAuthMiddleware error:", error);
    return sendError(res, 500, "Internal server error");
  }
};

module.exports = portalAuthMiddleware;
