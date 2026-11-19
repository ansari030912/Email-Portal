import { useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

// 1 … 4 5 [6] 7 8 … 20
const pageList = (page, pages) => {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const set = new Set([1, pages, page, page - 1, page + 1]);
  if (page <= 3) [2, 3, 4].forEach((p) => set.add(p));
  if (page >= pages - 2) [pages - 1, pages - 2, pages - 3].forEach((p) => set.add(p));
  const sorted = [...set].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b);
  const out = [];
  sorted.forEach((p, i) => {
    if (i && p - sorted[i - 1] > 1) out.push(`gap-${p}`);
    out.push(p);
  });
  return out;
};

/**
 * Pagination bar used under every table: "1–25 of 120" · Prev 1 2 3 … Next · rows 10/25/50/100
 * The active page indicator slides between numbers.
 */
export default function Pagination({ page, limit, total, onPage, onLimit, sizes = [10, 25, 50, 100], label = "rows" }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  const current = Math.min(page, pages);
  const from = total ? (current - 1) * limit + 1 : 0;
  const to = Math.min(total, current * limit);
  const go = (p) => p !== current && p >= 1 && p <= pages && onPage(p);
  const list = pageList(current, pages);

  // sliding active pill
  const groupRef = useRef(null);
  const [pill, setPill] = useState(null);
  useLayoutEffect(() => {
    const el = groupRef.current?.querySelector(".pg-num.active");
    if (el) setPill({ left: el.offsetLeft, width: el.offsetWidth });
  }, [current, pages, list.length]);

  return (
    <nav className="pagination" aria-label="Pagination">
      <div className="pg-info">
        <b>
          {from}–{to}
        </b>{" "}
        of {total} {label}
      </div>

      <div className="pg-group" ref={groupRef}>
        {pill && <span className="pg-pill" style={{ transform: `translateX(${pill.left}px)`, width: pill.width }} />}
        <button className="pg-nav" onClick={() => go(current - 1)} disabled={current <= 1} aria-label="Previous page">
          <ChevronLeft size={16} />
          <span>Prev</span>
        </button>
        {list.map((p) =>
          typeof p === "string" ? (
            <span key={p} className="pg-gap">
              …
            </span>
          ) : (
            <button
              key={p}
              className={`pg-num ${p === current ? "active" : ""}`}
              onClick={() => go(p)}
              aria-current={p === current ? "page" : undefined}
            >
              {p}
            </button>
          )
        )}
        <button className="pg-nav" onClick={() => go(current + 1)} disabled={current >= pages} aria-label="Next page">
          <span>Next</span>
          <ChevronRight size={16} />
        </button>
      </div>

      {onLimit && (
        <div className="pg-sizes" role="group" aria-label="Rows per page">
          <span className="pg-sizes-label">Rows</span>
          {sizes.map((s) => (
            <button key={s} className={s === limit ? "active" : ""} onClick={() => s !== limit && onLimit(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
    </nav>
  );
}
