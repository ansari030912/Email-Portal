const sendError = (res, status, message, extra = {}) =>
  res.status(status).json({ success: false, message, ...extra });

const sendSuccess = (res, data = {}, message, status = 200) =>
  res.status(status).json({ success: true, ...(message ? { message } : {}), ...data });

const isValidObjectId = (id) => typeof id === "string" && /^[0-9a-fA-F]{24}$/.test(id);

const escapeRegex = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const parsePagination = (query, defaultLimit = 25, maxLimit = 100) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
};

module.exports = { sendError, sendSuccess, isValidObjectId, escapeRegex, parsePagination };
