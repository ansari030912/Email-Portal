import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollText, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { Avatar, EmptyState, Spinner } from "../../components/ui";
import { getActivityLogs } from "../../api/endpoints";
import { useToast } from "../../context/ToastContext";
import { formatFullDate } from "../../utils/format";
import "../../styles/admin.css";

const TONE = (action) =>
  /BLOCKED|LOCKED|DISABLED|RESET|UNASSIGNED|ROTATED/.test(action) ? "danger" : /ROLE|ASSIGNED|USERS_SET|KEY_CREATED/.test(action) ? "primary" : /ENABLED|SUCCESS|REGISTERED/.test(action) ? "success" : "";

const summary = (d = {}) => {
  if (d.from && d.to) return `${d.email ? `${d.email}: ` : ""}${d.from} → ${d.to}`;
  if (d.recipientMailboxIds) return `${d.recipientMailboxIds.length} mailbox(es) · ${d.userIds?.length || 0} user(s)`;
  if (d.projectKey) return d.projectKey;
  if (d.email) return d.email;
  return "";
};

export default function ActivityPage() {
  const toast = useToast();
  const [logs, setLogs] = useState([]);
  const [actions, setActions] = useState([]);
  const [action, setAction] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);

  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [fetching, setFetching] = useState(false);
  const requestId = useRef(0);

  // only typing is debounced - the action filter / paging fetch immediately
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setFetching(true);
    try {
      const d = await getActivityLogs({ action, search: debouncedSearch, page, limit: 30 });
      if (id !== requestId.current) return;
      setLogs(d.logs);
      setActions(d.actions);
      setPagination(d.pagination);
    } catch (e) {
      if (id === requestId.current) toast.error(e.message);
    } finally {
      if (id === requestId.current) {
        setLoading(false);
        setFetching(false);
      }
    }
  }, [action, debouncedSearch, page, toast]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => setPage(1), [action, debouncedSearch]);

  return (
    <div className="page">
      <div className="page-inner">
        <div className="page-head">
          <div>
            <h1>Activity log</h1>
            <p>Logins, 2FA, role changes, mailbox access and project keys - who did what, from where.</p>
          </div>
        </div>
        <div className="card">
          <div className="toolbar">
            <div className="input-wrap" style={{ width: 280, maxWidth: "100%" }}>
              <Search size={16} />
              <input className="input sm" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search email, action or IP" />
            </div>
            <select className="select sm" style={{ width: 240 }} value={action} onChange={(e) => setAction(e.target.value)}>
              <option value="">All actions</option>
              {actions.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          {loading ? (
            <div className="full-center" style={{ padding: 60 }}><Spinner size={24} /></div>
          ) : !logs.length ? (
            <EmptyState icon={ScrollText} title="No activity yet" />
          ) : (
            <div className={`table-wrap ${fetching ? "is-fetching" : ""}`}>
              <table className="table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Who</th>
                    <th>Action</th>
                    <th>Details</th>
                    <th>IP</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l) => (
                    <tr key={l._id}>
                      <td style={{ whiteSpace: "nowrap", fontSize: 12.5 }}>{formatFullDate(l.createdAt)}</td>
                      <td>
                        <div className="user-cell">
                          <Avatar email={l.actorEmail} size={28} />
                          <div style={{ minWidth: 0 }}>
                            <b style={{ fontSize: 13 }}>
                              <span className="truncate">{l.actorEmail || "system"}</span>
                            </b>
                            <span>{l.actorRole}</span>
                          </div>
                        </div>
                      </td>
                      <td><span className={`badge action-badge ${TONE(l.action)}`}>{l.action}</span></td>
                      <td className="muted" style={{ fontSize: 12.5 }}>{summary(l.details)}</td>
                      <td className="mono faint">{l.ip}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {pagination.pages > 1 && (
            <div className="pager">
              Page {pagination.page} of {pagination.pages}
              <div className="spacer" />
              <button className="icon-btn sm" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={17} /></button>
              <button className="icon-btn sm" disabled={page >= pagination.pages} onClick={() => setPage(page + 1)}><ChevronRight size={17} /></button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
