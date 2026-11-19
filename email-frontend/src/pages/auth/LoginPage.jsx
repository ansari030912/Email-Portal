import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mail, Lock, ArrowRight, ArrowLeft, ShieldCheck, Smartphone, Copy, Check, AlertCircle, Info } from "lucide-react";
import AuthLayout from "../../layouts/AuthLayout";
import OtpVerifier from "../../components/OtpVerifier";
import { Avatar, PasswordInput, RoleBadge, Spinner } from "../../components/ui";
import { loginUser, verifyLoginTwoFactorCode } from "../../api/endpoints";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { copyText } from "../../utils/format";

function useCountdown(seconds, onEnd) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    setLeft(seconds);
    if (!seconds) return;
    const end = Date.now() + seconds * 1000;
    const t = setInterval(() => {
      const s = Math.max(0, Math.round((end - Date.now()) / 1000));
      setLeft(s);
      if (!s) {
        clearInterval(t);
        onEnd?.();
      }
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds]);
  return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
}

export default function LoginPage() {
  const { signIn, endReason } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [step, setStep] = useState("credentials"); // credentials | setup | verify
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [challenge, setChallenge] = useState(null);
  const [copied, setCopied] = useState(false);

  const backToStart = (message) => {
    setStep("credentials");
    setChallenge(null);
    setPassword("");
    if (message) setError(message);
  };
  const countdown = useCountdown(challenge?.expiresInSeconds || 0, () => backToStart("The verification step expired. Please sign in again."));

  const finish = (data) => {
    signIn(data.user, data.session);
    toast.success(data.twoFactorJustEnabled ? "2-step verification is on. Welcome!" : `Welcome back, ${data.user.name.split(" ")[0]}`);
    navigate("/mail", { replace: true });
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const data = await loginUser({ email, password });
      if (data.twoFactorSetupRequired) {
        setChallenge(data);
        setStep("setup");
      } else if (data.twoFactorRequired) {
        setChallenge(data);
        setStep("verify");
      } else {
        finish(data);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (code) => {
    try {
      return await verifyLoginTwoFactorCode({ challengeToken: challenge.challengeToken, code });
    } catch (err) {
      if (err.code === "LOGIN_CHALLENGE_EXPIRED") {
        setTimeout(() => backToStart(err.message), 900);
      }
      throw err;
    }
  };

  const copySecret = async () => {
    if (await copyText(challenge.manualKey)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  };

  if (step === "credentials") {
    return (
      <AuthLayout>
        <h2>Sign in</h2>
        <p className="lead">Welcome back - log in to read your team's emails.</p>

        {(error || endReason) && (
          <div className={`form-error ${!error ? "info" : ""}`} style={!error ? { background: "var(--primary-50)", color: "var(--primary)" } : undefined}>
            {error ? <AlertCircle size={16} /> : <Info size={16} />}
            <span>{error || endReason}</span>
          </div>
        )}

        <form onSubmit={onSubmit} noValidate>
          <div className="field">
            <label htmlFor="email">Email</label>
            <div className="input-wrap">
              <Mail size={17} />
              <input
                id="email"
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@invoicemate.net"
                autoComplete="username"
                autoFocus
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <PasswordInput value={password} onChange={setPassword} placeholder="Your password" autoComplete="current-password" icon={Lock} />
          </div>
          <button className="btn btn-gradient btn-lg btn-block" disabled={busy || !email || !password} style={{ marginTop: 6 }}>
            {busy ? <Spinner /> : <>Continue <ArrowRight size={17} /></>}
          </button>
        </form>

        <p className="auth-switch">
          New here? <Link to="/register">Create an account</Link>
        </p>
      </AuthLayout>
    );
  }

  const who = (
    <div className="who">
      <Avatar name={challenge.user.name} email={challenge.user.email} size={40} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <b className="truncate">{challenge.user.name}</b>
        <span className="truncate">{challenge.user.email}</span>
      </div>
      <RoleBadge role={challenge.user.role} />
    </div>
  );

  if (step === "setup") {
    return (
      <AuthLayout>
        <span className="step-pill">
          <ShieldCheck size={14} /> Required for your role
        </span>
        <h2>Set up 2-step verification</h2>
        <p className="lead">Your account needs Google Authenticator before it can be opened.</p>
        {who}

        <div className="setup-steps">
          <div className="setup-step">
            <i>1</i>
            <span>
              Install <b>Google Authenticator</b> on your phone <Smartphone size={13} style={{ verticalAlign: -2 }} />
            </span>
          </div>
          <div className="setup-step">
            <i>2</i>
            <span>
              Tap <b>+</b> and <b>scan this QR code</b> (or enter the key)
            </span>
          </div>
        </div>

        <div className="qr-box">
          <img src={challenge.qrCode} alt="Google Authenticator QR code" />
          <div style={{ minWidth: 0 }}>
            <div className="hint">Can't scan? Enter this key</div>
            <div className="secret-key">
              <span className="mono" style={{ flex: 1 }}>
                {challenge.manualKey.match(/.{1,4}/g).join(" ")}
              </span>
              <button className="icon-btn sm" onClick={copySecret} aria-label="Copy key">
                {copied ? <Check size={15} color="var(--success)" /> : <Copy size={15} />}
              </button>
            </div>
          </div>
        </div>

        <div className="setup-step" style={{ marginBottom: 14 }}>
          <i>3</i>
          <span>
            Type the <b>6 digit code</b> shown in the app
          </span>
        </div>
        <div className="otp-card">
          <OtpVerifier onVerify={verify} onSuccess={finish} successLabel="2-step verification enabled" />
        </div>

        <div className="countdown">This step expires in {countdown}</div>
        <p className="auth-switch">
          <a href="#back" onClick={(e) => (e.preventDefault(), backToStart())}>
            <ArrowLeft size={14} style={{ verticalAlign: -2 }} /> Use a different account
          </a>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <span className="step-pill">
        <ShieldCheck size={14} /> Step 2 of 2
      </span>
      <h2>Verify it's you</h2>
      <p className="lead">Enter the 6 digit code from your Google Authenticator app.</p>
      {who}
      <div className="otp-card">
        <OtpVerifier onVerify={verify} onSuccess={finish} />
      </div>
      <div className="countdown">This step expires in {countdown}</div>
      <p className="auth-switch">
        <a href="#back" onClick={(e) => (e.preventDefault(), backToStart())}>
          <ArrowLeft size={14} style={{ verticalAlign: -2 }} /> Back to sign in
        </a>
      </p>
    </AuthLayout>
  );
}
