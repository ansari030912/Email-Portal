import { useEffect, useState } from "react";
import {
  ArrowLeft, Star, MailOpen, Paperclip, Download, ExternalLink, FileText, Code2, Info, Eye, Copy, Check,
  ChevronDown, ChevronUp, AlertTriangle, Globe, Server, User as UserIcon,
} from "lucide-react";
import { Avatar, ProjectTag, Spinner, EmptyState } from "../../components/ui";
import EmailFrame from "./EmailFrame";
import { attachmentUrl, getEmailById } from "../../api/endpoints";
import { copyText, formatBytes, formatFullDate } from "../../utils/format";

const fmtList = (list) => (list?.length ? list.map((a) => (a.name ? `${a.name} <${a.address}>` : a.address)).join(", ") : null);

function CopyButton({ text, label = "Copy" }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="btn btn-secondary btn-sm"
      onClick={async () => {
        if (await copyText(text)) {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        }
      }}
    >
      {done ? <Check size={14} color="var(--success)" /> : <Copy size={14} />} {done ? "Copied" : label}
    </button>
  );
}

function KV({ rows }) {
  return (
    <dl className="kv">
      {rows
        .filter(([, v]) => v !== null && v !== undefined && v !== "")
        .map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
    </dl>
  );
}

function DetailsTab({ email }) {
  const s = email.source || {};
  return (
    <div className="details">
      <section>
        <h4>
          <Info size={15} /> Message
        </h4>
        <KV
          rows={[
            ["Subject", email.subject],
            ["Sent at (project)", formatFullDate(email.sentAt)],
            ["Captured by portal", formatFullDate(email.receivedAt)],
            ["Message-ID", <span className="mono">{email.messageId}</span>],
            ["Size", formatBytes(email.sizeBytes)],
            ["Priority", email.priority],
          ]}
        />
      </section>
      <section>
        <h4>
          <UserIcon size={15} /> Envelope
        </h4>
        <KV
          rows={[
            ["From", fmtList(email.from ? [email.from] : [])],
            ["Sender", fmtList(email.sender ? [email.sender] : [])],
            ["Reply-To", fmtList(email.replyTo)],
            ["To", fmtList(email.to)],
            ["Cc", fmtList(email.cc)],
            ["Bcc", fmtList(email.bcc)],
          ]}
        />
      </section>
      <section>
        <h4>
          <Globe size={15} /> Source
        </h4>
        <KV
          rows={[
            ["Project", email.project ? `${email.project.name} (${email.project.key})` : null],
            ["Environment", s.environment],
            ["Service", s.service],
            ["App URL", s.appUrl && <a href={s.appUrl} target="_blank" rel="noreferrer noopener">{s.appUrl}</a>],
            ["Domain", s.domain],
            ["Trigger", s.trigger],
          ]}
        />
      </section>
      <section>
        <h4>
          <Server size={15} /> Server
        </h4>
        <KV
          rows={[
            ["Hostname", s.serverHostname],
            ["Server IPs", s.serverIps?.join(", ")],
            ["Request IP", s.requestIp],
            ["Client", s.userAgent],
            ["Node", s.nodeVersion],
            ["SDK", s.sdkVersion],
          ]}
        />
      </section>
      <section className="span-2">
        <h4>
          <UserIcon size={15} /> Linked accounts in {email.project?.name || "project"}
        </h4>
        <div className="table-wrap">
          <table className="table compact">
            <thead>
              <tr>
                <th>Address</th>
                <th>Field</th>
                <th>User / Admin _id</th>
                <th>Type</th>
                <th>Role</th>
              </tr>
            </thead>
            <tbody>
              {email.recipients.map((r) => (
                <tr key={`${r.kind}-${r.address}`}>
                  <td>{r.address}</td>
                  <td>
                    <span className="badge">{r.kind}</span>
                  </td>
                  <td className="mono">{r.userId || <span className="faint">not linked</span>}</td>
                  <td>{r.userType || "—"}</td>
                  <td>{r.userRole || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {(email.templateName || email.templateData) && (
        <section className="span-2">
          <h4 style={{ justifyContent: "space-between" }}>
            <span className="row">
              <FileText size={15} /> Template {email.templateName && <span className="badge primary">{email.templateName}</span>}
            </span>
            {email.templateData && <CopyButton text={JSON.stringify(email.templateData, null, 2)} label="Copy JSON" />}
          </h4>
          {email.templateData ? <pre className="code">{JSON.stringify(email.templateData, null, 2)}</pre> : <p className="faint">No template variables sent.</p>}
        </section>
      )}
      {email.headers && (
        <section className="span-2">
          <h4>
            <Code2 size={15} /> Custom headers
          </h4>
          <pre className="code">{JSON.stringify(email.headers, null, 2)}</pre>
        </section>
      )}
    </div>
  );
}

export default function EmailReader({ emailId, onBack, onToggleStar, onMarkUnread, onLoaded }) {
  const [email, setEmail] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("preview");
  const [showHeaders, setShowHeaders] = useState(false);

  useEffect(() => {
    let alive = true;
    setEmail(null);
    setError("");
    setTab("preview");
    setShowHeaders(false);
    getEmailById(emailId)
      .then((d) => {
        if (!alive) return;
        setEmail(d.email);
        onLoaded?.(d.email);
      })
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailId]);

  if (error) {
    return (
      <div className="reader">
        <EmptyState icon={AlertTriangle} title="Can't open this email">
          {error}
        </EmptyState>
      </div>
    );
  }
  if (!email) {
    return (
      <div className="reader full-center">
        <Spinner size={26} />
      </div>
    );
  }

  const files = email.attachments.filter((a) => !(a.isInline && a.cid && a.downloadable && email.html?.includes("data:")));
  const tabs = [
    { key: "preview", label: "Preview", icon: Eye, show: !!email.html || !!email.text },
    { key: "details", label: "Details", icon: Info, show: true },
  ].filter((t) => t.show);

  const toggleStar = async () => {
    const next = !email.isStarred;
    setEmail((e) => ({ ...e, isStarred: next }));
    try {
      await onToggleStar({ _id: email._id, isStarred: email.isStarred });
    } catch {
      setEmail((e) => ({ ...e, isStarred: !next }));
    }
  };

  return (
    <div className="reader" key={email._id}>
      <div className="reader-toolbar">
        <button className="icon-btn reader-back" onClick={onBack} aria-label="Back to list">
          <ArrowLeft size={19} />
        </button>
        <div className="tabs">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button key={key} className={`tab ${tab === key ? "active" : ""}`} onClick={() => setTab(key)}>
              <Icon size={15} /> <span>{label}</span>
            </button>
          ))}
        </div>
        <div className="spacer" />
        <button className={`icon-btn ${email.isStarred ? "starred" : ""}`} onClick={toggleStar} title={email.isStarred ? "Unstar" : "Star"}>
          <Star size={18} fill={email.isStarred ? "currentColor" : "none"} />
        </button>
        <button className="icon-btn" onClick={() => onMarkUnread(email)} title="Mark as unread">
          <MailOpen size={18} />
        </button>
      </div>

      <div className="reader-scroll">
        <div className="reader-head">
          <h1>{email.subject}</h1>
          <div className="row" style={{ flexWrap: "wrap", marginTop: 10 }}>
            <ProjectTag project={email.project} />
            {email.source?.environment && <span className="badge warning">{email.source.environment}</span>}
            {email.templateName && <span className="badge">{email.templateName}</span>}
            {email.sourceUserId && (
              <span className="badge primary" title="User / admin _id in the project">
                <UserIcon size={11} /> {email.sourceUserType || "user"} · {email.sourceUserId}
              </span>
            )}
          </div>
        </div>

        <div className="sender">
          <Avatar name={email.from?.name} email={email.from?.address} size={42} />
          <div className="sender-info">
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              <b>{email.from?.name || email.from?.address || "Unknown sender"}</b>
              {email.from?.name && <span className="faint">&lt;{email.from.address}&gt;</span>}
            </div>
            <button className="to-line" onClick={() => setShowHeaders((s) => !s)}>
              to {email.mailboxes.join(", ") || fmtList(email.to)}
              {(email.cc.length > 0 || email.bcc.length > 0 || email.to.length > 1) && (
                <span className="faint"> +{email.to.length - 1 + email.cc.length + email.bcc.length} more</span>
              )}
              {showHeaders ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
          <span className="sender-date">{formatFullDate(email.sentAt)}</span>
        </div>

        {showHeaders && (
          <div className="header-card">
            <KV
              rows={[
                ["from", fmtList(email.from ? [email.from] : [])],
                ["reply-to", fmtList(email.replyTo)],
                ["to", fmtList(email.to)],
                ["cc", fmtList(email.cc)],
                ["bcc", fmtList(email.bcc)],
                ["date", formatFullDate(email.sentAt)],
                ["subject", email.subject],
                ["mailed-by", email.source?.domain || email.project?.name],
                ["project", email.project?.name],
              ]}
            />
          </div>
        )}

        <div className="reader-body">
          {tab === "preview" &&
            (email.html ? (
              <div className="email-canvas">
                <EmailFrame html={email.html} />
              </div>
            ) : (
              <pre className="plain">{email.text}</pre>
            ))}
          {tab === "details" && <DetailsTab email={email} />}
        </div>

        {files.length > 0 && (
          <div className="attachments">
            <div className="attachments-title">
              <Paperclip size={15} /> {files.length} attachment{files.length > 1 ? "s" : ""}
            </div>
            <div className="attachment-grid">
              {files.map((a) => (
                <div key={a._id} className="attachment">
                  <div className="attachment-icon">{(a.filename.split(".").pop() || "file").slice(0, 4).toUpperCase()}</div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="truncate" style={{ fontWeight: 600 }}>{a.filename}</div>
                    <div className="hint truncate">{a.skippedReason || `${formatBytes(a.size)} · ${a.contentType}`}</div>
                  </div>
                  {a.downloadable && (
                    <a className="icon-btn sm" href={attachmentUrl(email._id, a._id)} download={a.filename} title="Download">
                      <Download size={16} />
                    </a>
                  )}
                  {!a.downloadable && a.remoteUrl && (
                    <a className="icon-btn sm" href={a.remoteUrl} target="_blank" rel="noreferrer noopener" title="Open link">
                      <ExternalLink size={16} />
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
