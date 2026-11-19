import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Eye, EyeOff, Check, X, ShieldCheck } from "lucide-react";
import { colorFor, initials, passwordChecks } from "../utils/format";

// `letter` = show exactly this (e.g. the first letter of an email address) instead of initials
export function Avatar({ name, email, size = 36, letter }) {
  const seed = email || name || "";
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, fontSize: Math.max(11, size * (letter ? 0.44 : 0.38)), background: colorFor(seed) }}
      title={name || email}
    >
      {letter || initials(name || email)}
    </span>
  );
}

// first letter of an email address: "hello@maildrop.cc" -> "H"
export const firstLetter = (address) => (String(address || "").trim().match(/[a-z0-9]/i)?.[0] || "?").toUpperCase();

export function Spinner({ size = 18 }) {
  return <span className="spinner" style={{ width: size, height: size }} />;
}

export function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className="empty">
      {Icon && (
        <div className="empty-icon">
          <Icon size={30} />
        </div>
      )}
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action && <div style={{ marginTop: 18 }}>{action}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, subtitle, icon: Icon, children, footer, size, closeOnBackdrop = true }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => closeOnBackdrop && e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${size || ""}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          {Icon && (
            <div className="card-icon">
              <Icon size={19} />
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3>{title}</h3>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {onClose && (
            <button className="icon-btn sm" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          )}
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

// status: "error" | "success" -> coloured border + ✓ / ✕ inside the field (no extra height)
export function PasswordInput({ value, onChange, placeholder, autoComplete, icon: Icon, autoFocus, name, status }) {
  const [show, setShow] = useState(false);
  return (
    <div className="input-wrap">
      {Icon && <Icon size={17} />}
      <input
        className={`input ${status ? `is-${status}` : ""}`}
        type={show ? "text" : "password"}
        value={value}
        name={name}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        style={{ paddingRight: status ? 74 : 44, ...(Icon ? {} : { paddingLeft: 14 }) }}
      />
      <div className="input-action row" style={{ gap: 2 }}>
        {status && (
          <span key={status} className={`input-state ${status}`} aria-label={status === "success" ? "Passwords match" : "Passwords don't match"}>
            {status === "success" ? <Check size={12} strokeWidth={3.5} /> : <X size={12} strokeWidth={3.5} />}
          </span>
        )}
        <button type="button" className="icon-btn sm" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"}>
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  );
}

// Confirm-password feedback. While the typed text is still the start of the password
// nothing is shown, so the user isn't told "don't match" halfway through typing.
export const passwordMatchState = (password, confirm) => {
  if (!confirm) return null;
  if (confirm === password) return "success";
  if (password.startsWith(confirm)) return null;
  return "error";
};

export function PasswordMatch({ password, confirm }) {
  const state = passwordMatchState(password, confirm);
  if (!state) return null;
  const ok = state === "success";
  return (
    <span key={state} className={`field-note ${ok ? "ok" : "bad"}`} role="status">
      {ok ? <Check size={13} strokeWidth={3} /> : <X size={13} strokeWidth={3} />}
      {ok ? "Passwords match" : "Passwords don't match"}
    </span>
  );
}

// Each rule is one segment with its label right under it; the segment fills when the rule passes.
const STRENGTH = [
  { label: "Too weak", tone: "danger" },
  { label: "Weak", tone: "danger" },
  { label: "Fair", tone: "warning" },
  { label: "Good", tone: "good" },
  { label: "Strong", tone: "success" },
];
// `confirm` (optional) adds a "passwords match" row at the bottom of the panel
export function PasswordStrength({ password, confirm }) {
  const checks = passwordChecks(password);
  const score = checks.filter((c) => c.ok).length;
  const level = STRENGTH[score];
  const match = confirm === undefined ? undefined : passwordMatchState(password, confirm);
  return (
    <div className="pw-strength" data-tone={level.tone}>
      <div className="pw-head">
        <span>Password strength</span>
        <span className="pw-level">
          <ShieldCheck size={13} /> {level.label}
        </span>
      </div>
      <div className="pw-meter" aria-hidden="true">
        <span style={{ width: `${(score / checks.length) * 100}%` }} />
      </div>
      <div className="pw-rules">
        {checks.map((c) => (
          <div key={c.label} className={`pw-rule ${c.ok ? "ok" : ""}`} title={c.hint}>
            <span className="pw-mark">{c.ok ? <Check size={11} strokeWidth={3.5} /> : null}</span>
            <span className="pw-label">{c.label}</span>
          </div>
        ))}
      </div>
      {confirm !== undefined && (
        <div className={`pw-match ${match || "idle"}`}>
          <span className="pw-mark">
            {match === "success" && <Check size={11} strokeWidth={3.5} />}
            {match === "error" && <X size={11} strokeWidth={3.5} />}
          </span>
          {match === "success"
            ? "Passwords match"
            : match === "error"
            ? "Passwords don't match"
            : confirm
            ? "Keep typing to confirm…"
            : "Re-type the new password to confirm"}
        </div>
      )}
    </div>
  );
}

// Dropdown menu anchored to its trigger. Rendered in a portal with fixed position,
// so it is never cut off by a scrolling table / card. Flips up near the bottom edge.
export function Dropdown({ trigger, children, align = "right", width = 220 }) {
  const [pos, setPos] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  const toggle = () => {
    if (pos) return setPos(null);
    const r = triggerRef.current.getBoundingClientRect();
    const left = align === "left" ? r.left : r.right - width;
    setPos({
      left: Math.max(8, Math.min(left, window.innerWidth - width - 8)),
      top: r.bottom + 6,
      bottomUp: window.innerHeight - r.top + 6,
      flip: r.bottom + 260 > window.innerHeight && r.top > 260,
    });
  };

  useEffect(() => {
    if (!pos) return undefined;
    const close = () => setPos(null);
    const onDoc = (e) => !menuRef.current?.contains(e.target) && !triggerRef.current?.contains(e.target) && close();
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [pos]);

  return (
    <>
      <span ref={triggerRef} onClick={toggle} style={{ display: "inline-flex" }}>
        {trigger}
      </span>
      {pos &&
        createPortal(
          <div
            ref={menuRef}
            className="menu"
            style={{ position: "fixed", left: pos.left, width, ...(pos.flip ? { bottom: pos.bottomUp } : { top: pos.top }) }}
            onClick={() => setPos(null)}
          >
            {children}
          </div>,
          document.body
        )}
    </>
  );
}

export function RoleBadge({ role }) {
  return <span className={`badge role-${role}`}>{role === "SuperAdmin" ? "Super Admin" : role}</span>;
}

export function ProjectTag({ project }) {
  if (!project) return null;
  const color = colorFor(project.key || project.name);
  return (
    <span className="project-tag" style={{ background: `${color}1f`, color }}>
      {project.name || project.key}
    </span>
  );
}
