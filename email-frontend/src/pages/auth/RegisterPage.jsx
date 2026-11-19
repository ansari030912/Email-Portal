import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Mail, Lock, User, ArrowRight, ArrowLeft, AlertCircle, Ticket, BadgeCheck } from "lucide-react";
import AuthLayout from "../../layouts/AuthLayout";
import { PasswordInput, PasswordMatch, PasswordStrength, Spinner, passwordMatchState } from "../../components/ui";
import { registerUser, verifyInviteReferral } from "../../api/endpoints";
import { useToast } from "../../context/ToastContext";
import { passwordChecks } from "../../utils/format";

// Shows the code as XXXX-XXXX-XXXX while typing
const formatCode = (value) =>
  value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12)
    .replace(/(.{4})(?=.)/g, "$1-");

export default function RegisterPage() {
  const [params] = useSearchParams();
  const toast = useToast();
  const navigate = useNavigate();

  // step 1: referral  ->  step 2: account details
  const [step, setStep] = useState("invite");
  const [email, setEmail] = useState(params.get("email") || "");
  const [code, setCode] = useState(formatCode(params.get("code") || ""));
  const [form, setForm] = useState({ name: "", password: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: typeof v === "string" ? v : v.target.value }));

  const strong = passwordChecks(form.password).every((c) => c.ok);
  const matches = form.password && form.password === form.confirm;
  const codeComplete = code.replace(/-/g, "").length === 12;

  const verify = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const data = await verifyInviteReferral({ email, code });
      setEmail(data.email);
      setStep("account");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const register = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await registerUser({ name: form.name, email, password: form.password, inviteCode: code });
      toast.success("Account created - sign in to continue");
      navigate("/login", { replace: true });
    } catch (err) {
      // the referral itself became invalid (used / expired / cancelled) -> back to step 1
      if (String(err.code || "").startsWith("INVITE")) setStep("invite");
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <span className="step-pill">
        <Ticket size={14} /> Invite only · Step {step === "invite" ? 1 : 2} of 2
      </span>
      <h2>{step === "invite" ? "Join with a referral" : "Create your account"}</h2>
      <p className="lead">
        {step === "invite"
          ? "Enter your email and the referral code you received."
          : "Your referral is verified. Set your name and password."}
      </p>

      {error && (
        <div className="form-error">
          <AlertCircle size={16} /> <span>{error}</span>
        </div>
      )}

      {step === "invite" ? (
        <form onSubmit={verify} noValidate>
          <div className="field">
            <label htmlFor="email">Invited email</label>
            <div className="input-wrap">
              <Mail size={17} />
              <input
                id="email"
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@invoicemate.net"
                autoComplete="email"
                autoFocus={!email}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="code">Referral code</label>
            <div className="input-wrap">
              <Ticket size={17} />
              <input
                id="code"
                className="input mono invite-code-input"
                value={code}
                onChange={(e) => setCode(formatCode(e.target.value))}
                placeholder="XXXX-XXXX-XXXX"
                autoComplete="off"
                spellCheck={false}
                autoFocus={!!email}
              />
            </div>
            <span className="hint">The code works only for the email it was issued to.</span>
          </div>
          <button className="btn btn-gradient btn-lg btn-block" disabled={busy || !email || !codeComplete}>
            {busy ? <Spinner /> : <>Verify referral <ArrowRight size={17} /></>}
          </button>
        </form>
      ) : (
        <form onSubmit={register} noValidate>
          <div className="invite-ok">
            <BadgeCheck size={20} />
            <div style={{ minWidth: 0 }}>
              <b className="truncate">{email}</b>
              <span>Referral verified</span>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setStep("invite");
                setError("");
              }}
            >
              Change
            </button>
          </div>
          <div className="field">
            <label htmlFor="name">Full name</label>
            <div className="input-wrap">
              <User size={17} />
              <input id="name" className="input" value={form.name} onChange={set("name")} placeholder="Jane Doe" autoComplete="name" autoFocus />
            </div>
          </div>
          <div className="field">
            <label>Password</label>
            <PasswordInput value={form.password} onChange={set("password")} placeholder="Create a password" autoComplete="new-password" icon={Lock} />
            {form.password && <PasswordStrength password={form.password} />}
          </div>
          <div className="field">
            <label>Confirm password</label>
            <PasswordInput
              value={form.confirm}
              onChange={set("confirm")}
              placeholder="Repeat the password"
              autoComplete="new-password"
              icon={Lock}
              status={passwordMatchState(form.password, form.confirm)}
            />
            <PasswordMatch password={form.password} confirm={form.confirm} />
          </div>
          <button className="btn btn-gradient btn-lg btn-block" disabled={busy || form.name.trim().length < 2 || !strong || !matches}>
            {busy ? <Spinner /> : <>Create account <ArrowRight size={17} /></>}
          </button>
        </form>
      )}

      <p className="auth-switch">
        {step === "account" ? (
          <a href="#back" onClick={(e) => (e.preventDefault(), setStep("invite"))}>
            <ArrowLeft size={14} style={{ verticalAlign: -2 }} /> Back
          </a>
        ) : (
          <>
            Already have an account? <Link to="/login">Sign in</Link>
          </>
        )}
      </p>
    </AuthLayout>
  );
}
