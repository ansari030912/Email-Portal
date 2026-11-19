import { useEffect, useRef, useState } from "react";

// Renders the captured email HTML exactly like a mail client would:
// - sandboxed iframe: scripts can never run (no allow-scripts + CSP script-src 'none')
// - links open in a new tab, forms are blocked
// - grows to the email's real height so the page scrolls, not the frame
const GUARD =
  '<meta charset="utf-8">' +
  "<meta http-equiv=\"Content-Security-Policy\" content=\"script-src 'none'; object-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'\">" +
  '<base target="_blank">' +
  // the frame is sized to the whole email, so it never scrolls itself - the mouse wheel
  // always goes to the page around it
  "<style>html,body{margin:0;height:auto!important;min-height:0!important;overflow:hidden!important}" +
  "body{padding:8px;overflow-wrap:break-word;background:#fff}img{max-width:100%;height:auto}</style>";

const buildDoc = (html) => {
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => `${m}${GUARD}`);
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (m) => `${m}<head>${GUARD}</head>`);
  return `<!doctype html><html><head>${GUARD}<style>body{font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1f2937;line-height:1.55}</style></head><body>${html}</body></html>`;
};

export default function EmailFrame({ html }) {
  const ref = useRef(null);
  const [height, setHeight] = useState(320);
  const [minWidth, setMinWidth] = useState(0);

  useEffect(() => {
    const frame = ref.current;
    if (!frame) return undefined;
    let observer;
    const measure = () => {
      try {
        const doc = frame.contentDocument;
        if (!doc?.documentElement) return;
        setHeight(Math.max(120, doc.documentElement.scrollHeight, doc.body?.scrollHeight || 0) + 4);
        // fixed-width templates wider than the panel: grow the frame, the card scrolls sideways
        const contentWidth = Math.max(doc.documentElement.scrollWidth, doc.body?.scrollWidth || 0);
        setMinWidth(contentWidth > frame.clientWidth + 2 ? contentWidth : 0);
      } catch {
        /* ignore */
      }
    };
    // The frame never scrolls itself, but browsers don't reliably hand the mouse wheel
    // from an iframe to the page - so forward it to the reader's scroll area ourselves.
    const forwardWheel = (e) => {
      const scroller = frame.closest(".reader-scroll");
      if (!scroller || e.ctrlKey) return; // ctrl + wheel = browser zoom, leave it
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? scroller.clientHeight : 1;
      scroller.scrollBy({ top: e.deltaY * unit, left: 0 });
      e.preventDefault();
    };
    let wheelTarget = null;
    const onLoad = () => {
      measure();
      try {
        const doc = frame.contentDocument;
        doc.querySelectorAll("img").forEach((img) => img.addEventListener("load", measure));
        observer = new ResizeObserver(measure);
        observer.observe(doc.documentElement);
        wheelTarget = frame.contentWindow;
        wheelTarget.addEventListener("wheel", forwardWheel, { passive: false });
      } catch {
        /* ignore */
      }
    };
    frame.addEventListener("load", onLoad);
    // a small email can finish loading before this effect runs
    if (frame.contentDocument?.readyState === "complete" && frame.contentDocument.body?.childNodes.length) onLoad();
    return () => {
      frame.removeEventListener("load", onLoad);
      observer?.disconnect();
      try {
        wheelTarget?.removeEventListener("wheel", forwardWheel);
      } catch {
        /* frame already gone */
      }
    };
  }, [html]);

  return (
    <iframe
      ref={ref}
      title="Email content"
      className="email-frame"
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      srcDoc={buildDoc(html || "")}
      style={{ height, minWidth: minWidth || undefined }}
    />
  );
}
