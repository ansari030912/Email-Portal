import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  Mail, Inbox, MailOpen, Star, Users, KeyRound, ScrollText, AtSign, Settings, LogOut, Search, Moon, Sun,
  Menu as MenuIcon, X, Clock, ShieldCheck, ChevronDown, Ticket, Activity,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { MailboxProvider, useMailboxes } from "../context/MailboxContext";
import { Avatar, Dropdown, RoleBadge } from "../components/ui";
import { MailboxListSkeleton } from "../components/Skeletons";
import WelcomeOverlay from "../components/WelcomeOverlay";
import { colorFor, formatDuration } from "../utils/format";
import "../styles/shell.css";

function useTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || "light");
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("im-mail-theme", theme);
    } catch {
      /* private mode */
    }
  }, [theme]);
  return [theme, () => setTheme((t) => (t === "dark" ? "light" : "dark"))];
}

function SessionTimer() {
  const { session } = useAuth();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  if (!session?.expiresAt) return null;
  const left = new Date(session.expiresAt).getTime() - now;
  return (
    <span className={`session-timer ${left < 15 * 60000 ? "warn" : ""}`} title={`Session ends ${new Date(session.expiresAt).toLocaleTimeString()}`}>
      <Clock size={13} /> {formatDuration(left)}
    </span>
  );
}

function Sidebar({ onNavigate }) {
  const { user } = useAuth();
  const { mailboxes, totals, loaded } = useMailboxes();
  const [params] = useSearchParams();
  const location = useLocation();
  const onMail = location.pathname.startsWith("/mail");
  const box = params.get("box") || "all";
  const folder = params.get("folder") || "inbox";
  const isSuper = user.role === "SuperAdmin";

  const folderLink = (f) => `/mail?box=${encodeURIComponent(box)}&folder=${f}`;
  const folders = [
    { key: "inbox", label: "Inbox", icon: Inbox, count: totals.unread },
    { key: "unread", label: "Unread", icon: MailOpen, count: totals.unread },
    { key: "starred", label: "Starred", icon: Star, count: totals.starred, muted: true },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="brand-mark">
          <Mail size={18} />
        </span>
        <span>
          InvoiceMate <b>Mail</b>
        </span>
        <span className="env-pill">BETA</span>
      </div>

      <nav className="side-nav" onClick={onNavigate}>
        {folders.map(({ key, label, icon: Icon, count, muted }) => (
          <NavLink key={key} to={folderLink(key)} className={() => `side-link ${onMail && folder === key ? "active" : ""}`}>
            <Icon size={18} />
            <span className="truncate">{label}</span>
            {count > 0 && <span className={`count ${muted ? "muted" : ""}`}>{count}</span>}
          </NavLink>
        ))}

        <div className="side-section">
          <span>Mailboxes</span>
          <span className="faint">{mailboxes.length}</span>
        </div>
        <NavLink to={`/mail?box=all&folder=${folder}`} className={() => `side-link ${onMail && box === "all" ? "active-soft" : ""}`}>
          <AtSign size={18} />
          <span className="truncate">All mailboxes</span>
        </NavLink>
        {!loaded && <MailboxListSkeleton count={3} />}
        {loaded && mailboxes.length === 0 && <div className="side-empty">No mailbox yet</div>}
        <div className="mailbox-list">
          {mailboxes.map((m) => (
            <NavLink
              key={m._id}
              to={`/mail?box=${encodeURIComponent(m.email)}&folder=${folder}`}
              className={() => `side-link mailbox ${onMail && box === m.email ? "active-soft" : ""}`}
              title={m.email}
            >
              <span className="mailbox-dot" style={{ background: colorFor(m.email) }} />
              <span className="truncate">{m.email}</span>
              {m.unread > 0 && <span className="count">{m.unread}</span>}
            </NavLink>
          ))}
        </div>

        {isSuper && (
          <>
            <div className="side-section">
              <span>Super Admin</span>
            </div>
            <NavLink to="/admin/mailboxes" className="side-link">
              <AtSign size={18} /> <span>Mailbox access</span>
            </NavLink>
            <NavLink to="/admin/users" className="side-link">
              <Users size={18} /> <span>Team members</span>
            </NavLink>
            <NavLink to="/admin/referrals" className="side-link">
              <Ticket size={18} /> <span>Referrals</span>
            </NavLink>
            <NavLink to="/admin/projects" className="side-link">
              <KeyRound size={18} /> <span>Projects</span>
            </NavLink>
            <NavLink to="/admin/activity" className="side-link">
              <ScrollText size={18} /> <span>Activity log</span>
            </NavLink>
            <NavLink to="/admin/api-logs" className="side-link">
              <Activity size={18} /> <span>API logs</span>
            </NavLink>
          </>
        )}
      </nav>

      <NavLink to="/settings" className="side-user" onClick={onNavigate}>
        <Avatar name={user.name} email={user.email} size={34} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <b className="truncate">{user.name}</b>
          <span className="truncate">{user.email}</span>
        </div>
        <Settings size={17} className="faint" />
      </NavLink>
    </aside>
  );
}

function Topbar({ onMenu }) {
  const { user, signOut } = useAuth();
  const [theme, toggleTheme] = useTheme();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const onMail = location.pathname.startsWith("/mail");
  const [q, setQ] = useState(params.get("q") || "");

  useEffect(() => setQ(params.get("q") || ""), [params]);

  // debounce search into the URL
  useEffect(() => {
    if (!onMail) return;
    const t = setTimeout(() => {
      if ((params.get("q") || "") === q) return;
      const next = new URLSearchParams(params);
      q ? next.set("q", q) : next.delete("q");
      next.delete("page");
      next.delete("id");
      setParams(next, { replace: true });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const submitSearch = (e) => {
    e.preventDefault();
    if (!onMail) navigate(`/mail?q=${encodeURIComponent(q)}`);
  };

  return (
    <header className="topbar">
      <button className="icon-btn mobile-only" onClick={onMenu} aria-label="Open menu">
        <MenuIcon size={20} />
      </button>
      <form className="search" onSubmit={submitSearch}>
        <Search size={17} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search subject, sender, recipient, template…" />
        {q && (
          <button type="button" className="icon-btn sm" onClick={() => setQ("")} aria-label="Clear search">
            <X size={15} />
          </button>
        )}
      </form>
      <div className="spacer" />
      <SessionTimer />
      {user.twoFactorRequired && (
        <span className="secure-pill" title="2-step verification active">
          <ShieldCheck size={14} /> 2FA
        </span>
      )}
      <button className="icon-btn" onClick={toggleTheme} aria-label="Toggle theme">
        {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
      </button>
      <Dropdown
        width={250}
        trigger={
          <button className="user-trigger">
            <Avatar name={user.name} email={user.email} size={32} />
            <ChevronDown size={15} className="faint" />
          </button>
        }
      >
        <div style={{ padding: "8px 10px 10px" }}>
          <b style={{ display: "block" }}>{user.name}</b>
          <span className="faint" style={{ fontSize: 12.5 }}>{user.email}</span>
          <div style={{ marginTop: 8 }}>
            <RoleBadge role={user.role} />
          </div>
        </div>
        <div className="menu-sep" />
        <button className="menu-item" onClick={() => navigate("/settings")}>
          <Settings size={16} /> Account & security
        </button>
        <button className="menu-item danger" onClick={signOut}>
          <LogOut size={16} /> Sign out
        </button>
      </Dropdown>
    </header>
  );
}

export default function AppShell() {
  const [drawer, setDrawer] = useState(false);
  const location = useLocation();
  useEffect(() => setDrawer(false), [location.pathname, location.search]);

  return (
    <MailboxProvider>
      {/* plays once after a fresh login; must stay right before .shell (CSS sibling selector) */}
      <WelcomeOverlay />
      <div className={`shell ${drawer ? "drawer-open" : ""}`}>
        <div className="drawer-backdrop" onClick={() => setDrawer(false)} />
        <Sidebar onNavigate={() => setDrawer(false)} />
        <div className="shell-main">
          <Topbar onMenu={() => setDrawer(true)} />
          <div className="shell-content">
            <Outlet />
          </div>
        </div>
      </div>
    </MailboxProvider>
  );
}
