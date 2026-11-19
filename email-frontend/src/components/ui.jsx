import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Eye, EyeOff, Check, X } from "lucide-react";
import { colorFor, initials, passwordChecks } from "../utils/format";

export function Avatar({ name, email, size = 36 }) {
  const seed = email || name || "";
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.38), background: colorFor(seed) }}
      title={name || email}
    >
      {initials(name || email)}
    </span>
  );
}

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

export function PasswordInput({ value, onChange, placeholder, autoComplete, icon: Icon, autoFocus, name }) {
  const [show, setShow] = useState(false);
  return (
    <div className="input-wrap">
      {Icon && <Icon size={17} />}
      <input
        className="input"
        type={show ? "text" : "password"}
        value={value}
        name={name}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        style={{ paddingRight: 44, ...(Icon ? {} : { paddingLeft: 14 }) }}
      />
      <button type="button" className="icon-btn sm input-action" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"}>
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

export function PasswordStrength({ password }) {
  const checks = passwordChecks(password);
  const score = checks.filter((c) => c.ok).length;
  const colors = ["var(--border-strong)", "var(--danger)", "var(--warning)", "#84cc16", "var(--success)"];
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", gap: 4 }}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} style={{ flex: 1, height: 4, borderRadius: 4, background: i < score ? colors[score] : "var(--surface-3)", transition: "background .25s" }} />
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", marginTop: 8 }}>
        {checks.map((c) => (
          <span key={c.label} className="hint" style={{ display: "inline-flex", alignItems: "center", gap: 4, color: c.ok ? "var(--success)" : undefined }}>
            {c.ok ? <Check size={12} /> : <span style={{ width: 12, textAlign: "center" }}>•</span>} {c.label}
          </span>
        ))}
      </div>
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
