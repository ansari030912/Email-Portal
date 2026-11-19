import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { getMyProfile, logoutUser } from "../api/endpoints";
import { useToast } from "./ToastContext";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [endReason, setEndReason] = useState(null);
  const toast = useToast();
  const expiryTimer = useRef(null);

  // welcome: true -> play the welcome loading animation once (fresh login only)
  const [welcome, setWelcome] = useState(false);
  const signIn = useCallback((nextUser, nextSession, { welcome: showWelcome = false } = {}) => {
    setUser(nextUser);
    if (nextSession) setSession(nextSession);
    setEndReason(null);
    if (showWelcome) setWelcome(true);
  }, []);
  const finishWelcome = useCallback(() => setWelcome(false), []);

  const clear = useCallback((reason) => {
    setUser(null);
    setSession(null);
    if (reason) setEndReason(reason);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await logoutUser();
    } catch {
      /* the cookie is cleared server side anyway */
    }
    clear();
  }, [clear]);

  const refreshProfile = useCallback(async () => {
    const data = await getMyProfile();
    setUser(data.user);
    setSession(data.session);
    return data.user;
  }, []);

  // restore the session on page load
  useEffect(() => {
    getMyProfile()
      .then((data) => {
        setUser(data.user);
        setSession(data.session);
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  // any API call that finds the session gone (expired / replaced / revoked) lands here
  useEffect(() => {
    const onEnd = (e) => {
      setUser((current) => {
        if (current) toast.error(e.detail.message);
        return null;
      });
      setSession(null);
      setEndReason(e.detail.message);
    };
    window.addEventListener("portal:session-ended", onEnd);
    return () => window.removeEventListener("portal:session-ended", onEnd);
  }, [toast]);

  // log out exactly when the 6 hour session ends
  useEffect(() => {
    clearTimeout(expiryTimer.current);
    if (!session?.expiresAt) return;
    const ms = new Date(session.expiresAt).getTime() - Date.now();
    expiryTimer.current = setTimeout(() => {
      clear("Your 6 hour session ended. Please log in again.");
      toast.info("Session ended - please log in again");
    }, Math.max(0, Math.min(ms, 2 ** 31 - 1)));
    return () => clearTimeout(expiryTimer.current);
  }, [session, clear, toast]);

  return (
    <AuthContext.Provider value={{ user, session, loading, endReason, signIn, signOut, refreshProfile, setUser, welcome, finishWelcome }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
