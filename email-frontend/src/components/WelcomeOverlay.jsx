import { useEffect, useState } from "react";
import { Mail, Check } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useMailboxes } from "../context/MailboxContext";
import "../styles/welcome.css";

const STEPS = ["Securing your session", "Syncing your mailboxes", "Preparing your inbox"];
const STEP_MS = 600; // one step every 600ms
const MIN_MS = STEPS.length * STEP_MS + 200; // never just flicker
const LEAVE_MS = 650; // exit animation

/**
 * Full screen welcome animation, shown once right after a fresh login.
 * Stays until the steps have played AND the user's mailboxes have loaded,
 * then fades away and the dashboard rises into view.
 */
export default function WelcomeOverlay() {
  const { user, welcome, finishWelcome } = useAuth();
  const { loaded } = useMailboxes();
  const [step, setStep] = useState(0); // number of finished steps
  const [minDone, setMinDone] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!welcome) return undefined;
    const timers = STEPS.map((_, i) => setTimeout(() => setStep(i + 1), (i + 1) * STEP_MS));
    timers.push(setTimeout(() => setMinDone(true), MIN_MS));
    return () => timers.forEach(clearTimeout);
  }, [welcome]);

  // 1) steps played + mailboxes loaded -> start the exit animation
  useEffect(() => {
    if (welcome && minDone && loaded && !leaving) setLeaving(true);
  }, [welcome, minDone, loaded, leaving]);

  // 2) exit animation finished -> remove the overlay. Kept separate from (1):
  //    setting `leaving` must not cancel this timer.
  useEffect(() => {
    if (!leaving) return undefined;
    const t = setTimeout(() => {
      finishWelcome();
      setLeaving(false);
      setStep(0);
      setMinDone(false);
    }, LEAVE_MS);
    return () => clearTimeout(t);
  }, [leaving, finishWelcome]);

  if (!welcome) return null;
  const firstName = (user?.name || "").split(" ")[0] || "there";
  const progress = Math.min(100, (step / STEPS.length) * (loaded ? 100 : 92));

  return (
    <div className={`welcome ${leaving ? "leaving" : ""}`} role="status" aria-live="polite">
      <span className="w-mesh w1" />
      <span className="w-mesh w2" />
      <span className="w-grid" />

      <div className="w-center">
        <div className="w-logo">
          <span className="w-ring" />
          <span className="w-orbit o-a">
            <i />
          </span>
          <span className="w-orbit o-b">
            <i />
          </span>
          <span className="w-mark">
            <Mail size={30} />
          </span>
        </div>

        <h1 className="w-title">
          Welcome back, <span className="w-name">{firstName}</span>
        </h1>

        <ul className="w-steps">
          {STEPS.map((label, i) => {
            const state = i < step ? "done" : i === step ? "active" : "todo";
            return (
              <li key={label} className={`w-step ${state}`}>
                <span className="w-dot">{state === "done" ? <Check size={12} strokeWidth={3.5} /> : state === "active" ? <i /> : null}</span>
                {label}
              </li>
            );
          })}
        </ul>

        <div className="w-bar">
          <span style={{ width: `${progress}%` }} />
        </div>
      </div>
    </div>
  );
}
