import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { RefreshCw, ChevronLeft, ChevronRight, MailOpen, Mail, Inbox, Lock, Star, SearchX, MailCheck } from "lucide-react";
import EmailList, { EmailListSkeleton } from "./EmailList";
import EmailReader from "./EmailReader";
import { EmptyState } from "../../components/ui";
import { ChipsSkeleton } from "../../components/Skeletons";
import { getMyInboxEmails, getMyInboxProjects, updateEmailReadStatus, updateEmailStarStatus } from "../../api/endpoints";
import { useMailboxes } from "../../context/MailboxContext";
import { useToast } from "../../context/ToastContext";
import { colorFor } from "../../utils/format";
import "../../styles/mail.css";

const FOLDER_TITLES = { inbox: "Inbox", unread: "Unread", starred: "Starred" };
const POLL_MS = 30000;

export default function MailPage() {
  const [params, setParams] = useSearchParams();
  const box = params.get("box") || "all";
  const folder = params.get("folder") || "inbox";
  const q = params.get("q") || "";
  const project = params.get("project") || "";
  const page = Number(params.get("page") || 1);
  const openId = params.get("id");

  const { refresh: refreshMailboxes, mailboxes, loaded: mailboxesLoaded } = useMailboxes();
  const toast = useToast();
  const [emails, setEmails] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0, limit: 30 });
  const [loading, setLoading] = useState(true);
  const [spinning, setSpinning] = useState(false);
  const [noMailboxes, setNoMailboxes] = useState(false);
  const [projects, setProjects] = useState([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const listRef = useRef(null);
  const queryKey = `${box}|${folder}|${q}|${project}|${page}`;

  const setParam = useCallback(
    (changes) => {
      const next = new URLSearchParams(params);
      Object.entries(changes).forEach(([k, v]) => (v === null || v === undefined || v === "" ? next.delete(k) : next.set(k, v)));
      setParams(next);
    },
    [params, setParams]
  );

  const load = useCallback(
    async ({ silent } = {}) => {
      if (!silent) setLoading(true);
      try {
        const data = await getMyInboxEmails({ mailbox: box, folder, search: q, project, page, limit: 30 });
        setEmails(data.emails);
        setPagination(data.pagination);
        setNoMailboxes(!!data.noMailboxes);
      } catch (err) {
        if (!silent) {
          toast.error(err.message);
          setEmails([]);
        }
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryKey]
  );

  useEffect(() => {
    setSelected(new Set());
    load();
    listRef.current?.scrollTo({ top: 0 });
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => document.visibilityState === "visible" && load({ silent: true }), POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    getMyInboxProjects()
      .then((d) => setProjects(d.projects))
      .catch(() => {})
      .finally(() => setProjectsLoaded(true));
  }, [mailboxes.length]);

  const refresh = async () => {
    setSpinning(true);
    await Promise.all([load({ silent: true }), refreshMailboxes()]);
    setTimeout(() => setSpinning(false), 400);
  };

  const patchEmails = (ids, patch) => setEmails((list) => list.map((e) => (ids.includes(e._id) ? { ...e, ...patch } : e)));

  const openEmail = (e) => {
    setParam({ id: e._id });
    if (!e.isRead) patchEmails([e._id], { isRead: true });
  };

  const onReaderLoaded = () => refreshMailboxes();

  const toggleStar = async (e) => {
    const next = !e.isStarred;
    patchEmails([e._id], { isStarred: next });
    try {
      await updateEmailStarStatus({ emailId: e._id, isStarred: next });
      refreshMailboxes();
      if (folder === "starred" && !next) setEmails((l) => l.filter((x) => x._id !== e._id));
    } catch (err) {
      patchEmails([e._id], { isStarred: !next });
      toast.error(err.message);
      throw err;
    }
  };

  const setRead = async (ids, isRead) => {
    if (!ids.length) return;
    patchEmails(ids, { isRead });
    try {
      await updateEmailReadStatus({ emailIds: ids, isRead });
      refreshMailboxes();
      setSelected(new Set());
      if (folder === "unread" && isRead) setEmails((l) => l.filter((x) => !ids.includes(x._id)));
    } catch (err) {
      toast.error(err.message);
      load({ silent: true });
    }
  };

  const markUnreadFromReader = async (email) => {
    await setRead([email._id], false);
    setParam({ id: null });
  };

  const toggleSelect = (id) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const allSelected = emails.length > 0 && emails.every((e) => selected.has(e._id));
  const someSelected = selected.size > 0 && !allSelected;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(emails.map((e) => e._id)));

  const title = useMemo(() => {
    if (q) return `Results for "${q}"`;
    return FOLDER_TITLES[folder] || "Inbox";
  }, [q, folder]);

  const from = pagination.total ? (pagination.page - 1) * pagination.limit + 1 : 0;
  const to = Math.min(pagination.total, pagination.page * pagination.limit);
  const selectedIds = [...selected];

  const emptyView = () => {
    if (noMailboxes || (mailboxesLoaded && mailboxes.length === 0)) {
      return (
        <EmptyState icon={Lock} title="No mails yet">
          Mails will appear here.
        </EmptyState>
      );
    }
    if (q) return <EmptyState icon={SearchX} title="No emails match your search">Try a different word, address or template name.</EmptyState>;
    if (folder === "starred") return <EmptyState icon={Star} title="No starred emails">Star an email to find it here quickly.</EmptyState>;
    if (folder === "unread") return <EmptyState icon={MailCheck} title="You're all caught up">No unread emails in this view.</EmptyState>;
    return <EmptyState icon={Inbox} title="Nothing here yet">New messages will show up here.</EmptyState>;
  };

  return (
    <div className={`mail ${openId ? "has-open" : ""}`}>
      <section className="mail-list">
        <div className="mail-list-head">
          <div style={{ minWidth: 0 }}>
            <h2 className="truncate">{title}</h2>
            <div className="mail-list-sub truncate">
              {box === "all" ? (
                "All your mailboxes"
              ) : (
                <>
                  <span className="mailbox-dot" style={{ background: colorFor(box), display: "inline-block", margin: "0 6px 0 0" }} />
                  {box}
                </>
              )}
            </div>
          </div>
          <div className="spacer" />
          <button className={`icon-btn ${spinning ? "spin" : ""}`} onClick={refresh} title="Refresh">
            <RefreshCw size={17} />
          </button>
        </div>

        {!projectsLoaded && <ChipsSkeleton />}
        {projectsLoaded && projects.length > 1 && (
          <div className="filter-chips">
            <button className={`fchip ${!project ? "on" : ""}`} onClick={() => setParam({ project: null, page: null, id: null })}>
              All projects
            </button>
            {projects.map((p) => (
              <button
                key={p.key}
                className={`fchip ${project === p.key ? "on" : ""}`}
                style={{ "--c": colorFor(p.key) }}
                onClick={() => setParam({ project: p.key, page: null, id: null })}
              >
                <span className="mailbox-dot" style={{ background: colorFor(p.key), margin: 0 }} />
                {p.name}
              </button>
            ))}
          </div>
        )}

        <div className="mail-toolbar">
          <input
            type="checkbox"
            className="checkbox"
            checked={allSelected}
            ref={(el) => el && (el.indeterminate = someSelected)}
            onChange={toggleAll}
            disabled={!emails.length}
            aria-label="Select all"
          />
          {selected.size > 0 ? (
            <>
              <span className="sel-count">{selected.size} selected</span>
              <button className="icon-btn sm" title="Mark as read" onClick={() => setRead(selectedIds, true)}>
                <MailOpen size={16} />
              </button>
              <button className="icon-btn sm" title="Mark as unread" onClick={() => setRead(selectedIds, false)}>
                <Mail size={16} />
              </button>
            </>
          ) : (
            <span className="faint" style={{ fontSize: 12.5 }}>
              {pagination.total ? `${from}–${to} of ${pagination.total}` : ""}
            </span>
          )}
          <div className="spacer" />
          <button className="icon-btn sm" disabled={page <= 1} onClick={() => setParam({ page: page - 1, id: null })} aria-label="Previous page">
            <ChevronLeft size={17} />
          </button>
          <button className="icon-btn sm" disabled={page >= pagination.pages} onClick={() => setParam({ page: page + 1, id: null })} aria-label="Next page">
            <ChevronRight size={17} />
          </button>
        </div>

        <div className="mail-scroll" ref={listRef}>
          {loading ? (
            <EmailListSkeleton />
          ) : emails.length ? (
            <EmailList
              emails={emails}
              activeId={openId}
              selected={selected}
              onToggleSelect={toggleSelect}
              onOpen={openEmail}
              onToggleStar={(e) => toggleStar(e).catch(() => {})}
              showMailbox={box === "all"}
            />
          ) : (
            emptyView()
          )}
        </div>
      </section>

      <section className="mail-reader">
        {openId ? (
          <EmailReader
            emailId={openId}
            onBack={() => setParam({ id: null })}
            onToggleStar={(e) => toggleStar(e)}
            onMarkUnread={markUnreadFromReader}
            onLoaded={onReaderLoaded}
          />
        ) : (
          <EmptyState icon={Mail} title="Select an email to read">
            Choose a message from the list to open it here.
          </EmptyState>
        )}
      </section>
    </div>
  );
}
