import { useEffect, useState } from "react";
import {
  User, KeyRound, ShieldCheck, Clock, AlertCircle, CheckCircle2, Smartphone, Copy, Check, Lock,
  LogIn, PencilLine, ShieldOff, Mail, CalendarClock, Fingerprint,
} from "lucide-react";
import { Avatar, Modal, PasswordInput, PasswordMatch, PasswordStrength, RoleBadge, Spinner, passwordMatchState } from "../../components/ui";
import OtpVerifier from "../../components/OtpVerifier";
import { changeMyPassword, disableTwoFactor, enableTwoFactor, generateTwoFactorSetup, updateMyProfile } from "../../api/endpoints";
import { useAuth } from "../../context/AuthContext";
import { useStepUp } from "../../context/StepUpContext";
import { useToast } from "../../context/ToastContext";
import { copyText, formatDuration, formatFullDate, passwordChecks, timeAgo } from "../../utils/format";
import "../../styles/settings.css";

function Msg({ error, success }) {
  if (!error && !success) return null;
  return (
    <div className={`form-error ${success ? "form-success" : ""}`}>
      {success ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />} <span>{error || success}</span>
    </div>
  );
}

function SectionCard({ icon: Icon, tone = "primary", title, subtitle, right, children }) {
  return (
    <section className="s-card">
      <header className="s-card-head">
        <span className={`s-icon tone-${tone}`}>
          <Icon size={18} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {right}
      </header>
      <div className="s-card-body">{children}</div>
    </section>
  );
}

function useNow(ms = 30000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/* ------------------------------ Hero + overview ------------------------------ */
function ProfileHero() {
  const { user, session } = useAuth();
  const now = useNow();
  const left = session?.expiresAt ? new Date(session.expiresAt).getTime() - now : 0;

  const tiles = [
    {
      icon: ShieldCheck,
      tone: user.isTwoFactorEnabled ? "success" : "warning",
      label: "2-step verification",
      value: user.isTwoFactorEnabled ? "Active" : "Off",
    },
    { icon: KeyRound, tone: "primary", label: "Password changed", value: timeAgo(user.passwordChangedAt) },
    { icon: Clock, tone: left < 15 * 60000 ? "warning" : "accent", label: "Session ends in", value: formatDuration(left) },
  ];

  return (
    <div className="s-hero">
      <div className="s-hero-cover">
        <span className="s-hero-orb a" />
        <span className="s-hero-orb b" />
      </div>
      <div className="s-hero-main">
        <div className="s-hero-avatar">
          <Avatar name={user.name} email={user.email} size={84} />
          {user.isTwoFactorEnabled && (
            <span className="s-hero-shield" title="Protected with 2-step verification">
              <ShieldCheck size={15} />
            </span>
          )}
        </div>
        <div className="s-hero-id">
          <h2>{user.name}</h2>
          <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
            <span className="muted">{user.email}</span>
            <RoleBadge role={user.role} />
          </div>
        </div>
      </div>
      <div className="s-tiles">
        {tiles.map(({ icon: Icon, tone, label, value }) => (
          <div className="s-tile" key={label}>
            <span className={`s-icon sm tone-${tone}`}>
              <Icon size={16} />
            </span>
            <div>
              <span>{label}</span>
              <b>{value}</b>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------ Profile ------------------------------ */
function ProfileCard() {
  const { user, setUser } = useAuth();
  const stepUp = useStepUp();
  const toast = useToast();
  const [name, setName] = useState(user.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const changed = name.trim().length >= 2 && name.trim() !== user.name;

  const save = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const data = await stepUp({
        title: "Confirm profile change",
        action: (twoFactorCode) => updateMyProfile({ name, twoFactorCode }),
      });
      setUser(data.user);
      toast.success("Profile updated");
    } catch (err) {
      if (!err.cancelled) setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard icon={User} title="Profile" subtitle="How your name appears to the team">
      <form onSubmit={save}>
        <Msg error={error} />
        <div className="field">
          <label>Full name</label>
          <div className="input-wrap">
            <PencilLine size={16} />
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>Login email</label>
          <div className="input-wrap">
            <Mail size={16} />
            <input className="input" value={user.email} disabled />
          </div>
          <span className="hint">Your login email can't be changed.</span>
        </div>
        <div className="s-actions">
          {user.twoFactorRequired && (
            <span className="hint row" style={{ gap: 5 }}>
              <Fingerprint size={13} /> Needs a 2FA code
            </span>
          )}
          <div className="spacer" />
          {changed && (
            <button type="button" className="btn btn-ghost" onClick={() => setName(user.name)}>
              Reset
            </button>
          )}
          <button className="btn btn-primary" disabled={busy || !changed}>
            {busy ? <Spinner /> : "Save changes"}
          </button>
        </div>
      </form>
    </SectionCard>
  );
}

/* ------------------------------ Password ------------------------------ */
function PasswordCard() {
  const { user, signIn } = useAuth();
  const stepUp = useStepUp();
  const toast = useToast();
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const strong = passwordChecks(form.next).every((c) => c.ok);
  const matches = form.next && form.next === form.confirm;

  const save = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const data = await stepUp({
        title: "Confirm password change",
        description: "Enter your Google Authenticator code. Other sessions will be signed out.",
        action: (twoFactorCode) => changeMyPassword({ currentPassword: form.current, newPassword: form.next, twoFactorCode }),
      });
      signIn(data.user, data.session);
      setForm({ current: "", next: "", confirm: "" });
      toast.success("Password changed - other sessions were signed out");
    } catch (err) {
      if (!err.cancelled) setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard icon={KeyRound} title="Password" subtitle={`Last changed ${timeAgo(user.passwordChangedAt)}`}>
      <form onSubmit={save}>
        <Msg error={error} />
        <div className="field">
          <label>Current password</label>
          <PasswordInput value={form.current} onChange={set("current")} autoComplete="current-password" icon={Lock} />
        </div>
        <div className="s-two">
          <div className="field">
            <label>New password</label>
            <PasswordInput value={form.next} onChange={set("next")} autoComplete="new-password" icon={KeyRound} />
          </div>
          <div className="field">
            <label>Confirm new password</label>
            <PasswordInput
              value={form.confirm}
              onChange={set("confirm")}
              autoComplete="new-password"
              icon={KeyRound}
              status={passwordMatchState(form.next, form.confirm)}
            />
            <PasswordMatch password={form.next} confirm={form.confirm} />
          </div>
        </div>
        {form.next && <PasswordStrength password={form.next} />}
        <div className="s-actions">
          <span className="hint">All other devices are signed out after a change.</span>
          <div className="spacer" />
          <button className="btn btn-primary" disabled={busy || !form.current || !strong || !matches}>
            {busy ? <Spinner /> : "Update password"}
          </button>
        </div>
      </form>
    </SectionCard>
  );
}

/* ------------------------------ 2FA ------------------------------ */
function TwoFactorCard() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const isSuper = user.role === "SuperAdmin";
  const mandatory = isSuper || user.role === "Admin";
  const on = user.isTwoFactorEnabled;
  const [setup, setSetup] = useState(null);
  const [disableOpen, setDisableOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const start = async () => {
    setBusy(true);
    try {
      setSetup(await generateTwoFactorSetup());
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const protections = [
    { icon: LogIn, title: "Every sign in", text: "A 6 digit code after your password", ok: on },
    { icon: PencilLine, title: "Every account change", text: mandatory ? "Name, password and admin actions" : "When you change your name or password", ok: on },
    mandatory
      ? { icon: Lock, title: "Always on", text: `Required for the ${isSuper ? "Super Admin" : "Admin"} role`, ok: true, locked: true }
      : { icon: ShieldOff, title: "Optional", text: "You can turn it off with password + code", ok: true },
  ];

  return (
    <section className={`s-card tfa ${on ? "is-on" : "is-off"}`}>
      <div className="tfa-top">
        <div className="tfa-visual" aria-hidden="true">
          <span className="tfa-ring r1" />
          <span className="tfa-ring r2" />
          <span className="tfa-shield">{on ? <ShieldCheck size={30} /> : <ShieldOff size={30} />}</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <h3>2-step verification</h3>
            <span className={`tfa-status ${on ? "on" : "off"}`}>
              <span className="tfa-dot" /> {on ? "Protected" : "Not protected"}
            </span>
          </div>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            {on ? "Google Authenticator is guarding your account." : "Add Google Authenticator as a second step after your password."}
          </p>
          {on && user.twoFactorEnabledAt && (
            <span className="tfa-since">
              <CalendarClock size={13} /> Enabled {formatFullDate(user.twoFactorEnabledAt)}
            </span>
          )}
        </div>
      </div>

      <div className="tfa-grid">
        {protections.map(({ icon: Icon, title, text, ok, locked }) => (
          <div key={title} className={`tfa-item ${ok ? "ok" : ""}`}>
            <span className="tfa-item-icon">
              <Icon size={16} />
            </span>
            <div style={{ minWidth: 0 }}>
              <b>{title}</b>
              <span>{text}</span>
            </div>
            {ok && <span className="tfa-check">{locked ? <Lock size={13} /> : <Check size={13} />}</span>}
          </div>
        ))}
      </div>

      {!(on && mandatory) && <div className="tfa-foot">
        {on && !mandatory && (
          <button className="btn btn-danger-soft" onClick={() => setDisableOpen(true)}>
            <ShieldOff size={16} /> Turn off 2-step verification
          </button>
        )}
        {!on && (
          <button className="btn btn-gradient" onClick={start} disabled={busy}>
            {busy ? <Spinner /> : <><Smartphone size={16} /> Set up Google Authenticator</>}
          </button>
        )}
      </div>}

      <Modal open={!!setup} onClose={() => setSetup(null)} icon={Smartphone} title="Set up Google Authenticator" subtitle="Scan the QR code, then type the 6 digit code.">
        {setup && (
          <>
            <div className="qr-inline">
              <img src={setup.qrCode} alt="QR code" />
              <div style={{ minWidth: 0 }}>
                <div className="hint">Or enter this key</div>
                <div className="secret-row">
                  <span className="mono" style={{ flex: 1, wordBreak: "break-all" }}>{setup.manualKey.match(/.{1,4}/g).join(" ")}</span>
                  <button
                    className="icon-btn sm"
                    onClick={async () => {
                      if (await copyText(setup.manualKey)) {
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1500);
                      }
                    }}
                  >
                    {copied ? <Check size={15} color="var(--success)" /> : <Copy size={15} />}
                  </button>
                </div>
              </div>
            </div>
            <OtpVerifier
              onVerify={(code) => enableTwoFactor({ code })}
              onSuccess={(data) => {
                setUser(data.user);
                setSetup(null);
                toast.success("2-step verification is on");
              }}
              successLabel="Enabled"
            />
          </>
        )}
      </Modal>

      <Modal
        open={disableOpen}
        onClose={() => {
          setDisableOpen(false);
          setPassword("");
          setError("");
        }}
        icon={ShieldOff}
        title="Turn off 2-step verification"
        subtitle="Confirm with your password and a code from the app."
      >
        <Msg error={error} />
        <div className="field">
          <label>Password</label>
          <PasswordInput value={password} onChange={setPassword} autoComplete="current-password" autoFocus />
        </div>
        {password && (
          <OtpVerifier
            autoFocus={false}
            onVerify={async (code) => {
              try {
                return await disableTwoFactor({ code, password });
              } catch (err) {
                if (err.code === "WRONG_PASSWORD") setError(err.message);
                throw err;
              }
            }}
            onSuccess={(data) => {
              setUser(data.user);
              setDisableOpen(false);
              setPassword("");
              toast.info("2-step verification turned off");
            }}
            successLabel="Turned off"
          />
        )}
      </Modal>
    </section>
  );
}

/* ------------------------------ Session & mail account ------------------------------ */
function SessionCard() {
  const { user, session } = useAuth();
  const items = [
    { icon: Clock, tone: "warning", label: "Session ends", value: formatFullDate(session?.expiresAt) },
    { icon: LogIn, tone: "primary", label: "Last sign in", value: formatFullDate(user.lastLoginAt) },
  ];
  return (
    <SectionCard icon={Clock} tone="warning" title="Session" subtitle="Sessions last 6 hours - signing in elsewhere ends this one">
      <div className="s-info-grid">
        {items.map(({ icon: Icon, tone, label, value, mono }) => (
          <div className="s-info" key={label}>
            <span className={`s-icon sm tone-${tone}`}>
              <Icon size={16} />
            </span>
            <div style={{ minWidth: 0 }}>
              <span>{label}</span>
              <b className={`truncate ${mono ? "mono" : ""}`}>{value || <i className="faint">Not set</i>}</b>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

export default function SettingsPage() {
  return (
    <div className="page">
      <div className="page-inner s-page">
        <div className="page-head">
          <div>
            <h1>Account & security</h1>
            <p>Your profile, password and 2-step verification.</p>
          </div>
        </div>
        <ProfileHero />
        <TwoFactorCard />
        <div className="s-cols">
          <ProfileCard />
          <PasswordCard />
        </div>
        <SessionCard />
      </div>
    </div>
  );
}
