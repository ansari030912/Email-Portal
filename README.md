# InvoiceMate Email Portal

The beta environments of our projects no longer send real emails. Each project's email service saves the exact email in this portal instead. A team member sees an email only when the Super Admin has assigned its recipient address to them. Production keeps sending live emails, with no change.

```
email-backend/   Express + MongoDB (im-emails) API
email-frontend/  React (Vite) mail client
```

## Run

```bash
cd email-backend && npm install && npm run dev        # http://localhost:5050
node scripts/seedPortalUsers.js                        # creates the 5 seeded accounts
cd email-frontend && npm install && npm run dev       # http://localhost:5173 (proxies /api -> 5050)
```

Seeded accounts (password `Hello@123`, argon2id hashed):

| Email | Role |
|---|---|
| howrex95@gmail.com | SuperAdmin |
| admin@gmail.com, admin2@gmail.com | Admin |
| user@gmail.com, user2@gmail.com | User |

## Rules

- **Roles:** SuperAdmin, Admin, User. New sign-ups are User. Only the SuperAdmin can change a role, and only to Admin or User. Nobody can be made SuperAdmin through the API.
- **2FA (Google Authenticator):**
  - Mandatory for SuperAdmin and Admin. The first login after a correct password forces setup (QR code + code). Later logins ask for the code.
  - Every own-account change (profile, password) and every SuperAdmin action (role change, block, mail account, reset 2FA, project keys) needs a fresh code.
  - A code can't be reused. 5 wrong codes lock 2FA for 10 minutes.
- **Sessions:**
  - RS256 JWT in an httpOnly SameSite=Strict cookie, valid for 6 hours.
  - A new login ends the old session.
  - A password change, role change or block logs the user out everywhere.
- **Visibility:**
  - Every to/cc/bcc address becomes a document in `toEmails` with `user_id: []`.
  - Nobody sees an unassigned address's emails, not even the SuperAdmin.
  - One address can be assigned to any number of users.
  - Registering with the same address (e.g. `hello@maildrop.cc`) does **not** give access.
- **Login protection:** 5 wrong passwords lock the account for 15 minutes. Rate limits apply on login, register and 2FA. All state-changing requests need the CSRF header.

## Collections (`im-emails`)

| Collection | What |
|---|---|
| `portalusers` | portal accounts (`mailAccountId`, `mailAccountEmail` set manually by SuperAdmin) |
| `emails` | captured email: html, text, from/to/cc/bcc/replyTo, template name + variables, source (project, domain, app URL, server hostname/IPs, request IP), linked user/admin `_id` per recipient |
| `toEmails` | one per recipient address: `{ email, user_id: [] }` + counts |
| `emailattachments` | attachment bytes (10 MB max each) |
| `ingestclients` | connected projects + encrypted signing secrets |
| `activitylogs` | audit trail |

## Connecting a project (microservice API)

1. SuperAdmin → **Projects → Connect project** (or `node scripts/createIngestClient.js <key> "<Name>"`). Copy the key id + secret (the secret is shown once).
2. Copy `email-backend/clients/emailPortalClient.js` into the project. It has no dependencies.
3. In the email service, right before `transporter.sendMail(mailOptions)`:

```js
const { isPortalMode, saveEmailToPortal } = require("../utils/emailPortalClient");
if (isPortalMode()) {
  return saveEmailToPortal({ mail: mailOptions, templateName, templateData, user: { userId, userType }, recipients });
}
```

4. Beta env of the project:

```
EMAIL_DELIVERY_MODE=portal
EMAIL_PORTAL_URL=https://<portal-backend>
EMAIL_PORTAL_KEY_ID=imk_...
EMAIL_PORTAL_SECRET=ims_...
EMAIL_PORTAL_PROJECT_URL=https://<project frontend>
EMAIL_PORTAL_ENVIRONMENT=beta
```

Remove `EMAIL_DELIVERY_MODE` in production, and the project sends live emails again. In portal mode an email is never sent for real: if the portal is down, the call fails instead of leaking to a public inbox.

`POST /email-ingest/saveEmail` is signed with `x-portal-key-id`, `x-portal-timestamp` and `x-portal-signature = HMAC-SHA256(secret, "<timestamp>.<raw body>")`. Requests older than 5 minutes are refused. Retries reuse the same `idempotencyKey`, so an email is never stored twice. `GET /email-ingest/checkIngestConnection` tests a key.

DeFa (`DEFA-S2-BE`) and PayMate (`psp-paymate-backend`) are already wired:

- `services/emailService.js` has the portal-mode hook.
- `utils/emailPortalClient.js` is the client file.
- `utils/emailPortalRecipients.js` looks up the user/admin `_id` of each recipient through `emailHash`.
- `sendEmail()` also accepts optional `portalUserId` / `portalUserType` to pass the `_id` explicitly.

## API list

| Route file | APIs |
|---|---|
| `routes/userAuth.js` `/auth` | registerUser, loginUser, logoutUser, getMyProfile, updateMyProfile, changeMyPassword |
| `routes/googleAuth2fa.js` `/google-auth-2fa` | verifyLoginTwoFactorCode, getTwoFactorStatus, generateTwoFactorSetup, enableTwoFactor, disableTwoFactor |
| `routes/emailInbox.js` `/email-inbox` | getMyMailboxes, getMyInboxEmails, getMyInboxProjects, getEmailById/:emailId, updateEmailReadStatus, updateEmailStarStatus, downloadEmailAttachment/:emailId/:attachmentId |
| `routes/recipientMailbox.js` `/recipient-mailbox` (SuperAdmin) | getAllRecipientMailboxes, getRecipientMailboxProjects, assignRecipientMailboxesToUsers, unassignRecipientMailboxesFromUsers, setRecipientMailboxUsers |
| `routes/userManagement.js` `/user-management` (SuperAdmin) | getAllPortalUsers, updatePortalUserRole, updatePortalUserStatus, updatePortalUserMailAccount, resetPortalUserTwoFactor |
| `routes/ingestClients.js` `/ingest-clients` (SuperAdmin) | getAllIngestClients, createIngestClient, rotateIngestClientSecret, updateIngestClientSettings |
| `routes/activityLogs.js` `/activity-logs` (SuperAdmin) | getActivityLogs |
| `routes/emailIngest.js` `/email-ingest` (HMAC) | saveEmail, checkIngestConnection |
