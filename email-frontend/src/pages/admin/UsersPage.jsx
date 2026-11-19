import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users, Search, MoreHorizontal, ShieldOff, Ban, CheckCircle2, AtSign, ShieldCheck, UserCog } from "lucide-react";
import { Avatar, Dropdown, EmptyState, Modal, RoleBadge, Spinner } from "../../components/ui";
import RolePicker from "../../components/RolePicker";
import { StatsSkeleton, TableSkeleton } from "../../components/Skeletons";
import Pagination from "../../components/Pagination";
import {
  getAllPortalUsers, resetPortalUserTwoFactor, updatePortalUserRole, updatePortalUserStatus,
} from "../../api/endpoints";
import { useAuth } from "../../context/AuthContext";
import { useStepUp } from "../../context/StepUpContext";
import { useToast } from "../../context/ToastContext";
import { timeAgo } from "../../utils/format";
import "../../styles/admin.css";

export default function UsersPage() {
  const { user: me } = useAuth();
  const stepUp = useStepUp();
  const toast = useToast();
  const navigate = useNavigate();
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");

  // The team is small: load it once and filter in the browser -> tabs & search are instant
  const load = useCallback(async () => {
    try {
      const data = await getAllPortalUsers();
      setAllUsers(data.users);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const users = useMemo(() => {
    const s = search.trim().toLowerCase();
    return allUsers.filter(
      (u) => (!role || u.role === role) && (!s || u.name.toLowerCase().includes(s) || u.email.toLowerCase().includes(s))
    );
  }, [allUsers, role, search]);

  const setUsers = setAllUsers;

  // client side paging over the filtered list
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  useEffect(() => setPage(1), [role, search, limit]);
  const pageUsers = useMemo(() => users.slice((page - 1) * limit, page * limit), [users, page, limit]);
  useEffect(() => {
    // after a filter / delete the current page may no longer exist
    const pages = Math.max(1, Math.ceil(users.length / limit));
    if (page > pages) setPage(pages);
  }, [users.length, limit, page]);

  const replace = (u) => setUsers((list) => list.map((x) => (x._id === u._id ? { ...x, ...u } : x)));

  // every change below needs a fresh Google Authenticator code
  const run = async (title, description, action, success) => {
    try {
      const data = await stepUp({ title, description, action });
      if (data?.user) replace(data.user);
      toast.success(success || data.message);
      return data;
    } catch (err) {
      if (!err.cancelled) toast.error(err.message);
      return null;
    }
  };

  const changeRole = (u, nextRole) =>
    run(
      `Make ${u.name} ${nextRole}?`,
      nextRole === "Admin"
        ? "They will be signed out and must set up Google Authenticator at their next login."
        : "They will be signed out and lose Admin rights.",
      (twoFactorCode) => updatePortalUserRole({ userId: u._id, role: nextRole, twoFactorCode })
    );

  const toggleBlock = (u) =>
    run(
      u.isBlocked ? `Unblock ${u.name}?` : `Block ${u.name}?`,
      u.isBlocked ? "They can sign in again." : "They are signed out immediately and can't sign in.",
      (twoFactorCode) => updatePortalUserStatus({ userId: u._id, isBlocked: !u.isBlocked, twoFactorCode })
    );

  const resetTwoFactor = (u) =>
    run(`Reset 2FA for ${u.name}?`, "Use this when they lost their phone. They set it up again at next login.", (twoFactorCode) =>
      resetPortalUserTwoFactor({ userId: u._id, twoFactorCode })
    );


  const counts = {
    total: allUsers.length,
    admins: allUsers.filter((u) => u.role !== "User").length,
    twoFactor: allUsers.filter((u) => u.isTwoFactorEnabled).length,
    blocked: allUsers.filter((u) => u.isBlocked).length,
  };

  return (
    <div className="page">
      <div className="page-inner">
        <div className="page-head">
          <div>
            <h1>Team members</h1>
            <p>Promote to Admin, block accounts or reset 2FA. Every change asks for your 2FA code.</p>
          </div>
        </div>

        {loading ? <StatsSkeleton count={4} /> : <div className="stats">
          {[
            [Users, counts.total, "Members", "primary"],
            [UserCog, counts.admins, "Admins & Super Admin", "accent"],
            [ShieldCheck, counts.twoFactor, "With 2FA", "success"],
            [Ban, counts.blocked, "Blocked", "danger"],
          ].map(([Icon, n, label, tone]) => (
            <div className="card stat" key={label}>
              <div className="card-icon" style={tone === "success" ? { background: "var(--success-50)", color: "var(--success)" } : tone === "danger" ? { background: "var(--danger-50)", color: "var(--danger)" } : undefined}>
                <Icon size={18} />
              </div>
              <div>
                <b>{n}</b>
                <span>{label}</span>
              </div>
            </div>
          ))}
        </div>}

        <div className="card">
          <div className="toolbar">
            <div className="input-wrap" style={{ width: 300, maxWidth: "100%" }}>
              <Search size={16} />
              <input className="input sm" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or email" />
            </div>
            <div className="segmented">
              {[["", "All"], ["SuperAdmin", "Super Admin"], ["Admin", "Admin"], ["User", "User"]].map(([k, l]) => (
                <button key={k} className={role === k ? "active" : ""} onClick={() => setRole(k)}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <TableSkeleton columns={["user", "pill", "pill", "pill", "text", "text", "action"]} rows={5} />
          ) : !users.length ? (
            <EmptyState icon={Users} title="No members found" />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Role</th>
                    <th>2FA</th>
                    <th>Status</th>
                    <th>Mailboxes</th>
                    <th>Last login</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {pageUsers.map((u) => {
                    const isSuper = u.role === "SuperAdmin";
                    const isMe = u._id === me._id;
                    return (
                      <tr key={u._id}>
                        <td>
                          <div className="user-cell">
                            <Avatar name={u.name} email={u.email} size={36} />
                            <div style={{ minWidth: 0 }}>
                              <b>
                                <span className="truncate">{u.name}</span>
                                {isMe && <span className="you-badge">YOU</span>}
                              </b>
                              <span className="truncate">{u.email}</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          {isSuper ? (
                            <RoleBadge role={u.role} />
                          ) : (
                            <RolePicker value={u.role} onChange={(next) => changeRole(u, next)} />
                          )}
                        </td>
                        <td>
                          {u.isTwoFactorEnabled ? (
                            <span className="badge success"><ShieldCheck size={12} /> On</span>
                          ) : u.twoFactorRequired ? (
                            <span className="badge warning">Setup at login</span>
                          ) : (
                            <span className="badge">Off</span>
                          )}
                        </td>
                        <td>
                          {u.isBlocked ? <span className="badge danger"><span className="dot" /> Blocked</span> : <span className="badge success"><span className="dot" /> Active</span>}
                        </td>
                        <td>
                          <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/admin/mailboxes?userId=${u._id}`)}>
                            <AtSign size={14} /> {u.assignedMailboxCount}
                          </button>
                        </td>
                        <td className="faint" style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>{timeAgo(u.lastLoginAt)}</td>
                        <td style={{ textAlign: "right" }}>
                          <Dropdown width={230} trigger={<button className="icon-btn sm" aria-label="Actions"><MoreHorizontal size={17} /></button>}>
                            <button className="menu-item" onClick={() => navigate(`/admin/mailboxes?userId=${u._id}`)}>
                              <AtSign size={16} /> View mailboxes
                            </button>
                            {!isSuper && !isMe && (
                              <>
                                {u.isTwoFactorEnabled && (
                                  <button className="menu-item" onClick={() => resetTwoFactor(u)}>
                                    <ShieldOff size={16} /> Reset 2FA
                                  </button>
                                )}
                                <div className="menu-sep" />
                                <button className={`menu-item ${u.isBlocked ? "" : "danger"}`} onClick={() => toggleBlock(u)}>
                                  {u.isBlocked ? <CheckCircle2 size={16} /> : <Ban size={16} />} {u.isBlocked ? "Unblock" : "Block account"}
                                </button>
                              </>
                            )}
                          </Dropdown>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {!loading && users.length > 0 && (
          <Pagination page={page} limit={limit} total={users.length} onPage={setPage} onLimit={setLimit} label="members" />
        )}
      </div>
    </div>
  );
}
