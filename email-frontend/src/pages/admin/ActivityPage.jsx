import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollText, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { Avatar, EmptyState } from "../../components/ui";
import { TableSkeleton } from "../../components/Skeletons";
import SelectMenu from "../../components/SelectMenu";
import Pagination from "../../components/Pagination";
import { getActivityLogs } from "../../api/endpoints";
import { useToast } from "../../context/ToastContext";
import { formatFullDate } from "../../utils/format";
import "../../styles/admin.css";

const TONE = (action) =>
  /BLOCKED|LOCKED|DISABLED|RESET|UNASSIGNED|ROTATED|REVOKED|DELETED/.test(action) ? "danger" : /ROLE|ASSIGNED|USERS_SET|KEY_CREATED|INVITE_CREATED/.test(action) ? "primary" : /ENABLED|SUCCESS|REGISTERED/.test(action) ? "success" : "";

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
  const [limit, setLimit] = useState(25);
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
      const d = await getActivityLogs({ action, search: debouncedSearch, page, limit });
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
  }, [action, debouncedSearch, page, limit, toast]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => setPage(1), [action, debouncedSearch, limit]);

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
            <SelectMenu
              width={250}
              value={action}
              onChange={setAction}
              options={[{ value: "", label: "All actions" }, ...actions.map((a) => ({ value: a, label: a }))]}
            />
          </div>
          {loading ? (
            <TableSkeleton columns={["text", "user", "pill", "text", "text"]} rows={8} />
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
        </div>
        {!loading && pagination.total > 0 && (
          <Pagination page={page} limit={limit} total={pagination.total} onPage={setPage} onLimit={setLimit} label="events" />
        )}
      </div>
    </div>
  );
}
