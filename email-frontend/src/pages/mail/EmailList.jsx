import { Star, Paperclip } from "lucide-react";
import { Avatar, ProjectTag } from "../../components/ui";
import { colorFor, displayAddress, formatListDate } from "../../utils/format";

export function EmailListSkeleton() {
  return (
    <div>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="mail-item" style={{ cursor: "default" }}>
          <span className="skeleton" style={{ width: 38, height: 38, borderRadius: "50%" }} />
          <div style={{ flex: 1 }}>
            <div className="skeleton" style={{ width: "45%", height: 12, marginBottom: 9 }} />
            <div className="skeleton" style={{ width: "85%", height: 11, marginBottom: 7 }} />
            <div className="skeleton" style={{ width: "60%", height: 10 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function EmailList({ emails, activeId, selected, onToggleSelect, onOpen, onToggleStar, showMailbox }) {
  return (
    <ul className="mail-items">
      {emails.map((e, idx) => {
        const isSel = selected.has(e._id);
        return (
          <li
            key={e._id}
            className={`mail-item ${e.isRead ? "" : "unread"} ${activeId === e._id ? "active" : ""} ${isSel ? "selected" : ""}`}
            onClick={() => onOpen(e)}
            style={{ animationDelay: `${Math.min(idx, 12) * 18}ms` }}
          >
            <div className="mail-item-side" onClick={(ev) => ev.stopPropagation()}>
              <div className="avatar-or-check">
                <Avatar name={e.from?.name} email={e.from?.address} size={38} />
                <input type="checkbox" className="checkbox" checked={isSel} onChange={() => onToggleSelect(e._id)} aria-label="Select email" />
              </div>
              <button
                className={`star-btn ${e.isStarred ? "on" : ""}`}
                onClick={() => onToggleStar(e)}
                aria-label={e.isStarred ? "Unstar" : "Star"}
              >
                <Star size={15} fill={e.isStarred ? "currentColor" : "none"} />
              </button>
            </div>

            <div className="mail-item-body">
              <div className="mail-item-top">
                <span className="mail-from truncate">{displayAddress(e.from)}</span>
                <span className="mail-date">{formatListDate(e.sentAt)}</span>
              </div>
              <div className="mail-subject truncate">{e.subject}</div>
              <div className="mail-snippet truncate">{e.snippet || "No preview"}</div>
              <div className="mail-meta">
                <ProjectTag project={e.project} />
                {showMailbox &&
                  e.mailboxes.slice(0, 2).map((m) => (
                    <span key={m} className="mail-to-chip truncate" title={`Delivered to ${m}`}>
                      <span className="mailbox-dot" style={{ background: colorFor(m), margin: 0 }} />
                      {m}
                    </span>
                  ))}
                {e.attachmentCount > 0 && (
                  <span className="mail-attach">
                    <Paperclip size={12} /> {e.attachmentCount}
                  </span>
                )}
                {e.templateName && <span className="mail-template truncate">{e.templateName}</span>}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
