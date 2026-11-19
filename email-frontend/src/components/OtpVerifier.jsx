import { useEffect, useRef, useState } from "react";
import { AlertCircle } from "lucide-react";
import "../styles/otp.css";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 6-box Google Authenticator code input.
 * - auto moves to the next box, supports paste / autofill / backspace / arrows
 * - verifies automatically when the 6th digit is typed (no button)
 * - animations: wave while verifying, green flip + check on success, red shake on error
 *
 * onVerify(code) -> Promise. Throw to show the error state (error.message is shown).
 * onSuccess(result) is called after the success animation.
 */
export default function OtpVerifier({ onVerify, onSuccess, length = 6, autoFocus = true, successLabel = "Verified" }) {
  const [digits, setDigits] = useState(() => Array(length).fill(""));
  const [status, setStatus] = useState("idle"); // idle | verifying | success | error
  const [error, setError] = useState("");
  const inputs = useRef([]);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    if (autoFocus) setTimeout(() => inputs.current[0]?.focus(), 60);
    return () => {
      mounted.current = false;
    };
  }, [autoFocus]);

  const locked = status === "verifying" || status === "success";

  const focusBox = (i) => {
    const el = inputs.current[Math.max(0, Math.min(length - 1, i))];
    if (el) {
      el.focus();
      el.select();
    }
  };

  const submit = async (code) => {
    setStatus("verifying");
    setError("");
    try {
      // keep the verifying animation visible for a moment even on a fast network
      const [result] = await Promise.all([onVerify(code), wait(700)]);
      if (!mounted.current) return;
      setStatus("success");
      await wait(1150);
      if (mounted.current) onSuccess?.(result);
    } catch (err) {
      if (!mounted.current) return;
      setStatus("error");
      setError(err?.message || "Invalid code");
      await wait(850);
      if (!mounted.current) return;
      setDigits(Array(length).fill(""));
      setStatus("idle");
      focusBox(0);
    }
  };

  const applyDigits = (next) => {
    setDigits(next);
    if (next.every((d) => d !== "")) submit(next.join(""));
  };

  const fillFrom = (start, text) => {
    const clean = text.replace(/\D/g, "").slice(0, length - start);
    if (!clean) return;
    const next = [...digits];
    clean.split("").forEach((ch, k) => {
      next[start + k] = ch;
    });
    applyDigits(next);
    focusBox(Math.min(length - 1, start + clean.length));
  };

  const onChange = (i, e) => {
    if (locked) return;
    if (error) setError("");
    const value = e.target.value.replace(/\D/g, "");
    if (!value) {
      const next = [...digits];
      next[i] = "";
      setDigits(next);
      return;
    }
    if (value.length > 1) return fillFrom(i, value); // autofill / fast typing
    const next = [...digits];
    next[i] = value;
    applyDigits(next);
    if (i < length - 1) focusBox(i + 1);
  };

  const onKeyDown = (i, e) => {
    if (locked) return;
    if (e.key === "Backspace") {
      e.preventDefault();
      const next = [...digits];
      if (next[i]) {
        next[i] = "";
        setDigits(next);
      } else if (i > 0) {
        next[i - 1] = "";
        setDigits(next);
        focusBox(i - 1);
      }
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      focusBox(i - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      focusBox(i + 1);
    }
  };

  const onPaste = (i, e) => {
    e.preventDefault();
    if (!locked) fillFrom(i, e.clipboardData.getData("text"));
  };

  return (
    <div className="otp-verifier">
      <div className={`otp otp-${status}`} role="group" aria-label="6 digit verification code">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => (inputs.current[i] = el)}
            className={`otp-box ${d ? "filled" : ""}`}
            style={{ "--i": i }}
            value={d}
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            maxLength={length}
            aria-label={`Digit ${i + 1}`}
            disabled={locked}
            onChange={(e) => onChange(i, e)}
            onKeyDown={(e) => onKeyDown(i, e)}
            onPaste={(e) => onPaste(i, e)}
            onFocus={(e) => e.target.select()}
          />
        ))}
      </div>

      <div className="otp-status" aria-live="polite">
        {status === "verifying" && (
          <span className="otp-verifying">
            Verifying<span className="otp-dots"><i /><i /><i /></span>
          </span>
        )}
        {status === "success" && (
          <span className="otp-success-msg">
            <svg className="otp-check" viewBox="0 0 52 52" aria-hidden="true">
              <circle className="otp-check-circle" cx="26" cy="26" r="23" />
              <path className="otp-check-mark" d="M15 27.5l7.2 7.2L37.5 19" />
            </svg>
            {successLabel}
          </span>
        )}
        {status !== "verifying" && status !== "success" && error && (
          <span className="otp-error-msg">
            <AlertCircle size={15} /> {error}
          </span>
        )}
        {status === "idle" && !error && <span className="faint">Open Google Authenticator and type the 6 digit code</span>}
      </div>
    </div>
  );
}
