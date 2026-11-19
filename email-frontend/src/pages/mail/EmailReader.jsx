import { useEffect, useState } from "react";
import {
  ArrowLeft, Star, MailOpen, Paperclip, Download, ExternalLink, Info, Eye, Copy, Check,
  ChevronDown, ChevronUp, AlertTriangle, Globe, Users, HardDrive,
} from "lucide-react";
import { Avatar, ProjectTag, EmptyState, firstLetter } from "../../components/ui";
import { ReaderSkeleton } from "../../components/Skeletons";
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

function PersonChip({ person }) {
  return (
    <span className="person-chip" title={person.address}>
      <Avatar email={person.address} letter={firstLetter(person.address)} size={24} />
      <span className="person-text">
        {person.name && <b>{person.name}</b>}
        <span>{person.address}</span>
      </span>
    </span>
  );
}

function DetailsTab({ email }) {
  const s = email.source || {};
  const people = [
    ["From", email.from ? [email.from] : []],
    ["To", email.to],
    ["Cc", email.cc],
    ["Bcc", email.bcc],
    ["Reply-To", email.replyTo],
  ].filter(([, list]) => list && list.length);
  const files = (email.attachments || []).filter((a) => !a.isInline).length;
  const tiles = [
    { icon: Globe, label: "Project", value: email.project ? <ProjectTag project={email.project} /> : "—" },
    { icon: HardDrive, label: "Size", value: formatBytes(email.sizeBytes) },
    { icon: Paperclip, label: "Attachments", value: files ? String(files) : "None" },
  ];

  return (
    <div className="dt">
      <div className="dt-tiles">
        {tiles.map(({ icon: Icon, label, value, sub, title }) => (
          <div className="dt-tile" key={label} title={title}>
            <span className="dt-tile-icon">
              <Icon size={16} />
            </span>
            <div style={{ minWidth: 0 }}>
              <span className="dt-label">{label}</span>
              <div className="dt-value">{value}</div>
              {sub && <span className="dt-sub">{sub}</span>}
            </div>
          </div>
        ))}
      </div>

      <div className="dt-grid">
        <section className="dt-card">
          <h4>
            <Users size={15} /> People
          </h4>
          <div className="dt-people">
            {people.map(([label, list]) => (
              <div className="dt-people-row" key={label}>
                <span className="dt-label">{label}</span>
                <div className="dt-chips">
                  {list.map((p) => (
                    <PersonChip key={label + p.address} person={p} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="dt-card">
          <h4>
            <Info size={15} /> Message
          </h4>
          <div className="dt-rows">
            <div className="dt-row">
              <span className="dt-label">Subject</span>
              <span className="dt-row-value">{email.subject}</span>
            </div>
            {(s.domain || s.appUrl) && (
              <div className="dt-row">
                <span className="dt-label">Sent from</span>
                <span className="dt-row-value">
                  {s.appUrl ? (
                    <a href={s.appUrl} target="_blank" rel="noreferrer noopener" className="dt-link">
                      {s.domain || s.appUrl} <ExternalLink size={12} />
                    </a>
                  ) : (
                    s.domain
                  )}
                </span>
              </div>
            )}
            <div className="dt-row">
              <span className="dt-label">Priority</span>
              <span className="dt-row-value">
                <span className={`badge ${email.priority === "high" ? "danger" : email.priority === "low" ? "" : "primary"}`}>
                  {email.priority || "normal"}
                </span>
              </span>
            </div>
            <div className="dt-row">
              <span className="dt-label">Message ID</span>
              <span className="dt-row-value">
                <span className="dt-id">
                  <span className="mono truncate">{email.messageId}</span>
                  <IdCopy text={email.messageId} />
                </span>
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function IdCopy({ text }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="icon-btn sm"
      title="Copy"
      onClick={async () => {
        if (await copyText(text)) {
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        }
      }}
    >
      {done ? <Check size={14} color="var(--success)" /> : <Copy size={14} />}
    </button>
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
  if (!email) return <ReaderSkeleton />;

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
          <h1 className="reader-title">
            {email.subject}
            {email.project && (
              <span className="reader-project">
                <ProjectTag project={email.project} />
              </span>
            )}
          </h1>
        </div>

        <div className="sender">
          <Avatar
            email={email.mailboxes[0] || email.to[0]?.address}
            letter={firstLetter(email.mailboxes[0] || email.to[0]?.address)}
            size={42}
          />
          <div className="sender-info">
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              <b>{email.from?.name || email.from?.address || email.project?.name || email.subject}</b>
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
