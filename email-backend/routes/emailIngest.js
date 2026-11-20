const express = require("express");
const crypto = require("crypto");
const mongoose = require("mongoose");
const router = express.Router();

const Email = require("../models/email");
const EmailAttachment = require("../models/emailAttachment");
const RecipientMailbox = require("../models/recipientMailbox");
const IngestClient = require("../models/ingestClient");
const verifyIngestSignature = require("../middleware/verifyIngestSignature");
const { ingestLimiter } = require("../middleware/rateLimiters");
const { parseAddressList, parseSingleAddress } = require("../utils/emailAddress");
const { MAX_ATTACHMENT_BYTES } = require("../config/constants");

router.use(ingestLimiter, verifyIngestSignature);

const MAX_HTML = 5 * 1024 * 1024;
const MAX_TEXT = 2 * 1024 * 1024;
const MAX_JSON = 1024 * 1024;
const MAX_ATTACHMENTS = 25;

const str = (value, max = 500) => {
  if (value === undefined || value === null) return null;
  const s = String(value);
  return s.length > max ? s.slice(0, max) : s;
};

const toJsonText = (value) => {
  if (value === undefined || value === null) return null;
  try {
    const text = JSON.stringify(value, (k, v) => (typeof v === "bigint" ? v.toString() : v));
    return text && text.length <= MAX_JSON ? text : JSON.stringify({ _truncated: true, size: text.length });
  } catch {
    return null;
  }
};

// Preview line for the inbox list. Built from the HTML when there is HTML: many
// projects make `text` by stripping tags from the HTML, which leaves the <style>
// CSS inside it - so `text` is only used for plain-text emails.
const ENTITIES = { "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&zwnj;": "", "&#8203;": "" };
const htmlToPreviewText = (html) =>
  String(html)
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<head[\s\S]*?<\/head>/gi, " ")
    .replace(/<(style|script|title|noscript)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|tr|h[1-6]|li)>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? " ");

const buildSnippet = (text, html) => {
  const source = html ? htmlToPreviewText(html) : text;
  return String(source || "").replace(/\s+/g, " ").trim().slice(0, 220);
};

const toDate = (value) => {
  const d = value ? new Date(value) : new Date();
  return Number.isNaN(d.getTime()) ? new Date() : d;
};

// Attachments arrive as { filename, contentType, contentBase64 | content(string), encoding, cid, path, contentDisposition }
const prepareAttachments = (list) => {
  const metas = [];
  const blobs = [];
  for (const raw of (Array.isArray(list) ? list : []).slice(0, MAX_ATTACHMENTS)) {
    if (!raw || typeof raw !== "object") continue;
    const meta = {
      _id: new mongoose.Types.ObjectId(),
      filename: str(raw.filename, 255) || "attachment",
      contentType: str(raw.contentType, 150) || "application/octet-stream",
      cid: str(raw.cid, 255),
      contentDisposition: raw.contentDisposition === "inline" || raw.cid ? "inline" : "attachment",
      size: 0,
      storageId: null,
      remoteUrl: null,
      skippedReason: null,
    };

    let buffer = null;
    try {
      if (typeof raw.contentBase64 === "string") buffer = Buffer.from(raw.contentBase64, "base64");
      else if (typeof raw.content === "string") buffer = Buffer.from(raw.content, raw.encoding === "base64" ? "base64" : "utf8");
    } catch {
      buffer = null;
    }

    if (buffer) {
      meta.size = buffer.length;
      if (buffer.length > MAX_ATTACHMENT_BYTES) {
        meta.skippedReason = `Larger than ${Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB - not stored`;
      } else {
        meta.storageId = new mongoose.Types.ObjectId();
        blobs.push({ _id: meta.storageId, filename: meta.filename, contentType: meta.contentType, size: buffer.length, data: buffer });
      }
    } else if (typeof raw.path === "string" && /^https?:\/\//i.test(raw.path)) {
      meta.remoteUrl = str(raw.path, 2000);
      meta.size = Number(raw.size) || 0;
    } else {
      meta.size = Number(raw.size) || 0;
      meta.skippedReason = str(raw.skippedReason, 200) || "Content not provided";
    }
    metas.push(meta);
  }
  return { metas, blobs };
};

// ---------------------------------------------------------------------------
// POST /email-ingest/saveEmail
// Called by every project's email service INSTEAD of sending (beta). Signed with
// the project's key (see middleware/verifyIngestSignature.js).
//
// Body (the same thing the project hands to nodemailer, plus context):
// {
//   mail: { from, sender, to, cc, bcc, replyTo, subject, html, text, headers, priority, messageId,
//           attachments: [{ filename, contentType, contentBase64, cid, path, contentDisposition }] },
//   templateName, templateData,
//   source:     { environment, service, appUrl, domain, serverHostname, serverIps, nodeVersion, sdkVersion, trigger },
//   idempotencyKey, sentAt
// }
// A flat nodemailer mailOptions object (to/subject/html at top level) is accepted too.
// ---------------------------------------------------------------------------
router.post("/saveEmail", async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const mail = body.mail && typeof body.mail === "object" ? body.mail : body;
    const client = req.ingestClient;

    const to = parseAddressList(mail.to);
    const cc = parseAddressList(mail.cc);
    const bcc = parseAddressList(mail.bcc);
    if (!to.length && !cc.length && !bcc.length) {
      return res.status(400).json({ success: false, message: "At least one valid to / cc / bcc address is required" });
    }

    const html = typeof mail.html === "string" ? mail.html : null;
    const text = typeof mail.text === "string" ? mail.text : null;
    if (html && html.length > MAX_HTML) return res.status(413).json({ success: false, message: "html is larger than 5 MB" });
    if (text && text.length > MAX_TEXT) return res.status(413).json({ success: false, message: "text is larger than 2 MB" });

    const idempotencyKey = str(body.idempotencyKey || req.headers["x-idempotency-key"], 200);
    if (idempotencyKey) {
      const existing = await Email.findOne({ "project.clientId": client._id, idempotencyKey }).select("_id messageId").lean();
      if (existing) {
        return res.status(200).json({ success: true, duplicate: true, emailId: String(existing._id), messageId: existing.messageId });
      }
    }

    // Emails are matched to mailboxes by address only (to / cc / bcc)
    const allAddresses = [...to, ...cc, ...bcc];
    const recipientAddresses = [...new Set(allAddresses.map((a) => a.address))];

    // ---- attachments ----
    const { metas, blobs } = prepareAttachments(mail.attachments);
    const emailId = new mongoose.Types.ObjectId();
    const src = body.source && typeof body.source === "object" ? body.source : {};
    const messageId = str(mail.messageId, 300) || `<${crypto.randomUUID()}@${client.projectKey}.email-portal>`;

    const doc = {
      _id: emailId,
      project: { clientId: client._id, key: client.projectKey, name: client.name },
      source: {
        environment: str(src.environment, 50),
        service: str(src.service, 100),
        appUrl: str(src.appUrl, 500),
        domain: str(src.domain, 255),
        serverHostname: str(src.serverHostname, 255),
        serverIps: (Array.isArray(src.serverIps) ? src.serverIps : []).slice(0, 10).map((ip) => str(ip, 64)),
        requestIp: req.ingestRequestIp,
        userAgent: str(req.headers["user-agent"], 300),
        nodeVersion: str(src.nodeVersion, 30),
        sdkVersion: str(src.sdkVersion, 30),
        trigger: str(src.trigger, 200),
      },
      messageId,
      idempotencyKey,
      from: parseSingleAddress(mail.from),
      sender: parseSingleAddress(mail.sender),
      replyTo: parseAddressList(mail.replyTo),
      to,
      cc,
      bcc,
      recipientAddresses,
      subject: str(mail.subject, 1000) || "(no subject)",
      html,
      text,
      snippet: buildSnippet(text, html),
      templateName: str(body.templateName ?? mail.templateName, 150),
      templateDataJson: toJsonText(body.templateData),
      headersJson: toJsonText(mail.headers),
      priority: ["high", "normal", "low"].includes(mail.priority) ? mail.priority : "normal",
      attachments: metas,
      sizeBytes: (html?.length || 0) + (text?.length || 0) + blobs.reduce((n, b) => n + b.size, 0),
      sentAt: toDate(body.sentAt),
    };

    await Email.create(doc);
    if (blobs.length) {
      await EmailAttachment.insertMany(blobs.map((b) => ({ ...b, emailId })));
    }

    // ---- one toEmails document per address (user_id stays empty until assigned) ----
    const now = doc.sentAt;
    await RecipientMailbox.bulkWrite(
      recipientAddresses.map((address) => {
        const name = allAddresses.find((a) => a.address === address)?.name;
        const set = { lastEmailAt: now };
        if (name) set.displayName = name;
        return {
          updateOne: {
            filter: { email: address },
            update: {
              $setOnInsert: { firstEmailAt: now, user_id: [] },
              $set: set,
              $inc: { emailCount: 1 },
              $addToSet: { projects: client.projectKey },
            },
            upsert: true,
          },
        };
      }),
      { ordered: false }
    );

    await IngestClient.updateOne(
      { _id: client._id },
      { $set: { lastUsedAt: new Date(), lastUsedIp: req.ingestRequestIp }, $inc: { emailCount: 1 } }
    );

    const assigned = await RecipientMailbox.find({ email: { $in: recipientAddresses }, "user_id.0": { $exists: true } })
      .select("email")
      .lean();
    const assignedSet = new Set(assigned.map((a) => a.email));

    return res.status(201).json({
      success: true,
      emailId: String(emailId),
      messageId,
      recipients: recipientAddresses.length,
      unassignedRecipients: recipientAddresses.filter((a) => !assignedSet.has(a)),
    });
  } catch (error) {
    if (error?.code === 11000 && error?.keyPattern?.idempotencyKey) {
      return res.status(200).json({ success: true, duplicate: true });
    }
    console.error("saveEmail error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ---------------------------------------------------------------------------
// GET /email-ingest/checkIngestConnection - lets a project test its key & signature
// ---------------------------------------------------------------------------
router.get("/checkIngestConnection", (req, res) =>
  res.status(200).json({
    success: true,
    message: "Signature valid",
    project: { key: req.ingestClient.projectKey, name: req.ingestClient.name },
    serverTime: new Date().toISOString(),
  })
);

module.exports = router;
module.exports.buildSnippet = buildSnippet;
