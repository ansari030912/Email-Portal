import { useCallback, useEffect, useRef, useState } from "react";
import { Ticket, Plus, Search, Clock, CheckCircle2, XCircle, Hourglass, Copy, Check, Link2, Ban, AlertTriangle, Mail } from "lucide-react";
import { Avatar, EmptyState, Modal, Spinner } from "../../components/ui";
import { StatsSkeleton, TableSkeleton } from "../../components/Skeletons";
import Pagination from "../../components/Pagination";
import { createInviteReferral, getAllInviteReferrals, revokeInviteReferral } from "../../api/endpoints";
import { useStepUp } from "../../context/StepUpContext";
import { useToast } from "../../context/ToastContext";
import { copyText, formatFullDate, timeAgo } from "../../utils/format";
import "../../styles/admin.css";

const STATUS = {
  pending: { label: "Pending", cls: "primary", icon: Hourglass },
  used: { label: "Used", cls: "success", icon: CheckCircle2 },
  expired: { label: "Expired", cls: "warning", icon: Clock },
  revoked: { label: "Cancelled", cls: "danger", icon: XCircle },
};
const EXPIRY = [1, 3, 7, 14, 30];

const timeLeft = (date) => {
  const ms = new Date(date).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const h = Math.floor(ms / 3600000);
  if (h >= 48) return `${Math.floor(h / 24)} days left`;
  if (h >= 1) return `${h} h left`;
  return `${Math.max(1, Math.floor(ms / 60000))} min left`;
};

function CopyField({ label, value, mono, big }) {
  const [done, setDone] = useState(false);
  return (
    <div className="field" style={{ marginBottom: 14 }}>
      <label>{label}</label>
      <div className={`copy-field ${big ? "big" : ""}`}>
        <span className={mono ? "mono" : ""}>{value}</span>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={async () => {
            if (await copyText(value)) {
              setDone(true);
              setTimeout(() => setDone(false), 1500);
            }
          }}
        >
          {done ? <Check size={14} color="var(--success)" /> : <Copy size={14} />} {done ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

export default function ReferralsPage() {
  const stepUp = useStepUp();
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState({ pending: 0, used: 0, expired: 0, revoked: 0 });
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ email: "", days: 7 });
  const [creating, setCreating] = useState(false);
  const [reveal, setReveal] = useState(null);
  const requestId = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => setPage(1), [debounced, status, limit]);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setFetching(true);
    try {
      const d = await getAllInviteReferrals({ search: debounced, status, page, limit });
      if (id !== requestId.current) return;
      setItems(d.invites);
      setStats(d.stats);
      setTotal(d.pagination.total);
    } catch (e) {
      if (id === requestId.current) toast.error(e.message);
    } finally {
      if (id === requestId.current) {
        setLoading(false);
        setFetching(false);
      }
    }
  }, [debounced, status, page, limit, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const create = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      const data = await stepUp({
        title: "Create referral",
        description: `A one-time code for ${form.email.trim()}. Confirm with your Google Authenticator code.`,
        action: (twoFactorCode) => createInviteReferral({ email: form.email, expiresInDays: form.days, twoFactorCode }),
      });
      setCreateOpen(false);
      setForm({ email: "", days: 7 });
      setReveal({ invite: data.invite, code: data.code });
      load();
    } catch (err) {
      if (!err.cancelled) toast.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (inv) => {
    try {
      const data = await stepUp({
        title: `Cancel referral for ${inv.email}?`,
        description: "The code stops working immediately.",
        action: (twoFactorCode) => revokeInviteReferral({ inviteId: inv._id, twoFactorCode }),
      });
      toast.success(data.message);
      load();
    } catch (err) {
      if (!err.cancelled) toast.error(err.message);
    }
  };

  const link = reveal ? `${window.location.origin}/register?email=${encodeURIComponent(reveal.invite.email)}&code=${reveal.code}` : "";

  return (
    <div className="page">
      <div className="page-inner">
        <div className="page-head">
          <div>
            <h1>Referrals</h1>
            <p>Registration is invite-only. Each referral works once, only for its email.</p>
          </div>
          <div className="spacer" />
          <button className="btn btn-gradient" onClick={() => setCreateOpen(true)}>
            <Plus size={17} /> New referral
          </button>
        </div>

        {loading ? (
          <StatsSkeleton count={4} />
        ) : (
          <div className="stats">
            {[
              ["pending", stats.pending, "Waiting to be used"],
              ["used", stats.used, "Accounts created"],
              ["expired", stats.expired, "Expired"],
              ["revoked", stats.revoked, "Cancelled"],
            ].map(([key, n, label]) => {
              const S = STATUS[key];
              const Icon = S.icon;
              return (
                <button key={key} className={`card stat stat-btn ${status === key ? "on" : ""}`} onClick={() => setStatus(status === key ? "all" : key)}>
                  <span className={`stat-icon ${S.cls}`}>
                    <Icon size={18} />
                  </span>
                  <div>
                    <b>{n}</b>
                    <span>{label}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div className="card">
          <div className="toolbar">
            <div className="input-wrap" style={{ width: 280, maxWidth: "100%" }}>
              <Search size={16} />
              <input className="input sm" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search email" />
            </div>
            <div className="segmented">
              {[["all", "All"], ["pending", "Pending"], ["used", "Used"], ["expired", "Expired"], ["revoked", "Cancelled"]].map(([k, l]) => (
                <button key={k} className={status === k ? "active" : ""} onClick={() => setStatus(k)}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <TableSkeleton columns={["user", "pill", "text", "text", "text", "action"]} rows={5} />
          ) : !items.length ? (
            <EmptyState
              icon={Ticket}
              title={status === "all" && !debounced ? "No referrals yet" : "No referrals match"}
              action={
                status === "all" && !debounced ? (
                  <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
                    <Plus size={16} /> New referral
                  </button>
                ) : null
              }
            >
              {status === "all" && !debounced ? "Create a referral to let someone register." : "Try another filter or search."}
            </EmptyState>
          ) : (
            <div className={`table-wrap ${fetching ? "is-fetching" : ""}`}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Invited email</th>
                    <th>Status</th>
                    <th>Code</th>
                    <th>Created</th>
                    <th>Expires / used</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {items.map((inv) => {
                    const S = STATUS[inv.status];
                    const Icon = S.icon;
                    return (
                      <tr key={inv._id}>
                        <td>
                          <div className="user-cell">
                            <Avatar email={inv.email} size={34} />
                            <div style={{ minWidth: 0 }}>
                              <b>
                                <span className="truncate">{inv.email}</span>
                              </b>
                              <span>{inv.createdBy ? `by ${inv.createdBy.name}` : ""}</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className={`badge ${S.cls}`}>
                            <Icon size={12} /> {S.label}
                          </span>
                        </td>
                        <td className="mono faint">••••-••••-••{inv.codeHint}</td>
                        <td style={{ fontSize: 12.5, whiteSpace: "nowrap" }} title={formatFullDate(inv.createdAt)}>
                          {timeAgo(inv.createdAt)}
                        </td>
                        <td style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>
                          {inv.status === "used" ? (
                            <span title={formatFullDate(inv.usedAt)}>
                              {inv.usedBy ? `${inv.usedBy.name} · ` : ""}
                              {timeAgo(inv.usedAt)}
                            </span>
                          ) : inv.status === "pending" ? (
                            <span className="badge" title={formatFullDate(inv.expiresAt)}>
                              <Clock size={11} /> {timeLeft(inv.expiresAt)}
                            </span>
                          ) : inv.status === "revoked" ? (
                            <span className="faint">cancelled {timeAgo(inv.revokedAt)}</span>
                          ) : (
                            <span className="faint">{formatFullDate(inv.expiresAt)}</span>
                          )}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {inv.status === "pending" && (
                            <button className="btn btn-ghost btn-sm danger-text" onClick={() => revoke(inv)}>
                              <Ban size={14} /> Cancel
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {!loading && total > 0 && <Pagination page={page} limit={limit} total={total} onPage={setPage} onLimit={setLimit} label="referrals" />}
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} icon={Ticket} title="New referral" subtitle="Only this email can use the code to register.">
        <form onSubmit={create}>
          <div className="field">
            <label>Email</label>
            <div className="input-wrap">
              <Mail size={16} />
              <input
                className="input"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="new.member@company.com"
                autoFocus
              />
            </div>
          </div>
          <div className="field">
            <label>Valid for</label>
            <div className="segmented" style={{ width: "fit-content" }}>
              {EXPIRY.map((d) => (
                <button type="button" key={d} className={form.days === d ? "active" : ""} onClick={() => setForm((f) => ({ ...f, days: d }))}>
                  {d} {d === 1 ? "day" : "days"}
                </button>
              ))}
            </div>
            <span className="hint">Creating a new referral cancels any pending one for the same email.</span>
          </div>
          <div className="row" style={{ justifyContent: "flex-end", marginTop: 6 }}>
            <button type="button" className="btn btn-secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" disabled={creating || !/^\S+@\S+\.\S+$/.test(form.email.trim())}>
              {creating ? <Spinner /> : "Create referral"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={!!reveal} onClose={() => setReveal(null)} icon={Ticket} title="Referral created" subtitle={reveal ? `For ${reveal.invite.email} · ${timeLeft(reveal.invite.expiresAt)}` : ""}>
        {reveal && (
          <>
            <div className="secret-reveal">
              <AlertTriangle size={17} style={{ flexShrink: 0 }} /> Copy it now - the code is stored hashed and can't be shown again.
            </div>
            <CopyField label="Referral code" value={reveal.code} mono big />
            <CopyField label={<><Link2 size={13} style={{ verticalAlign: -2 }} /> Registration link (email + code filled in)</>} value={link} />
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button className="btn btn-primary" onClick={() => setReveal(null)}>
                Done
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
