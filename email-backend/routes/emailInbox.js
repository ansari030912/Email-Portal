const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

const Email = require("../models/email");
const EmailAttachment = require("../models/emailAttachment");
const RecipientMailbox = require("../models/recipientMailbox");
const portalAuthMiddleware = require("../middleware/portalAuthMiddleware");
const { sendError, sendSuccess, isValidObjectId, escapeRegex, parsePagination } = require("../utils/apiResponse");
const { normalizeEmail } = require("../utils/emailAddress");

router.use(portalAuthMiddleware);

// THE access rule of the portal: a user sees an email only if one of its
// to / cc / bcc addresses is assigned to them in the toEmails collection.
// Same rule for every role - an unassigned email is visible to nobody.
const getMyAddresses = async (userId) => {
  const rows = await RecipientMailbox.find({ user_id: userId }).select("email").lean();
  return rows.map((r) => r.email);
};

const safeParse = (json) => {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
};

const hasId = (list, id) => (list || []).some((x) => String(x) === String(id));

const toListItem = (email, userId, myAddresses) => ({
  _id: String(email._id),
  subject: email.subject,
  snippet: email.snippet,
  from: email.from,
  to: (email.to || []).slice(0, 5),
  toCount: (email.to || []).length,
  ccCount: (email.cc || []).length,
  bccCount: (email.bcc || []).length,
  project: email.project ? { key: email.project.key, name: email.project.name } : null,
  environment: email.source?.environment || null,
  templateName: email.templateName,
  attachmentCount: (email.attachments || []).length,
  sentAt: email.sentAt,
  isRead: hasId(email.readBy, userId),
  isStarred: hasId(email.starredBy, userId),
  mailboxes: (email.recipientAddresses || []).filter((a) => myAddresses.includes(a)),
});

const LIST_FIELDS =
  "subject snippet from to cc bcc project source.environment templateName attachments.filename sentAt readBy starredBy recipientAddresses";

// ---------------------------------------------------------------------------
// GET /email-inbox/getMyMailboxes - addresses assigned to me + total / unread counts
// ---------------------------------------------------------------------------
router.get("/getMyMailboxes", async (req, res) => {
  try {
    const mailboxes = await RecipientMailbox.find({ user_id: req.user._id })
      .select("email displayName emailCount lastEmailAt projects")
      .sort({ lastEmailAt: -1 })
      .lean();
    const addresses = mailboxes.map((m) => m.email);

    let countsByAddress = new Map();
    let totals = { total: 0, unread: 0, starred: 0 };
    if (addresses.length) {
      const [perAddress, overall] = await Promise.all([
        Email.aggregate([
          { $match: { recipientAddresses: { $in: addresses } } },
          { $project: { recipientAddresses: 1, isRead: { $in: [req.user._id, { $ifNull: ["$readBy", []] }] } } },
          { $unwind: "$recipientAddresses" },
          { $match: { recipientAddresses: { $in: addresses } } },
          {
            $group: {
              _id: "$recipientAddresses",
              total: { $sum: 1 },
              unread: { $sum: { $cond: ["$isRead", 0, 1] } },
            },
          },
        ]),
        Email.aggregate([
          { $match: { recipientAddresses: { $in: addresses } } },
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              unread: { $sum: { $cond: [{ $in: [req.user._id, { $ifNull: ["$readBy", []] }] }, 0, 1] } },
              starred: { $sum: { $cond: [{ $in: [req.user._id, { $ifNull: ["$starredBy", []] }] }, 1, 0] } },
            },
          },
        ]),
      ]);
      countsByAddress = new Map(perAddress.map((r) => [r._id, r]));
      if (overall[0]) totals = { total: overall[0].total, unread: overall[0].unread, starred: overall[0].starred };
    }

    return sendSuccess(res, {
      mailboxes: mailboxes.map((m) => ({
        _id: String(m._id),
        email: m.email,
        displayName: m.displayName,
        projects: m.projects || [],
        lastEmailAt: m.lastEmailAt,
        total: countsByAddress.get(m.email)?.total || 0,
        unread: countsByAddress.get(m.email)?.unread || 0,
      })),
      totals,
    });
  } catch (error) {
    console.error("getMyMailboxes error:", error);
    return sendError(res, 500, "Internal server error");
  }
});

// ---------------------------------------------------------------------------
// GET /email-inbox/getMyInboxEmails?mailbox=&folder=inbox|unread|starred&search=&project=&page=&limit=
// ---------------------------------------------------------------------------
router.get("/getMyInboxEmails", async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query, 30, 100);
    const myAddresses = await getMyAddresses(req.user._id);
    let addresses = myAddresses;
    if (req.query.mailbox && req.query.mailbox !== "all") {
      const wanted = normalizeEmail(req.query.mailbox);
      if (!myAddresses.includes(wanted)) return sendError(res, 403, "This mailbox is not assigned to you");
      addresses = [wanted];
    }

    const emptyPage = { emails: [], pagination: { page, limit, total: 0, pages: 1 } };
    if (!myAddresses.length) return sendSuccess(res, { ...emptyPage, noMailboxes: true });

    const filter = { recipientAddresses: { $in: addresses } };
    if (req.query.folder === "unread") filter.readBy = { $ne: req.user._id };
    if (req.query.folder === "starred") filter.starredBy = req.user._id;
    if (req.query.project) filter["project.key"] = String(req.query.project);

    const search = String(req.query.search || "").trim().slice(0, 100);
    if (search) {
      const rx = new RegExp(escapeRegex(search), "i");
      filter.$or = [
        { subject: rx },
        { snippet: rx },
        { "from.address": rx },
        { "from.name": rx },
        { recipientAddresses: rx },
        { templateName: rx },
        { "project.name": rx },
      ];
    }

    const [emails, total] = await Promise.all([
      Email.find(filter).select(LIST_FIELDS).sort({ sentAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
      Email.countDocuments(filter),
    ]);

    return sendSuccess(res, {
      emails: emails.map((e) => toListItem(e, req.user._id, myAddresses)),
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (error) {
    console.error("getMyInboxEmails error:", error);
    return sendError(res, 500, "Internal server error");
  }
});

// ---------------------------------------------------------------------------
// GET /email-inbox/getMyInboxProjects - projects that sent mail to my mailboxes (filter chips)
// ---------------------------------------------------------------------------
router.get("/getMyInboxProjects", async (req, res) => {
  try {
    const myAddresses = await getMyAddresses(req.user._id);
    if (!myAddresses.length) return sendSuccess(res, { projects: [] });
    const projects = await Email.aggregate([
      { $match: { recipientAddresses: { $in: myAddresses } } },
      { $group: { _id: "$project.key", name: { $first: "$project.name" }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    return sendSuccess(res, {
      projects: projects.filter((p) => p._id).map((p) => ({ key: p._id, name: p.name, count: p.count })),
    });
  } catch (error) {
    console.error("getMyInboxProjects error:", error);
    return sendError(res, 500, "Internal server error");
  }
});

// Inline images (cid:xyz) are swapped for data URIs, because the email HTML is shown
// in a sandboxed iframe that can't send the session cookie.
const MAX_INLINE_IMAGE_BYTES = 3 * 1024 * 1024;
const inlineCidImages = async (email) => {
  let html = email.html;
  if (!html || !html.includes("cid:")) return html;
  const inline = (email.attachments || []).filter(
    (a) => a.cid && a.storageId && a.size <= MAX_INLINE_IMAGE_BYTES && /^image\//i.test(a.contentType)
  );
  if (!inline.length) return html;
  const files = await EmailAttachment.find({ _id: { $in: inline.map((a) => a.storageId) } }).lean();
  const byId = new Map(files.map((f) => [String(f._id), f]));
  for (const att of inline) {
    const file = byId.get(String(att.storageId));
    if (!file) continue;
    const dataUri = `data:${att.contentType};base64,${Buffer.from(file.data.buffer || file.data).toString("base64")}`;
    html = html.split(`cid:${att.cid}`).join(dataUri);
  }
  return html;
};

// ---------------------------------------------------------------------------
// GET /email-inbox/getEmailById/:emailId - full email (HTML, all headers, source info)
// Also marks it read for me.
// ---------------------------------------------------------------------------
router.get("/getEmailById/:emailId", async (req, res) => {
  try {
    const { emailId } = req.params;
    if (!isValidObjectId(emailId)) return sendError(res, 400, "Invalid email id");

    const myAddresses = await getMyAddresses(req.user._id);
    const email = await Email.findOne({ _id: emailId, recipientAddresses: { $in: myAddresses } }).lean();
    if (!email || !myAddresses.length) return sendError(res, 404, "Email not found");

    if (!hasId(email.readBy, req.user._id)) {
      await Email.updateOne({ _id: email._id }, { $addToSet: { readBy: req.user._id } });
    }

    const html = await inlineCidImages(email);
    return sendSuccess(res, {
      email: {
        _id: String(email._id),
        messageId: email.messageId,
        subject: email.subject,
        from: email.from,
        sender: email.sender,
        replyTo: email.replyTo,
        to: email.to,
        cc: email.cc,
        bcc: email.bcc,
        html,
        text: email.text,
        templateName: email.templateName,
        templateData: safeParse(email.templateDataJson),
        headers: safeParse(email.headersJson),
        priority: email.priority,
        project: email.project ? { key: email.project.key, name: email.project.name } : null,
        source: email.source,
        sourceUserId: email.sourceUserId,
        sourceUserType: email.sourceUserType,
        recipients: email.recipients,
        attachments: (email.attachments || []).map((a) => ({
          _id: String(a._id),
          filename: a.filename,
          contentType: a.contentType,
          size: a.size,
          cid: a.cid,
          isInline: a.contentDisposition === "inline" || !!a.cid,
          downloadable: !!a.storageId,
          remoteUrl: a.remoteUrl,
          skippedReason: a.skippedReason,
        })),
        sizeBytes: email.sizeBytes,
        sentAt: email.sentAt,
        receivedAt: email.createdAt,
        isRead: true,
        isStarred: hasId(email.starredBy, req.user._id),
        mailboxes: (email.recipientAddresses || []).filter((a) => myAddresses.includes(a)),
      },
    });
  } catch (error) {
    console.error("getEmailById error:", error);
    return sendError(res, 500, "Internal server error");
  }
});

// ---------------------------------------------------------------------------
// PUT /email-inbox/updateEmailReadStatus { emailIds[], isRead }
// ---------------------------------------------------------------------------
router.put("/updateEmailReadStatus", async (req, res) => {
  try {
    const ids = [...new Set((req.body?.emailIds || []).map(String))];
    const isRead = req.body?.isRead;
    if (!ids.length || ids.length > 200 || !ids.every(isValidObjectId)) return sendError(res, 400, "Select 1-200 emails");
    if (typeof isRead !== "boolean") return sendError(res, 400, "isRead must be true or false");

    const myAddresses = await getMyAddresses(req.user._id);
    const update = isRead ? { $addToSet: { readBy: req.user._id } } : { $pull: { readBy: req.user._id } };
    const result = await Email.updateMany(
      { _id: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) }, recipientAddresses: { $in: myAddresses } },
      update
    );
    return sendSuccess(res, { modified: result.modifiedCount });
  } catch (error) {
    console.error("updateEmailReadStatus error:", error);
    return sendError(res, 500, "Internal server error");
  }
});

// ---------------------------------------------------------------------------
// PUT /email-inbox/updateEmailStarStatus { emailId, isStarred }
// ---------------------------------------------------------------------------
router.put("/updateEmailStarStatus", async (req, res) => {
  try {
    const { emailId, isStarred } = req.body || {};
    if (!isValidObjectId(String(emailId))) return sendError(res, 400, "Invalid email id");
    if (typeof isStarred !== "boolean") return sendError(res, 400, "isStarred must be true or false");

    const myAddresses = await getMyAddresses(req.user._id);
    const update = isStarred ? { $addToSet: { starredBy: req.user._id } } : { $pull: { starredBy: req.user._id } };
    const result = await Email.updateOne({ _id: emailId, recipientAddresses: { $in: myAddresses } }, update);
    if (!result.matchedCount) return sendError(res, 404, "Email not found");
    return sendSuccess(res, { isStarred });
  } catch (error) {
    console.error("updateEmailStarStatus error:", error);
    return sendError(res, 500, "Internal server error");
  }
});

// ---------------------------------------------------------------------------
// GET /email-inbox/downloadEmailAttachment/:emailId/:attachmentId
// ---------------------------------------------------------------------------
router.get("/downloadEmailAttachment/:emailId/:attachmentId", async (req, res) => {
  try {
    const { emailId, attachmentId } = req.params;
    if (!isValidObjectId(emailId) || !isValidObjectId(attachmentId)) return sendError(res, 400, "Invalid id");

    const myAddresses = await getMyAddresses(req.user._id);
    const email = await Email.findOne({ _id: emailId, recipientAddresses: { $in: myAddresses } })
      .select("attachments")
      .lean();
    const meta = email?.attachments?.find((a) => String(a._id) === attachmentId);
    if (!email || !meta || !meta.storageId) return sendError(res, 404, "Attachment not found");

    const file = await EmailAttachment.findById(meta.storageId).lean();
    if (!file) return sendError(res, 404, "Attachment not found");

    const data = Buffer.from(file.data.buffer || file.data);
    const safeName = String(meta.filename || "attachment").replace(/[^\w.\- ()]/g, "_");
    // HTML / SVG / JS are always downloaded, never rendered by the browser
    const risky = /html|svg|javascript|xml/i.test(meta.contentType || "");
    res.setHeader("Content-Type", risky ? "application/octet-stream" : meta.contentType || "application/octet-stream");
    res.setHeader("Content-Length", data.length);
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(meta.filename || "attachment")}`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-store");
    return res.end(data);
  } catch (error) {
    console.error("downloadEmailAttachment error:", error);
    return sendError(res, 500, "Internal server error");
  }
});

module.exports = router;
