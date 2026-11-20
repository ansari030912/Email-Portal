/**
 * Pushes a sample email through the real client + signed API (end-to-end check).
 *   EMAIL_PORTAL_URL=http://localhost:5050 EMAIL_PORTAL_KEY_ID=imk_.. EMAIL_PORTAL_SECRET=ims_.. \
 *   node scripts/sendTestEmail.js someone@maildrop.cc
 */
require("dotenv").config();
const { saveEmailToPortal } = require("../clients/emailPortalClient");

(async () => {
  const to = process.argv[2] || "hello@maildrop.cc";
  const result = await saveEmailToPortal({
    mail: {
      from: '"InvoiceMate" <no-reply@invoicemate.net>',
      to,
      cc: ["qa-team@maildrop.cc"],
      bcc: "audit@maildrop.cc",
      subject: "Reset your password",
      html: `<!doctype html><html><body style="font-family:Arial;background:#f4f6fb;padding:32px">
        <table width="100%" style="max-width:560px;margin:auto;background:#fff;border-radius:12px;padding:32px">
        <tr><td><h2 style="color:#1d4ed8;margin-top:0">Password reset</h2>
        <p>Hi there, we received a request to reset your password.</p>
        <p><a href="https://beta.example.com/reset?token=abc123" style="display:inline-block;background:#1d4ed8;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none">Reset password</a></p>
        <p style="color:#64748b;font-size:13px">This link expires in 30 minutes.</p></td></tr></table></body></html>`,
      attachments: [{ filename: "readme.txt", content: Buffer.from("Hello from the email portal test") }],
    },
    templateName: "forgotPasswordTemplate",
    templateData: { resetLink: "https://beta.example.com/reset?token=abc123", userName: "Test User" },
    trigger: "scripts/sendTestEmail",
  });
  console.log(JSON.stringify(result.portal, null, 2));
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
