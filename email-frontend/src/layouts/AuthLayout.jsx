import { Mail, ShieldCheck, Inbox, Lock } from "lucide-react";
import "../styles/auth.css";

const FEATURES = [
  { icon: Inbox, title: "Every beta email, one inbox", text: "DeFa, PayMate and every new project drop their emails here instead of public inboxes." },
  { icon: Lock, title: "Only what's yours", text: "You see a mailbox only after the Super Admin assigns it to you." },
  { icon: ShieldCheck, title: "Google Authenticator", text: "2-step verification is enforced for admins on every sensitive action." },
];

export default function AuthLayout({ children }) {
  return (
    <div className="auth">
      <aside className="auth-hero">
        <div className="auth-hero-glow" />
        <div className="brand brand-light">
          <span className="brand-mark">
            <Mail size={18} />
          </span>
          <span>
            InvoiceMate <b>Mail</b>
          </span>
        </div>

        <div className="auth-hero-body">
          <h1>
            Private email portal
            <br />
            for our beta environments
          </h1>
          <p>Real templates, real recipients - delivered to the right teammate, never to a public inbox.</p>

          <div className="auth-features">
            {FEATURES.map(({ icon: Icon, title, text }, i) => (
              <div className="auth-feature" key={title} style={{ animationDelay: `${0.15 + i * 0.1}s` }}>
                <span>
                  <Icon size={18} />
                </span>
                <div>
                  <b>{title}</b>
                  <p>{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="auth-mock" aria-hidden="true">
          {[
            ["DeFa", "Reset your password", "#4f6bff"],
            ["PayMate", "Your term sheet is ready", "#10b981"],
            ["DeFa", "New login to your account", "#f97316"],
          ].map(([p, s, c], i) => (
            <div className="auth-mock-row" key={s} style={{ animationDelay: `${0.4 + i * 0.12}s` }}>
              <span className="auth-mock-dot" style={{ background: c }} />
              <b>{p}</b>
              <span>{s}</span>
            </div>
          ))}
        </div>
      </aside>

      <main className="auth-main">
        <div className="auth-card">{children}</div>
      </main>
    </div>
  );
}
