import { useState } from "react";
import { User, KeyRound, ShieldCheck, Clock, AlertCircle, CheckCircle2, Smartphone, Copy, Check, AtSign } from "lucide-react";
import { Avatar, Modal, PasswordInput, PasswordStrength, RoleBadge, Spinner } from "../../components/ui";
import OtpVerifier from "../../components/OtpVerifier";
import { changeMyPassword, disableTwoFactor, enableTwoFactor, generateTwoFactorSetup, updateMyProfile } from "../../api/endpoints";
import { useAuth } from "../../context/AuthContext";
import { useStepUp } from "../../context/StepUpContext";
import { useToast } from "../../context/ToastContext";
import { copyText, formatFullDate, passwordChecks, timeAgo } from "../../utils/format";
import "../../styles/settings.css";

function Msg({ error, success }) {
  if (!error && !success) return null;
  return (
    <div className={`form-error ${success ? "form-success" : ""}`}>
      {success ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />} <span>{error || success}</span>
    </div>
  );
}

function ProfileCard() {
  const { user, setUser } = useAuth();
  const stepUp = useStepUp();
  const toast = useToast();
  const [name, setName] = useState(user.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
    <div className="card">
      <div className="card-header">
        <div className="card-icon">
          <User size={18} />
        </div>
        <h3>Profile</h3>
      </div>
      <form className="card-pad" onSubmit={save}>
        <div className="profile-hero">
          <Avatar name={user.name} email={user.email} size={56} />
          <div style={{ minWidth: 0 }}>
            <b className="truncate" style={{ display: "block", fontSize: 16 }}>{user.name}</b>
            <span className="muted truncate" style={{ display: "block" }}>{user.email}</span>
            <div style={{ marginTop: 6 }}>
              <RoleBadge role={user.role} />
            </div>
          </div>
        </div>
        <Msg error={error} />
        <div className="field">
          <label>Full name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label>Email</label>
          <input className="input" value={user.email} disabled />
          <span className="hint">Your login email can't be changed.</span>
        </div>
        <button className="btn btn-primary" disabled={busy || name.trim().length < 2 || name.trim() === user.name}>
          {busy ? <Spinner /> : "Save changes"}
        </button>
      </form>
    </div>
  );
}

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
    <div className="card">
      <div className="card-header">
        <div className="card-icon">
          <KeyRound size={18} />
        </div>
        <div>
          <h3>Password</h3>
          <span className="hint">Last changed {timeAgo(user.passwordChangedAt)}</span>
        </div>
      </div>
      <form className="card-pad" onSubmit={save}>
        <Msg error={error} />
        <div className="field">
          <label>Current password</label>
          <PasswordInput value={form.current} onChange={set("current")} autoComplete="current-password" />
        </div>
        <div className="field">
          <label>New password</label>
          <PasswordInput value={form.next} onChange={set("next")} autoComplete="new-password" />
          {form.next && <PasswordStrength password={form.next} />}
        </div>
        <div className="field">
          <label>Confirm new password</label>
          <PasswordInput value={form.confirm} onChange={set("confirm")} autoComplete="new-password" />
          {form.confirm && !matches && <span className="hint" style={{ color: "var(--danger)" }}>Passwords don't match</span>}
        </div>
        <button className="btn btn-primary" disabled={busy || !form.current || !strong || !matches}>
          {busy ? <Spinner /> : "Update password"}
        </button>
      </form>
    </div>
  );
}

function TwoFactorCard() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const mandatory = user.role === "SuperAdmin" || user.role === "Admin";
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

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-icon" style={{ background: "var(--success-50)", color: "var(--success)" }}>
          <ShieldCheck size={18} />
        </div>
        <div style={{ flex: 1 }}>
          <h3>2-step verification</h3>
          <span className="hint">Google Authenticator</span>
        </div>
        {user.isTwoFactorEnabled ? <span className="badge success"><span className="dot" /> On</span> : <span className="badge"><span className="dot" /> Off</span>}
      </div>
      <div className="card-pad">
        {user.isTwoFactorEnabled ? (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              Enabled {user.twoFactorEnabledAt ? formatFullDate(user.twoFactorEnabledAt) : ""}. A code is asked at every login
              {mandatory ? " and before every change to your account." : "."}
            </p>
            {mandatory ? (
              <div className="info-box">
                <ShieldCheck size={16} /> 2-step verification is mandatory for the {user.role === "SuperAdmin" ? "Super Admin" : "Admin"} role and can't be turned off.
                Lost your phone? Ask the Super Admin to reset it.
              </div>
            ) : (
              <button className="btn btn-danger-soft" onClick={() => setDisableOpen(true)}>
                Turn off 2-step verification
              </button>
            )}
          </>
        ) : (
          <>
            <p className="muted" style={{ marginTop: 0 }}>Add a second step to your login. Recommended for everyone.</p>
            <button className="btn btn-primary" onClick={start} disabled={busy}>
              {busy ? <Spinner /> : <><Smartphone size={16} /> Set up Google Authenticator</>}
            </button>
          </>
        )}
      </div>

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
        icon={ShieldCheck}
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
            key={password.length > 0 ? "on" : "off"}
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
    </div>
  );
}

function SessionCard() {
  const { user, session } = useAuth();
  return (
    <div className="card">
      <div className="card-header">
        <div className="card-icon" style={{ background: "var(--warning-50)", color: "var(--warning)" }}>
          <Clock size={18} />
        </div>
        <h3>Session & mail account</h3>
      </div>
      <div className="card-pad">
        <dl className="kv">
          <div>
            <dt>Session ends</dt>
            <dd>{formatFullDate(session?.expiresAt)}</dd>
          </div>
          <div>
            <dt>Last login</dt>
            <dd>{formatFullDate(user.lastLoginAt)}</dd>
          </div>
          <div>
            <dt>Mail account ID</dt>
            <dd className="mono">{user.mailAccountId || <span className="faint">not set</span>}</dd>
          </div>
          <div>
            <dt>Mail account email</dt>
            <dd>{user.mailAccountEmail || <span className="faint">not set</span>}</dd>
          </div>
        </dl>
        <div className="info-box" style={{ marginTop: 16 }}>
          <AtSign size={16} /> Sessions last 6 hours. Signing in on another device signs you out here. Mail account fields are set by the Super Admin.
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <div className="page">
      <div className="page-inner">
        <div className="page-head">
          <div>
            <h1>Account & security</h1>
            <p>Manage your profile, password and 2-step verification.</p>
          </div>
        </div>
        <div className="settings-grid">
          <ProfileCard />
          <TwoFactorCard />
          <PasswordCard />
          <SessionCard />
        </div>
      </div>
    </div>
  );
}
