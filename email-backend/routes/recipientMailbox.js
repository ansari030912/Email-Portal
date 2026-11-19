const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

const RecipientMailbox = require("../models/recipientMailbox");
const PortalUser = require("../models/portalUser");
const portalAuthMiddleware = require("../middleware/portalAuthMiddleware");
const requireRole = require("../middleware/requireRole");
const { logActivity } = require("../utils/activityLogger");
const { sendError, sendSuccess, isValidObjectId, escapeRegex, parsePagination } = require("../utils/apiResponse");
const { ROLES } = require("../config/constants");

// Assigning mailboxes is strictly a SuperAdmin action. The SuperAdmin sees only
// the addresses + counts here - never the email content (unless assigned too).
router.use(portalAuthMiddleware, requireRole(ROLES.SUPER_ADMIN));

const USER_FIELDS = "name email role isBlocked";

const toMailboxDto = (mb) => ({
  _id: String(mb._id),
  email: mb.email,
  displayName: mb.displayName,
  users: (mb.user_id || []).filter(Boolean).map((u) => ({
    _id: String(u._id),
    name: u.name,
    email: u.email,
    role: u.role,
    isBlocked: !!u.isBlocked,
  })),
  sourceUserId: mb.sourceUserId,
  sourceUserType: mb.sourceUserType,
  projects: mb.projects || [],
  emailCount: mb.emailCount || 0,
  firstEmailAt: mb.firstEmailAt,
  lastEmailAt: mb.lastEmailAt,
  assignedAt: mb.assignedAt,
});

// Validates ids arrays from the body. Returns { mailboxIds, userIds } or sends 400.
const readIdLists = async (req, res, { allowEmptyUsers = false } = {}) => {
  const mailboxIds = [...new Set((req.body?.recipientMailboxIds || []).map(String))];
  const userIds = [...new Set((req.body?.userIds || []).map(String))];

  if (!mailboxIds.length || mailboxIds.length > 500 || !mailboxIds.every(isValidObjectId)) {
    sendError(res, 400, "Select between 1 and 500 valid mailboxes");
    return null;
  }
  if ((!allowEmptyUsers && !userIds.length) || userIds.length > 200 || !userIds.every(isValidObjectId)) {
    sendError(res, 400, allowEmptyUsers ? "Invalid user list" : "Select at least one user");
    return null;
  }
  if (userIds.length) {
    const found = await PortalUser.countDocuments({ _id: { $in: userIds } });
    if (found !== userIds.length) {
      sendError(res, 400, "One or more selected users don't exist");
      return null;
    }
  }
  return {
    mailboxIds: mailboxIds.map((id) => new mongoose.Types.ObjectId(id)),
    userIds: userIds.map((id) => new mongoose.Types.ObjectId(id)),
  };
};

// ---------------------------------------------------------------------------
// GET /recipient-mailbox/getAllRecipientMailboxes?search=&status=all|assigned|unassigned&project=&userId=&page=&limit=
// ---------------------------------------------------------------------------
router.get("/getAllRecipientMailboxes", async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query, 25, 100);
    const filter = {};
    const search = String(req.query.search || "").trim();
    if (search) filter.email = new RegExp(escapeRegex(search.toLowerCase()), "i");
    if (req.query.status === "assigned") filter["user_id.0"] = { $exists: true };
    if (req.query.status === "unassigned") filter["user_id.0"] = { $exists: false };
    if (req.query.project) filter.projects = String(req.query.project);
    if (req.query.userId && isValidObjectId(req.query.userId)) filter.user_id = req.query.userId;

    const [items, total, assigned, all] = await Promise.all([
      RecipientMailbox.find(filter).sort({ lastEmailAt: -1 }).skip(skip).limit(limit).populate("user_id", USER_FIELDS).lean(),
      RecipientMailbox.countDocuments(filter),
      RecipientMailbox.countDocuments({ "user_id.0": { $exists: true } }),
      RecipientMailbox.estimatedDocumentCount(),
    ]);

    return sendSuccess(res, {
      mailboxes: items.map(toMailboxDto),
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
      stats: { total: all, assigned, unassigned: Math.max(0, all - assigned) },
    });
  } catch (error) {
    console.error("getAllRecipientMailboxes error:", error);
    return sendError(res, 500, "Internal server error");
  }
});

// ---------------------------------------------------------------------------
// GET /recipient-mailbox/getRecipientMailboxProjects - project keys for the filter
// ---------------------------------------------------------------------------
router.get("/getRecipientMailboxProjects", async (req, res) => {
  try {
    const projects = await RecipientMailbox.distinct("projects");
    return sendSuccess(res, { projects: projects.filter(Boolean).sort() });
  } catch (error) {
    console.error("getRecipientMailboxProjects error:", error);
    return sendError(res, 500, "Internal server error");
  }
});

// ---------------------------------------------------------------------------
// PUT /recipient-mailbox/assignRecipientMailboxesToUsers { recipientMailboxIds[], userIds[] }
// Adds the users (keeps users already assigned). One mailbox can go to many users.
// ---------------------------------------------------------------------------
router.put("/assignRecipientMailboxesToUsers", async (req, res) => {
  try {
    const ids = await readIdLists(req, res);
    if (!ids) return;
    const result = await RecipientMailbox.updateMany(
      { _id: { $in: ids.mailboxIds } },
      { $addToSet: { user_id: { $each: ids.userIds } }, $set: { assignedAt: new Date() } }
    );
    await logActivity({
      req,
      actor: req.user,
      action: "MAILBOX_ASSIGNED",
      targetType: "RecipientMailbox",
      details: { recipientMailboxIds: ids.mailboxIds.map(String), userIds: ids.userIds.map(String) },
    });
    return sendSuccess(res, { modified: result.modifiedCount }, "Mailboxes assigned");
  } catch (error) {
    console.error("assignRecipientMailboxesToUsers error:", error);
    return sendError(res, 500, "Internal server error");
  }
});

// ---------------------------------------------------------------------------
// PUT /recipient-mailbox/unassignRecipientMailboxesFromUsers { recipientMailboxIds[], userIds[] }
// ---------------------------------------------------------------------------
router.put("/unassignRecipientMailboxesFromUsers", async (req, res) => {
  try {
    const ids = await readIdLists(req, res);
    if (!ids) return;
    const result = await RecipientMailbox.updateMany(
      { _id: { $in: ids.mailboxIds } },
      { $pull: { user_id: { $in: ids.userIds } } }
    );
    await logActivity({
      req,
      actor: req.user,
      action: "MAILBOX_UNASSIGNED",
      targetType: "RecipientMailbox",
      details: { recipientMailboxIds: ids.mailboxIds.map(String), userIds: ids.userIds.map(String) },
    });
    return sendSuccess(res, { modified: result.modifiedCount }, "Access removed");
  } catch (error) {
    console.error("unassignRecipientMailboxesFromUsers error:", error);
    return sendError(res, 500, "Internal server error");
  }
});

// ---------------------------------------------------------------------------
// PUT /recipient-mailbox/setRecipientMailboxUsers { recipientMailboxIds: [id], userIds[] }
// Replaces the full user list of the mailbox(es). Empty userIds = nobody sees it.
// ---------------------------------------------------------------------------
router.put("/setRecipientMailboxUsers", async (req, res) => {
  try {
    const ids = await readIdLists(req, res, { allowEmptyUsers: true });
    if (!ids) return;
    const result = await RecipientMailbox.updateMany(
      { _id: { $in: ids.mailboxIds } },
      { $set: { user_id: ids.userIds, assignedAt: ids.userIds.length ? new Date() : null } }
    );
    await logActivity({
      req,
      actor: req.user,
      action: "MAILBOX_USERS_SET",
      targetType: "RecipientMailbox",
      details: { recipientMailboxIds: ids.mailboxIds.map(String), userIds: ids.userIds.map(String) },
    });
    const updated = await RecipientMailbox.find({ _id: { $in: ids.mailboxIds } }).populate("user_id", USER_FIELDS).lean();
    return sendSuccess(res, { modified: result.modifiedCount, mailboxes: updated.map(toMailboxDto) }, "Access updated");
  } catch (error) {
    console.error("setRecipientMailboxUsers error:", error);
    return sendError(res, 500, "Internal server error");
  }
});

module.exports = router;
