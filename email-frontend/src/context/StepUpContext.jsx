import { createContext, useCallback, useContext, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Modal } from "../components/ui";
import OtpVerifier from "../components/OtpVerifier";
import { useAuth } from "./AuthContext";

const StepUpContext = createContext(null);

/**
 * Sensitive actions (password / profile change, role change, project keys ...) need a
 * fresh Google Authenticator code for SuperAdmin & Admin (and Users who turned 2FA on).
 *
 *   const stepUp = useStepUp();
 *   const result = await stepUp({ title, description, action: (twoFactorCode) => api({ ..., twoFactorCode }) });
 *
 * - no 2FA needed  -> action runs straight away
 * - 2FA needed     -> the code modal opens; a wrong code shakes and lets you retry, any other
 *                     error closes the modal and is thrown to the caller.
 */
export function StepUpProvider({ children }) {
  const { user } = useAuth();
  const [state, setState] = useState(null);
  const pending = useRef(null);

  const close = () => {
    setState(null);
    pending.current = null;
  };

  const stepUp = useCallback(
    ({ title, description, action }) => {
      if (!user?.twoFactorRequired) return action(undefined);
      return new Promise((resolve, reject) => {
        pending.current = { resolve, reject, action };
        setState({ title, description, key: Date.now() });
      });
    },
    [user]
  );

  const onVerify = async (code) => {
    const p = pending.current;
    try {
      return await p.action(code);
    } catch (err) {
      if (err?.isTwoFactorError) throw err; // stay open -> error animation + retry
      close();
      p.reject(err);
      return new Promise(() => {}); // never resolves - modal already closed
    }
  };

  const onSuccess = (result) => {
    const p = pending.current;
    close();
    p?.resolve(result);
  };

  const onCancel = () => {
    const p = pending.current;
    close();
    p?.reject(Object.assign(new Error("Cancelled"), { cancelled: true }));
  };

  return (
    <StepUpContext.Provider value={stepUp}>
      {children}
      <Modal
        open={!!state}
        onClose={onCancel}
        icon={ShieldCheck}
        title={state?.title || "Confirm it's you"}
        subtitle={state?.description || "Enter the code from Google Authenticator to continue."}
        closeOnBackdrop={false}
      >
        <div style={{ padding: "10px 0 6px" }}>
          {state && <OtpVerifier key={state.key} onVerify={onVerify} onSuccess={onSuccess} successLabel="Confirmed" />}
        </div>
      </Modal>
    </StepUpContext.Provider>
  );
}

export const useStepUp = () => useContext(StepUpContext);
