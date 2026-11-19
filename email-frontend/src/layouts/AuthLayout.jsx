import { Mail, ShieldCheck, Inbox, Lock, CheckCircle2, Users } from "lucide-react";
import "../styles/auth.css";

const FEATURES = [
  { icon: Inbox, text: "One clean inbox" },
  { icon: Lock, text: "Private by default" },
  { icon: ShieldCheck, text: "Secure sign-in" },
];

// Envelope that opens, lets a letter rise out, then closes again (pure SVG + CSS)
function EnvelopeScene() {
  return (
    <div className="scene" aria-hidden="true">
      <span className="scene-glow" />
      <div className="orbit o1">
        <i />
      </div>
      <div className="orbit o2">
        <i />
      </div>
      <div className="orbit o3">
        <i />
      </div>
      {[...Array(7)].map((_, i) => (
        <span key={i} className={`spark s${i}`} />
      ))}

      {/* real 3D envelope: back, letter, front pocket and a flap that swings on its hinge */}
      <div className="env-stage">
        <span className="env-ground" />
        <div className="env3d">
          <div className="env-back" />
          <div className="env-letter">
            <span className="l-line l1" />
            <span className="l-line l2" />
            <span className="l-line l3" />
            <span className="l-line l4" />
            <span className="l-btn" />
            <span className="l-check">
              <svg viewBox="0 0 24 24" width="14" height="14">
                <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </div>
          <div className="env-front">
            <span className="p-left" />
            <span className="p-right" />
            <span className="p-bottom" />
          </div>
          <div className="env-flap">
            <span className="flap-face flap-out" />
            <span className="flap-face flap-in" />
            <span className="env-seal">@</span>
          </div>
        </div>
      </div>

      {/* paper plane flying a loop */}
      <svg className="plane-trail" viewBox="0 0 480 340" preserveAspectRatio="none">
        <path d="M-20 290 C 100 140, 230 350, 345 150 S 490 45, 525 25" />
      </svg>
      <svg className="plane" viewBox="0 0 24 24" width="26" height="26">
        <path d="M22 2 11 13" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M22 2 15 22 11 13 2 9 22 2z" fill="rgba(255,255,255,0.92)" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>

      {/* floating glass badges */}
      <span className="float-badge fb-1">
        <span className="fb-icon green">
          <CheckCircle2 size={13} />
        </span>
        New message
      </span>
      <span className="float-badge fb-2">
        <span className="fb-icon violet">
          <ShieldCheck size={13} />
        </span>
        Secure sign-in
      </span>
      <span className="float-badge fb-3">
        <span className="fb-icon blue">
          <Users size={13} />
        </span>
        All caught up
      </span>
    </div>
  );
}

export default function AuthLayout({ children }) {
  return (
    <div className="auth">
      <aside className="auth-hero">
        <span className="mesh m1" />
        <span className="mesh m2" />
        <span className="mesh m3" />
        <span className="hero-grid" />

        <div className="brand brand-light">
          <span className="brand-mark">
            <Mail size={18} />
          </span>
          <span>
            InvoiceMate <b>Mail</b>
          </span>
        </div>

        <div className="hero-center">
          <EnvelopeScene />

          <div className="auth-hero-body">
            <h1>
              Every message,
              <br />
              <span className="shimmer-text">right where it belongs.</span>
            </h1>
            <p>Fast, private and secure. Sign in to pick up where you left off.</p>
            <div className="hero-chips">
              {FEATURES.map(({ icon: Icon, text }, i) => (
                <span key={text} className="hero-chip" style={{ animationDelay: `${0.2 + i * 0.1}s` }}>
                  <Icon size={14} /> {text}
                </span>
              ))}
            </div>
          </div>
        </div>
      </aside>

      <main className="auth-main">
        <span className="blob b1" />
        <span className="blob b2" />
        <div className="auth-card">{children}</div>
      </main>
    </div>
  );
}
