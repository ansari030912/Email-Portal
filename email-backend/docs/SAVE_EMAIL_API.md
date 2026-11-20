# Email Portal: Save Email API

In **beta**, your backend does not send emails. Before calling `transporter.sendMail(...)`, it sends the same email to the Email Portal, which stores it and shows it to the right team members. **Production keeps sending real emails, with no change.**

You need two values, which the portal admin gives you once per project:

| Value | Example | Keep it… |
|---|---|---|
| **Key ID** | `imk_255f27b2ee69545492` | in env, can be seen in logs |
| **Secret** | `ims_7hQ…` | **in env only.** Never commit it, never send it to a browser, never log it |

Base URL: `https://<email-portal-backend>` (local: `http://localhost:5050`)

---

## Option A: drop-in client (recommended, about 5 minutes)

1. Copy [`clients/emailPortalClient.js`](../clients/emailPortalClient.js) into your project, e.g. `utils/emailPortalClient.js`. It has no dependencies (Node 18+).
2. Add to your **beta** env only:

   ```env
   EMAIL_DELIVERY_MODE=portal
   EMAIL_PORTAL_URL=https://<email-portal-backend>
   EMAIL_PORTAL_KEY_ID=imk_xxxxxxxxxxxxxxxxxx
   EMAIL_PORTAL_SECRET=ims_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   EMAIL_PORTAL_PROJECT_URL=https://beta.your-app.com   # optional, your frontend URL
   EMAIL_PORTAL_ENVIRONMENT=beta                        # optional label
   ```

3. In your email service, right before `transporter.sendMail(mailOptions)`:

   ```js
   const { isPortalMode, saveEmailToPortal } = require("../utils/emailPortalClient");

   if (isPortalMode()) {
     return saveEmailToPortal({
       mail: mailOptions,                                  // the exact nodemailer mailOptions
       templateName: "forgotPasswordTemplate",             // optional
       templateData: { resetLink, userName },              // optional: the template variables
     });
   }
   return transporter.sendMail(mailOptions); // production: unchanged
   ```

The client signs every request, converts attachments (Buffers, file paths, data URLs), retries network errors safely, and returns a nodemailer-style `info` object. **In portal mode it never sends a real email.** If the portal can't be reached, the call throws, so nothing leaks to a real inbox.

Remove `EMAIL_DELIVERY_MODE` (or set it to anything else) in production.

---

## Option B: call the API directly (any language)

### `POST /email-ingest/saveEmail`

#### Headers

| Header | Required | Value |
|---|---|---|
| `Content-Type` | ✓ | `application/json` |
| `x-portal-key-id` | ✓ | your Key ID |
| `x-portal-timestamp` | ✓ | current time in **unix seconds**, e.g. `1795087410` |
| `x-portal-signature` | ✓ | `hex( HMAC_SHA256( secret, timestamp + "." + rawBody ) )` |
| `x-idempotency-key` | – | any unique string per email (or send `idempotencyKey` in the body) |

**Signature rules**

- Sign the **exact bytes** you send as the body. Build the JSON string once, sign it, and send that same string. Do **not** re-serialize it after signing.
- The string to sign is `<timestamp>.<body>`, e.g. `1795087410.{"mail":{...}}`.
- The timestamp must be within **±5 minutes** of the portal's clock. Keep the server clock in sync (NTP).

#### Body

```jsonc
{
  "mail": {                                   // = nodemailer mailOptions
    "from": "\"DeFa\" <no-reply@imdefa.com>",
    "to": "hello@maildrop.cc",                // string, "a@x.com, b@y.com", ["..."] or [{ name, address }]
    "cc": ["qa@maildrop.cc"],                 // optional
    "bcc": "audit@maildrop.cc",               // optional
    "replyTo": "support@imdefa.com",          // optional
    "subject": "Reset your password",
    "html": "<!doctype html><html>...</html>",// the fully rendered HTML
    "text": "Plain text version",             // optional
    "headers": { "X-Custom": "1" },           // optional
    "priority": "normal",                     // optional: high | normal | low
    "messageId": "<abc@your-app>",            // optional
    "attachments": [                          // optional, max 25, max 10 MB each
      {
        "filename": "invoice.pdf",
        "contentType": "application/pdf",
        "contentBase64": "JVBERi0xLjcK...",   // file bytes as base64
        "cid": "logo1"                        // optional: for <img src="cid:logo1"> inline images
      },
      { "filename": "report.pdf", "path": "https://cdn.example.com/report.pdf" } // or a URL
    ]
  },

  "templateName": "forgotPasswordTemplate",   // optional
  "templateData": { "resetLink": "https://..." }, // optional, any JSON

  "source": {                                 // optional context
    "environment": "beta",
    "service": "defa-backend",
    "appUrl": "https://beta.imdefa.com",
    "trigger": "forgot-password"
  },
  "idempotencyKey": "6f1c...-uuid",           // optional, recommended (see Retries)
  "sentAt": "2026-11-19T12:00:00.000Z"        // optional, defaults to now
}
```

A flat nodemailer object (`to`, `subject`, `html` at the top level, without `mail`) is accepted too.

**Required:** at least one valid address in `to`, `cc` or `bcc`. Everything else is optional, but send `html` (or `text`) and `subject`.

#### Responses

`201 Created`: saved

```json
{
  "success": true,
  "emailId": "6afee0489ea023e05e75c9cd",
  "messageId": "<ca8de983-...@defa-s2-be.email-portal>",
  "recipients": 1,
  "unassignedRecipients": ["hello@maildrop.cc"]
}
```

`unassignedRecipients` lists addresses no team member can see yet (an admin assigns them in the portal). This is informational, not an error.

| Status | Meaning | What to do |
|---|---|---|
| `200` + `"duplicate": true` | Same `idempotencyKey` was already saved | Nothing. It is a safe retry |
| `400` | No valid to/cc/bcc, or invalid JSON | Fix the payload |
| `401` | Missing / wrong key, bad signature, timestamp > 5 min off, project paused | Check key, secret, clock |
| `403` | Your server IP is not on the project's allow list | Ask the admin to add it |
| `413` | Body > 30 MB, html > 5 MB or text > 2 MB | Make it smaller |
| `429` | More than 600 requests per minute for this key | Back off and retry |
| `500` | Portal error | Retry with the same `idempotencyKey` |

#### Retries

Send an `idempotencyKey` (e.g. a UUID) per email and **reuse the same key** when you retry. The portal stores the email only once. Retry on network errors, `429` and `5xx`. Don't retry on other `4xx` errors.

### `GET /email-ingest/checkIngestConnection`

Use this to check your key, secret and clock. Sign it the same way, with an **empty body**: the string to sign is `"<timestamp>."`.

```json
{ "success": true, "message": "Signature valid", "project": { "key": "defa-s2-be", "name": "DeFa S2" }, "serverTime": "..." }
```

---

## Signing examples

### Node.js

```js
const crypto = require("crypto");

async function saveEmail(payload) {
  const body = JSON.stringify(payload);                       // sign THIS exact string
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = crypto
    .createHmac("sha256", process.env.EMAIL_PORTAL_SECRET)
    .update(`${timestamp}.${body}`)
    .digest("hex");

  const res = await fetch(`${process.env.EMAIL_PORTAL_URL}/email-ingest/saveEmail`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-portal-key-id": process.env.EMAIL_PORTAL_KEY_ID,
      "x-portal-timestamp": timestamp,
      "x-portal-signature": signature,
    },
    body,                                                      // the same string
  });
  return res.json();
}
```

### Python

```python
import hashlib, hmac, json, os, time, requests

def save_email(payload: dict) -> dict:
    body = json.dumps(payload, separators=(",", ":"))          # sign THIS exact string
    ts = str(int(time.time()))
    sig = hmac.new(os.environ["EMAIL_PORTAL_SECRET"].encode(), f"{ts}.{body}".encode(), hashlib.sha256).hexdigest()
    r = requests.post(
        f'{os.environ["EMAIL_PORTAL_URL"]}/email-ingest/saveEmail',
        data=body.encode(),                                    # send the same bytes, not json=
        headers={
            "Content-Type": "application/json",
            "x-portal-key-id": os.environ["EMAIL_PORTAL_KEY_ID"],
            "x-portal-timestamp": ts,
            "x-portal-signature": sig,
        },
        timeout=15,
    )
    return r.json()
```

### curl (bash)

```bash
BODY='{"mail":{"to":"hello@maildrop.cc","subject":"Hello","html":"<p>Hi</p>"}}'
TS=$(date +%s)
SIG=$(printf '%s' "$TS.$BODY" | openssl dgst -sha256 -hmac "$EMAIL_PORTAL_SECRET" -hex | sed 's/^.* //')

curl -X POST "$EMAIL_PORTAL_URL/email-ingest/saveEmail" \
  -H "Content-Type: application/json" \
  -H "x-portal-key-id: $EMAIL_PORTAL_KEY_ID" \
  -H "x-portal-timestamp: $TS" \
  -H "x-portal-signature: $SIG" \
  --data-binary "$BODY"
```

### Postman

Import [`EmailPortal-SaveEmail.postman_collection.json`](./EmailPortal-SaveEmail.postman_collection.json) and set the collection variables `baseUrl`, `keyId` and `secret`. A pre-request script signs every request automatically.

---

## Checklist before going live in beta

- [ ] Key ID and Secret are in the **beta** env / secret manager only, not in git.
- [ ] `EMAIL_DELIVERY_MODE=portal` is set in beta and **not** set in production.
- [ ] `GET /email-ingest/checkIngestConnection` returns `"Signature valid"` from the beta server.
- [ ] One test email shows up in the portal, and an admin has assigned its address to you.
