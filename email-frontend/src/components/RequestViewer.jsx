import { useState } from "react";
import { Copy, Check, Terminal, User as UserIcon, Server, Globe, Clock, HardDrive, AlertTriangle } from "lucide-react";
import { copyText, formatBytes, formatFullDate } from "../utils/format";
import "../styles/request-viewer.css";

// ---------- helpers ----------
const statusTone = (s) => (s >= 500 ? "bad" : s >= 400 ? "warn" : "ok");
const msLabel = (ms) => (ms == null ? "—" : ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`);
const count = (obj) => (obj && typeof obj === "object" ? Object.keys(obj).length : 0);
const STATUS_TEXT = { 200: "OK", 201: "Created", 204: "No Content", 400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found", 409: "Conflict", 413: "Too Large", 429: "Too Many Requests", 500: "Server Error" };

// JSON with colours (keys, strings, numbers, booleans) - React escapes every value
const TOKEN = /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(?:\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
const HIGHLIGHT_LIMIT = 200000; // bigger bodies (full email HTML) are shown as plain text - fast
function JsonView({ value }) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  if (text.length > HIGHLIGHT_LIMIT) return <pre className="rv-code">{text}</pre>;
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const t = m[0];
    const cls = t.startsWith('"') ? (t.trimEnd().endsWith(":") ? "j-key" : "j-str") : /true|false/.test(t) ? "j-bool" : t === "null" ? "j-null" : "j-num";
    parts.push(
      <span key={m.index} className={cls}>
        {t}
      </span>
    );
    last = m.index + t.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <pre className="rv-code">{parts}</pre>;
}

function HeaderTable({ headers }) {
  if (!headers) return <div className="rv-empty">Headers were not recorded for this call.</div>;
  const rows = Object.entries(headers);
  if (!rows.length) return <div className="rv-empty">No headers</div>;
  return (
    <table className="rv-kv">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <td>{k}</td>
            <td className={v === "[REDACTED]" ? "redacted" : ""}>{Array.isArray(v) ? v.join(", ") : String(v)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Tabs({ tabs, value, onChange }) {
  return (
    <div className="rv-tabs" role="tablist">
      {tabs.map(([key, label, n]) => (
        <button key={key} role="tab" aria-selected={value === key} className={value === key ? "on" : ""} onClick={() => onChange(key)}>
          {label}
          {n !== undefined && <span className="rv-count">{n}</span>}
        </button>
      ))}
    </div>
  );
}

function CopyBtn({ text, label, icon: Icon = Copy }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="rv-copy"
      onClick={async () => {
        if (await copyText(text)) {
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        }
      }}
    >
      {done ? <Check size={14} /> : <Icon size={14} />} {done ? "Copied" : label}
    </button>
  );
}

// curl command to replay the call (redacted values stay redacted)
const SKIP_CURL = new Set(["host", "content-length", "connection", "accept-encoding", "sec-fetch-site", "sec-fetch-mode", "sec-fetch-dest", "sec-ch-ua", "sec-ch-ua-mobile", "sec-ch-ua-platform"]);
const q = (s) => `'${String(s).replace(/'/g, "'\\''")}'`;
const toCurl = (log) => {
  const lines = [`curl -X ${log.method} ${q(log.fullUrl || log.url || log.path)}`];
  Object.entries(log.requestHeaders || {}).forEach(([k, v]) => {
    if (!SKIP_CURL.has(k.toLowerCase())) lines.push(`  -H ${q(`${k}: ${v}`)}`);
  });
  if (log.requestBody) lines.push(`  --data-raw ${q(JSON.stringify(log.requestBody))}`);
  return lines.join(" \\\n");
};

/**
 * Postman-style view of one logged API call:
 *   [METHOD | full URL]  status · time · size
 *   Request:  Body | Headers | Query
 *   Response: Body | Headers
 */
export default function RequestViewer({ log }) {
  const [reqTab, setReqTab] = useState(log.requestBody ? "body" : "headers");
  const [resTab, setResTab] = useState("body");
  const tone = statusTone(log.status);

  return (
    <div className="rv">
      {/* request bar */}
      <div className="rv-bar">
        <span className={`rv-method m-${log.method}`}>{log.method}</span>
        <div className="rv-url" title={log.fullUrl || log.url}>
          {log.fullUrl || log.url || log.path}
        </div>
        <CopyBtn text={log.fullUrl || log.url || log.path} label="URL" />
      </div>

      {/* who / when */}
      <div className="rv-meta">
        {log.userEmail ? (
          <span>
            <UserIcon size={13} /> {log.userEmail} <i>{log.userRole}</i>
          </span>
        ) : log.projectKey ? (
          <span>
            <Server size={13} /> {log.projectKey}
          </span>
        ) : (
          <span>
            <Globe size={13} /> anonymous
          </span>
        )}
        {log.ip && <span className="mono">{log.ip}</span>}
        <span>
          <Clock size={13} /> {formatFullDate(log.createdAt)}
        </span>
        <div className="spacer" />
        <CopyBtn text={toCurl(log)} label="Copy as cURL" icon={Terminal} />
      </div>

      {/* request */}
      <section className="rv-section">
        <div className="rv-head">
          <span className="rv-title">Request</span>
          <Tabs
            value={reqTab}
            onChange={setReqTab}
            tabs={[
              ["body", "Body"],
              ["headers", "Headers", count(log.requestHeaders)],
              ["query", "Query", count(log.query)],
            ]}
          />
        </div>
        <div className="rv-pane">
          {reqTab === "body" && (log.requestBody ? <JsonView value={log.requestBody} /> : <div className="rv-empty">This request has no body</div>)}
          {reqTab === "headers" && <HeaderTable headers={log.requestHeaders} />}
          {reqTab === "query" && (count(log.query) ? <HeaderTable headers={log.query} /> : <div className="rv-empty">No query parameters</div>)}
        </div>
      </section>

      {/* response */}
      <section className="rv-section">
        <div className="rv-head">
          <span className="rv-title">Response</span>
          <span className={`rv-status ${tone}`}>
            {log.status} {STATUS_TEXT[log.status] || ""}
          </span>
          <span className="rv-chip">
            <Clock size={12} /> {msLabel(log.durationMs)}
          </span>
          {log.responseSize > 0 && (
            <span className="rv-chip">
              <HardDrive size={12} /> {formatBytes(log.responseSize)}
            </span>
          )}
          <div className="spacer" />
          <Tabs
            value={resTab}
            onChange={setResTab}
            tabs={[
              ["body", "Body"],
              ["headers", "Headers", count(log.responseHeaders)],
            ]}
          />
        </div>
        {log.errorMessage && (
          <div className="rv-error">
            <AlertTriangle size={14} /> {log.errorMessage}
          </div>
        )}
        <div className="rv-pane">
          {resTab === "body" &&
            (log.responseBody !== null && log.responseBody !== undefined ? (
              <JsonView value={log.responseBody} />
            ) : (
              <div className="rv-empty">No JSON body (e.g. a file download)</div>
            ))}
          {resTab === "headers" && <HeaderTable headers={log.responseHeaders} />}
        </div>
      </section>

      {log.userAgent && <div className="rv-foot">{log.userAgent}</div>}
    </div>
  );
}
