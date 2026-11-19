import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mail, Lock, User, ArrowRight, AlertCircle } from "lucide-react";
import AuthLayout from "../../layouts/AuthLayout";
import { PasswordInput, PasswordStrength, Spinner } from "../../components/ui";
import { registerUser } from "../../api/endpoints";
import { useToast } from "../../context/ToastContext";
import { passwordChecks } from "../../utils/format";

export default function RegisterPage() {
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();
  const navigate = useNavigate();
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: typeof v === "string" ? v : v.target.value }));

  const strong = passwordChecks(form.password).every((c) => c.ok);
  const matches = form.password && form.password === form.confirm;

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!strong) return setError("Choose a stronger password");
    if (!matches) return setError("Passwords don't match");
    setBusy(true);
    try {
      await registerUser({ name: form.name, email: form.email, password: form.password });
      toast.success("Account created - sign in to continue");
      navigate("/login", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <h2>Create your account</h2>
      <p className="lead">You'll see mailboxes once the Super Admin gives you access.</p>

      {error && (
        <div className="form-error">
          <AlertCircle size={16} /> <span>{error}</span>
        </div>
      )}

      <form onSubmit={onSubmit} noValidate>
        <div className="field">
          <label htmlFor="name">Full name</label>
          <div className="input-wrap">
            <User size={17} />
            <input id="name" className="input" value={form.name} onChange={set("name")} placeholder="Jane Doe" autoComplete="name" autoFocus />
          </div>
        </div>
        <div className="field">
          <label htmlFor="email">Work email</label>
          <div className="input-wrap">
            <Mail size={17} />
            <input id="email" className="input" type="email" value={form.email} onChange={set("email")} placeholder="you@invoicemate.net" autoComplete="email" />
          </div>
        </div>
        <div className="field">
          <label>Password</label>
          <PasswordInput value={form.password} onChange={set("password")} placeholder="Create a password" autoComplete="new-password" icon={Lock} />
          {form.password && <PasswordStrength password={form.password} />}
        </div>
        <div className="field">
          <label>Confirm password</label>
          <PasswordInput value={form.confirm} onChange={set("confirm")} placeholder="Repeat the password" autoComplete="new-password" icon={Lock} />
          {form.confirm && !matches && <span className="hint" style={{ color: "var(--danger)" }}>Passwords don't match</span>}
        </div>
        <button className="btn btn-gradient btn-lg btn-block" disabled={busy || !form.name || !form.email || !strong || !matches}>
          {busy ? <Spinner /> : <>Create account <ArrowRight size={17} /></>}
        </button>
      </form>

      <p className="auth-switch">
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </AuthLayout>
  );
}
