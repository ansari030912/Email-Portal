import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, AlertTriangle, Gauge, Search, Timer, RefreshCw, Server, User as UserIcon, Globe, Clock } from "lucide-react";
import { EmptyState, Modal } from "../../components/ui";
import { StatsSkeleton, TableSkeleton } from "../../components/Skeletons";
import Pagination from "../../components/Pagination";
import RequestViewer from "../../components/RequestViewer";
import SelectMenu from "../../components/SelectMenu";
import { getApiLogById, getApiLogStats, getApiLogs } from "../../api/endpoints";
import { useToast } from "../../context/ToastContext";
import { formatFullDate, timeAgo } from "../../utils/format";
import "../../styles/admin.css";

const STATUS_TABS = [
  ["", "All"],
  ["2xx", "Success"],
  ["4xx", "4xx"],
  ["5xx", "5xx"],
];
const METHODS = ["", "GET", "POST", "PUT", "DELETE"];

const statusTone = (s) => (s >= 500 ? "danger" : s >= 400 ? "warning" : s >= 300 ? "" : "success");
const msLabel = (ms) => (ms == null ? "—" : ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`);
const msTone = (ms) => (ms >= 1500 ? "slow" : ms >= 500 ? "mid" : "fast");

export default function ApiLogsPage() {
  const toast = useToast();
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState("");
  const [method, setMethod] = useState("");
  const [route, setRoute] = useState("");
  const [project, setProject] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [detail, setDetail] = useState(null);
  const requestId = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => setPage(1), [debounced, status, method, route, project, limit]);

  const loadStats = useCallback(() => {
    getApiLogStats()
      .then((d) => {
        setStats(d.stats);
        setRoutes(d.routes);
        setProjects(d.projects);
      })
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setFetching(true);
    try {
      const d = await getApiLogs({ search: debounced, status, method, route, project, page, limit });
      if (id !== requestId.current) return;
      setLogs(d.logs);
      setTotal(d.pagination.total);
    } catch (e) {
      if (id === requestId.current) toast.error(e.message);
    } finally {
      if (id === requestId.current) {
        setLoading(false);
        setFetching(false);
      }
    }
  }, [debounced, status, method, route, project, page, limit, toast]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const refresh = () => {
    load();
    loadStats();
  };

  const open = async (log) => {
    setDetail({ ...log, loading: true });
    try {
      const d = await getApiLogById(log._id);
      setDetail(d.log);
    } catch (e) {
      toast.error(e.message);
      setDetail(null);
    }
  };

  const tiles = stats
    ? [
        { icon: Activity, tone: "primary", label: "Calls (24 h)", value: stats.total24h.toLocaleString() },
        { icon: AlertTriangle, tone: stats.errorRate24h > 5 ? "danger" : "warning", label: "Error rate (24 h)", value: `${stats.errorRate24h}%`, sub: `${stats.errors24h} failed · ${stats.serverErrors24h} server` },
        { icon: Gauge, tone: "success", label: "Avg response (24 h)", value: msLabel(stats.avgMs24h) },
        { icon: Timer, tone: "danger", label: "Slowest endpoint", value: stats.slowest ? msLabel(stats.slowest.avgMs) : "—", sub: stats.slowest ? `${stats.slowest.method} ${stats.slowest.path}` : "" },
      ]
    : null;

  return (
    <div className="page">
      <div className="page-inner">
        <div className="page-head">
          <div>
            <h1>API logs</h1>
            <p>Every call to the portal API - who called it, what was sent and what came back. Kept for {stats?.retentionDays || 30} days.</p>
          </div>
          <div className="spacer" />
          <button className="btn btn-secondary" onClick={refresh}>
            <RefreshCw size={16} /> Refresh
          </button>
        </div>

        {!tiles ? (
          <StatsSkeleton count={4} />
        ) : (
          <div className="stats">
            {tiles.map(({ icon: Icon, tone, label, value, sub }) => (
              <div className="card stat" key={label}>
                <span className={`stat-icon ${tone}`}>
                  <Icon size={18} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <b>{value}</b>
                  <span>{label}</span>
                  {sub && <span className="stat-sub truncate">{sub}</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="card">
          <div className="toolbar">
            <div className="input-wrap" style={{ width: 260, maxWidth: "100%" }}>
              <Search size={16} />
              <input className="input sm" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Path, user, IP or error" />
            </div>
            <div className="segmented">
              {STATUS_TABS.map(([k, l]) => (
                <button key={k} className={status === k ? "active" : ""} onClick={() => setStatus(k)}>
                  {l}
                </button>
              ))}
            </div>
            <SelectMenu width={130} value={method} onChange={setMethod} options={METHODS.map((m) => ({ value: m, label: m || "All methods" }))} />
            <SelectMenu
              width={170}
              value={route}
              onChange={setRoute}
              options={[{ value: "", label: "All APIs" }, ...routes.map((r) => ({ value: r, label: r }))]}
            />
            {projects.length > 0 && (
              <SelectMenu
                width={180}
                value={project}
                onChange={setProject}
                options={[{ value: "", label: "All callers" }, ...projects.map((p) => ({ value: p, label: p, dot: true }))]}
              />
            )}
          </div>

          {loading ? (
            <TableSkeleton columns={["pill", "text", "pill", "text", "text", "text"]} rows={8} />
          ) : !logs.length ? (
            <EmptyState icon={Activity} title="No API calls match">
              Try another filter.
            </EmptyState>
          ) : (
            <div className={`table-wrap ${fetching ? "is-fetching" : ""}`}>
              <table className="table log-table">
                <thead>
                  <tr>
                    <th>Method</th>
                    <th>Endpoint</th>
                    <th>Status</th>
                    <th>Time</th>
                    <th>Caller</th>
                    <th>When</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l) => (
                    <tr key={l._id} className="log-row" onClick={() => open(l)}>
                      <td>
                        <span className={`method m-${l.method}`}>{l.method}</span>
                      </td>
                      <td>
                        <div className="mono log-path truncate" title={l.path}>
                          {l.path}
                        </div>
                        {l.errorMessage && <div className="log-error truncate">{l.errorMessage}</div>}
                      </td>
                      <td>
                        <span className={`badge ${statusTone(l.status)}`}>{l.status}</span>
                      </td>
                      <td>
                        <span className={`log-ms ${msTone(l.durationMs)}`}>{msLabel(l.durationMs)}</span>
                      </td>
                      <td style={{ fontSize: 12.5 }}>
                        {l.userEmail ? (
                          <span className="row" style={{ gap: 6 }}>
                            <UserIcon size={13} className="faint" /> <span className="truncate" style={{ maxWidth: 190 }}>{l.userEmail}</span>
                          </span>
                        ) : l.projectKey ? (
                          <span className="row" style={{ gap: 6 }}>
                            <Server size={13} className="faint" /> {l.projectKey}
                          </span>
                        ) : (
                          <span className="faint row" style={{ gap: 6 }}>
                            <Globe size={13} /> {l.ip || "anonymous"}
                          </span>
                        )}
                      </td>
                      <td className="faint" style={{ fontSize: 12.5, whiteSpace: "nowrap" }} title={formatFullDate(l.createdAt)}>
                        {timeAgo(l.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {!loading && total > 0 && <Pagination page={page} limit={limit} total={total} onPage={setPage} onLimit={setLimit} label="calls" />}
      </div>

      <Modal open={!!detail} onClose={() => setDetail(null)} size="xl" icon={Activity} title="API call" subtitle={detail ? `${detail.method} ${detail.path}` : ""}>
        {detail &&
          (detail.loading ? (
            <TableSkeleton columns={["text", "text"]} rows={4} />
          ) : (
            <RequestViewer key={detail._id} log={detail} />
          ))}
      </Modal>
    </div>
  );
}
