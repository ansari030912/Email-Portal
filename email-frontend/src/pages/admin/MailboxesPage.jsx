import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AtSign, Search, UserPlus, UserMinus, Users, Inbox, CheckCircle2, CircleDashed, ChevronLeft, ChevronRight, Lock, X } from "lucide-react";
import { Avatar, EmptyState, Modal, Spinner } from "../../components/ui";
import UserPicker from "../../components/UserPicker";
import SelectMenu from "../../components/SelectMenu";
import AssigneeStack from "../../components/AssigneeStack";
import Pagination from "../../components/Pagination";
import { StatsSkeleton, TableSkeleton } from "../../components/Skeletons";
import {
  assignRecipientMailboxesToUsers, getAllPortalUsers, getAllRecipientMailboxes, getRecipientMailboxProjects,
  setRecipientMailboxUsers, unassignRecipientMailboxesFromUsers,
} from "../../api/endpoints";
import { useToast } from "../../context/ToastContext";
import { colorFor, timeAgo } from "../../utils/format";
import "../../styles/admin.css";

export default function MailboxesPage() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const userFilter = params.get("userId") || "";
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState({ total: 0, assigned: 0, unassigned: 0 });
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [project, setProject] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [selected, setSelected] = useState(() => new Set());
  const [dialog, setDialog] = useState(null); // { mode: assign|unassign|set, ids, userIds }
  const [saving, setSaving] = useState(false);

  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [fetching, setFetching] = useState(false);
  const requestId = useRef(0);

  // only typing is debounced - tabs / project / page fetch immediately
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setFetching(true);
    try {
      const data = await getAllRecipientMailboxes({ search: debouncedSearch, status, project, userId: userFilter, page, limit });
      if (id !== requestId.current) return; // a newer filter already started - drop this answer
      setItems(data.mailboxes);
      setStats(data.stats);
      setPagination(data.pagination);
    } catch (err) {
      if (id === requestId.current) toast.error(err.message);
    } finally {
      if (id === requestId.current) {
        setLoading(false);
        setFetching(false);
      }
    }
  }, [debouncedSearch, status, project, userFilter, page, limit, toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    getAllPortalUsers().then((d) => setUsers(d.users)).catch(() => {});
    getRecipientMailboxProjects().then((d) => setProjects(d.projects)).catch(() => {});
  }, []);

  // a new filter starts from page 1 with nothing selected
  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [debouncedSearch, status, project, userFilter, limit]);

  const filteredUser = users.find((u) => u._id === userFilter);
  const toggle = (id) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const allSel = items.length > 0 && items.every((m) => selected.has(m._id));

  const save = async () => {
    setSaving(true);
    try {
      const body = { recipientMailboxIds: dialog.ids, userIds: dialog.userIds };
      if (dialog.mode === "assign") await assignRecipientMailboxesToUsers(body);
      else if (dialog.mode === "unassign") await unassignRecipientMailboxesFromUsers(body);
      else await setRecipientMailboxUsers(body);
      toast.success(dialog.mode === "unassign" ? "Access removed" : "Access updated");
      setDialog(null);
      setSelected(new Set());
      load();
      getAllPortalUsers().then((d) => setUsers(d.users)).catch(() => {});
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const dialogTitle = {
    assign: `Give access to ${dialog?.ids.length} mailbox${dialog?.ids.length > 1 ? "es" : ""}`,
    unassign: `Remove access from ${dialog?.ids.length} mailbox${dialog?.ids.length > 1 ? "es" : ""}`,
    set: dialog?.email,
  }[dialog?.mode];

  return (
    <div className="page">
      <div className="page-inner">
        <div className="page-head">
          <div>
            <h1>Mailbox access</h1>
            <p>Every address that received an email. Nobody - not even you - sees its emails until you assign it.</p>
          </div>
        </div>

        {loading ? <StatsSkeleton count={3} /> : <div className="stats">
          <div className="card stat">
            <div className="card-icon"><Inbox size={18} /></div>
            <div><b>{stats.total}</b><span>Recipient addresses</span></div>
          </div>
          <div className="card stat">
            <div className="card-icon" style={{ background: "var(--success-50)", color: "var(--success)" }}><CheckCircle2 size={18} /></div>
            <div><b>{stats.assigned}</b><span>Assigned</span></div>
          </div>
          <div className="card stat">
            <div className="card-icon" style={{ background: "var(--warning-50)", color: "var(--warning)" }}><CircleDashed size={18} /></div>
            <div><b>{stats.unassigned}</b><span>Waiting for an owner</span></div>
          </div>
        </div>}

        <div className="card">
          <div className="toolbar">
            <div className="input-wrap" style={{ width: 280, maxWidth: "100%" }}>
              <Search size={16} />
              <input className="input sm" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search address" />
            </div>
            <div className="segmented">
              {[["all", "All"], ["unassigned", "Unassigned"], ["assigned", "Assigned"]].map(([k, l]) => (
                <button key={k} className={status === k ? "active" : ""} onClick={() => setStatus(k)}>{l}</button>
              ))}
            </div>
            {projects.length > 0 && (
              <SelectMenu
                width={210}
                value={project}
                onChange={setProject}
                options={[{ value: "", label: "All projects" }, ...projects.map((p) => ({ value: p, label: p, dot: true }))]}
              />
            )}
            {filteredUser && (
              <span className="chip">
                <Avatar name={filteredUser.name} email={filteredUser.email} size={20} /> {filteredUser.name}
                <button className="icon-btn sm" style={{ width: 20, height: 20 }} onClick={() => setParams({})} aria-label="Clear user filter"><X size={13} /></button>
              </span>
            )}
          </div>

          {loading ? (
            <TableSkeleton columns={["check", "user", "pill", "text", "text", "pill", "action"]} rows={6} />
          ) : !items.length ? (
            <EmptyState icon={AtSign} title="No recipient addresses yet">
              Addresses appear here automatically the first time a project saves an email for them.
            </EmptyState>
          ) : (
            <div className={`table-wrap ${fetching ? "is-fetching" : ""}`}>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>
                      <input type="checkbox" className="checkbox" checked={allSel} onChange={() => setSelected(allSel ? new Set() : new Set(items.map((m) => m._id)))} />
                    </th>
                    <th>Address</th>
                    <th>Projects</th>
                    <th>Emails</th>
                    <th>Linked account</th>
                    <th>Who can see it</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {items.map((m) => (
                    <tr key={m._id} className={selected.has(m._id) ? "selected" : ""}>
                      <td><input type="checkbox" className="checkbox" checked={selected.has(m._id)} onChange={() => toggle(m._id)} /></td>
                      <td>
                        <div className="row" style={{ minWidth: 0 }}>
                          <span className="mailbox-dot" style={{ background: colorFor(m.email), margin: 0 }} />
                          <div style={{ minWidth: 0 }}>
                            <b className="truncate" style={{ display: "block", fontSize: 13.5, maxWidth: 260 }}>{m.email}</b>
                            {m.displayName && <span className="hint">{m.displayName}</span>}
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
                          {m.projects.map((p) => <span key={p} className="project-tag" style={{ background: `${colorFor(p)}1f`, color: colorFor(p) }}>{p}</span>)}
                        </div>
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <b>{m.emailCount}</b>
                        <div className="hint">last {timeAgo(m.lastEmailAt)}</div>
                      </td>
                      <td className="mono" style={{ fontSize: 11.5 }}>
                        {m.sourceUserId ? (
                          <>
                            <span className="badge" style={{ marginRight: 4 }}>{m.sourceUserType || "user"}</span>
                            <span className="faint">{m.sourceUserId}</span>
                          </>
                        ) : (
                          <span className="faint">—</span>
                        )}
                      </td>
                      <td>
                        <AssigneeStack users={m.users} />
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => setDialog({ mode: "set", ids: [m._id], email: m.email, userIds: m.users.map((u) => u._id) })}>
                          <Users size={14} /> Manage
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

        </div>
        {!loading && pagination.total > 0 && (
          <Pagination
            page={page}
            limit={limit}
            total={pagination.total}
            onPage={(p) => {
              setPage(p);
              setSelected(new Set());
            }}
            onLimit={setLimit}
            label="addresses"
          />
        )}

        {selected.size > 0 && (
          <div className="bulk-bar">
            <b>{selected.size} selected</b>
            <button className="btn btn-primary btn-sm" onClick={() => setDialog({ mode: "assign", ids: [...selected], userIds: [] })}>
              <UserPlus size={15} /> Give access
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setDialog({ mode: "unassign", ids: [...selected], userIds: [] })}>
              <UserMinus size={15} /> Remove access
            </button>
            <button className="icon-btn sm" style={{ color: "#fff" }} onClick={() => setSelected(new Set())} aria-label="Clear selection"><X size={16} /></button>
          </div>
        )}
      </div>

      <Modal
        open={!!dialog}
        onClose={() => setDialog(null)}
        icon={dialog?.mode === "unassign" ? UserMinus : UserPlus}
        title={dialogTitle}
        subtitle={
          dialog?.mode === "set"
            ? "Only the checked members see the emails of this address."
            : dialog?.mode === "assign"
            ? "Checked members are added - existing access stays."
            : "Checked members lose access to the selected addresses."
        }
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setDialog(null)}>Cancel</button>
            <button
              className={`btn ${dialog?.mode === "unassign" ? "btn-danger" : "btn-primary"}`}
              disabled={saving || (dialog?.mode !== "set" && !dialog?.userIds.length)}
              onClick={save}
            >
              {saving ? <Spinner /> : dialog?.mode === "unassign" ? "Remove access" : "Save access"}
            </button>
          </>
        }
      >
        {dialog && <UserPicker users={users} value={dialog.userIds} onChange={(userIds) => setDialog((d) => ({ ...d, userIds }))} />}
      </Modal>
    </div>
  );
}
