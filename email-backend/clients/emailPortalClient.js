/**
 * InvoiceMate Email Portal client - drop-in file for ANY project (no dependencies, Node 18+).
 *
 * Copy this file into the project (e.g. utils/emailPortalClient.js) and, in the email
 * service, right before transporter.sendMail(mailOptions):
 *
 *   const { isPortalMode, saveEmailToPortal } = require("../utils/emailPortalClient");
 *   if (isPortalMode()) {
 *     return saveEmailToPortal({ mail: mailOptions, templateName, templateData, recipients });
 *   }
 *   return transporter.sendMail(mailOptions);   // production keeps sending live
 *
 * Env (beta only):
 *   EMAIL_DELIVERY_MODE=portal              # "portal" = save to portal, anything else = send live
 *   EMAIL_PORTAL_URL=https://email-api.invoicemate.net
 *   EMAIL_PORTAL_KEY_ID=imk_xxx             # from the portal: Projects > Connect project
 *   EMAIL_PORTAL_SECRET=ims_xxx
 *   EMAIL_PORTAL_PROJECT_URL=https://beta.imdefa.com   # optional, the project's own frontend URL
 *   EMAIL_PORTAL_ENVIRONMENT=beta           # optional label
 *
 * In portal mode an email is NEVER sent for real - if the portal can't be reached
 * the call throws, so nothing leaks to a public inbox.
 */
const crypto = require("crypto");
const os = require("os");
const fs = require("fs");

const SDK_VERSION = "1.0.0";
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const TIMEOUT_MS = 15000;
const RETRIES = 2;

const isPortalMode = () => String(process.env.EMAIL_DELIVERY_MODE || "").trim().toLowerCase() === "portal";

const getServerIps = () => {
  try {
    return Object.values(os.networkInterfaces())
      .flat()
      .filter((i) => i && !i.internal && i.family === "IPv4")
      .map((i) => i.address)
      .slice(0, 5);
  } catch {
    return [];
  }
};

const hostFromUrl = (url) => {
  try {
    return url ? new URL(url).hostname : null;
  } catch {
    return null;
  }
};

// nodemailer attachments -> JSON safe objects (Buffers become base64)
const serializeAttachment = (a) => {
  if (!a || typeof a !== "object") return null;
  const base = {
    filename: a.filename || (typeof a.path === "string" ? a.path.split(/[\\/]/).pop() : "attachment"),
    contentType: a.contentType || null,
    cid: a.cid || null,
    contentDisposition: a.contentDisposition || (a.cid ? "inline" : "attachment"),
  };
  try {
    if (Buffer.isBuffer(a.content)) return { ...base, contentBase64: a.content.toString("base64") };
    if (a.content instanceof Uint8Array) return { ...base, contentBase64: Buffer.from(a.content).toString("base64") };
    if (typeof a.content === "string") {
      return a.encoding === "base64"
        ? { ...base, contentBase64: a.content }
        : { ...base, contentBase64: Buffer.from(a.content, a.encoding || "utf8").toString("base64") };
    }
    if (typeof a.path === "string") {
      if (/^https?:\/\//i.test(a.path)) return { ...base, path: a.path };
      if (/^data:/i.test(a.path)) {
        const [meta, data] = a.path.split(",");
        return {
          ...base,
          contentType: base.contentType || meta.slice(5).split(";")[0],
          contentBase64: /;base64/i.test(meta) ? data : Buffer.from(decodeURIComponent(data)).toString("base64"),
        };
      }
      const stat = fs.statSync(a.path);
      if (stat.size > MAX_ATTACHMENT_BYTES) return { ...base, size: stat.size, skippedReason: "File larger than 10 MB" };
      return { ...base, contentBase64: fs.readFileSync(a.path).toString("base64") };
    }
    if (a.content && typeof a.content.pipe === "function") return { ...base, skippedReason: "Stream attachments are not captured" };
  } catch (error) {
    return { ...base, skippedReason: `Could not read attachment: ${error.message}` };
  }
  return { ...base, skippedReason: "No content" };
};

const buildPayload = ({ mail, templateName, templateData, user, recipients, trigger, idempotencyKey }) => {
  const appUrl = process.env.EMAIL_PORTAL_PROJECT_URL || process.env.FRONTEND_URL || null;
  return {
    mail: {
      from: mail.from,
      sender: mail.sender,
      to: mail.to,
      cc: mail.cc,
      bcc: mail.bcc,
      replyTo: mail.replyTo,
      subject: mail.subject,
      html: typeof mail.html === "string" ? mail.html : mail.html ? String(mail.html) : null,
      text: typeof mail.text === "string" ? mail.text : null,
      headers: mail.headers,
      priority: mail.priority,
      messageId: mail.messageId,
      attachments: (mail.attachments || []).map(serializeAttachment).filter(Boolean),
    },
    templateName: templateName || null,
    templateData: templateData || null,
    user: user || null,
    recipients: recipients || [],
    source: {
      environment: process.env.EMAIL_PORTAL_ENVIRONMENT || process.env.NODE_ENV || null,
      service: process.env.EMAIL_PORTAL_SERVICE || process.env.npm_package_name || null,
      appUrl,
      domain: hostFromUrl(appUrl),
      serverHostname: os.hostname(),
      serverIps: getServerIps(),
      nodeVersion: process.version,
      sdkVersion: SDK_VERSION,
      trigger: trigger || null,
    },
    idempotencyKey: idempotencyKey || crypto.randomUUID(),
    sentAt: new Date().toISOString(),
  };
};

const signedPost = async (url, keyId, secret, body) => {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": `im-email-portal-client/${SDK_VERSION}`,
      "x-portal-key-id": keyId,
      "x-portal-timestamp": timestamp,
      "x-portal-signature": signature,
    },
    body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  let json = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  return { status: response.status, ok: response.ok, json };
};

/**
 * Saves the email in the portal instead of sending it.
 * @param {object} p
 * @param {object} p.mail           the exact nodemailer mailOptions
 * @param {string} [p.templateName]
 * @param {object} [p.templateData] variables used to render the template
 * @param {object} [p.user]         { userId, userType, userRole } - main user / admin the email is for
 * @param {Array}  [p.recipients]   [{ address, userId, userType, userRole }] - per address link
 * @param {string} [p.trigger]      free text, e.g. "forgot-password"
 * @returns nodemailer-like info object (+ portal details)
 */
const saveEmailToPortal = async (p) => {
  const baseUrl = String(process.env.EMAIL_PORTAL_URL || "").replace(/\/$/, "");
  const keyId = process.env.EMAIL_PORTAL_KEY_ID;
  const secret = process.env.EMAIL_PORTAL_SECRET;
  if (!baseUrl || !keyId || !secret) {
    throw new Error("[EmailPortal] EMAIL_PORTAL_URL / EMAIL_PORTAL_KEY_ID / EMAIL_PORTAL_SECRET are not set");
  }

  const payload = buildPayload(p);
  const body = JSON.stringify(payload, (k, v) => (typeof v === "bigint" ? v.toString() : v));

  let lastError;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      // same idempotencyKey on every retry -> the portal never stores a duplicate
      const result = await signedPost(`${baseUrl}/email-ingest/saveEmail`, keyId, secret, body);
      if (result.ok) {
        const to = [p.mail.to, p.mail.cc, p.mail.bcc].flat().filter(Boolean);
        console.log(`[EmailPortal] saved "${p.mail.subject}" -> ${result.json?.recipients} recipient(s)`);
        return {
          accepted: to,
          rejected: [],
          messageId: result.json?.messageId,
          response: "250 Saved to InvoiceMate Email Portal (not delivered)",
          envelope: { from: p.mail.from, to },
          portal: result.json,
        };
      }
      lastError = new Error(`[EmailPortal] ${result.status}: ${result.json?.message || "save failed"}`);
      if (result.status < 500 && result.status !== 429) break; // client error - retry won't help
    } catch (error) {
      lastError = new Error(`[EmailPortal] ${error.message}`);
    }
    await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
  }
  throw lastError;
};

module.exports = { isPortalMode, saveEmailToPortal, SDK_VERSION };
