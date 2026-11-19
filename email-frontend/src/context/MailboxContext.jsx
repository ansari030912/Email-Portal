import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getMyMailboxes } from "../api/endpoints";

const MailboxContext = createContext(null);
const POLL_MS = 30000;

// Mailboxes assigned to me + unread counts (sidebar). Polls so new emails show up.
export function MailboxProvider({ children }) {
  const [mailboxes, setMailboxes] = useState([]);
  const [totals, setTotals] = useState({ total: 0, unread: 0, starred: 0 });
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await getMyMailboxes();
      setMailboxes(data.mailboxes);
      setTotals(data.totals);
    } catch {
      /* session errors are handled globally */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(() => document.visibilityState === "visible" && refresh(), POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  return <MailboxContext.Provider value={{ mailboxes, totals, loaded, refresh }}>{children}</MailboxContext.Provider>;
}

export const useMailboxes = () => useContext(MailboxContext);
