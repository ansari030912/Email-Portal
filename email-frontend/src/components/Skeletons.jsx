// Loading placeholders shaped like the real content, so nothing jumps when data arrives.

export function Bone({ w = "100%", h = 12, r = 6, style }) {
  return <span className="skeleton bone" style={{ width: w, height: h, borderRadius: r, ...style }} />;
}

const widths = ["72%", "54%", "64%", "48%", "80%", "58%", "68%", "44%"];
const pick = (i) => widths[i % widths.length];

// Stat cards row (Team members / Mailbox access)
export function StatsSkeleton({ count = 3 }) {
  return (
    <div className="stats">
      {Array.from({ length: count }).map((_, i) => (
        <div className="card stat" key={i}>
          <Bone w={38} h={38} r={11} />
          <div style={{ flex: 1 }}>
            <Bone w={46} h={20} style={{ marginBottom: 7 }} />
            <Bone w="62%" h={10} />
          </div>
        </div>
      ))}
    </div>
  );
}

// Table body placeholder. `columns` describes each cell: "user" | "pill" | "text" | "check" | "action"
export function TableSkeleton({ columns, rows = 6 }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={i}>{c === "check" || c === "action" ? "" : <Bone w={i === 0 ? 70 : 50} h={9} />}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r} style={{ animationDelay: `${r * 40}ms` }} className="skeleton-row">
              {columns.map((c, i) => (
                <td key={i}>
                  {c === "user" && (
                    <div className="row" style={{ gap: 12 }}>
                      <Bone w={34} h={34} r={999} />
                      <div style={{ flex: 1, minWidth: 120 }}>
                        <Bone w={pick(r)} h={12} style={{ marginBottom: 7 }} />
                        <Bone w={pick(r + 3)} h={9} />
                      </div>
                    </div>
                  )}
                  {c === "pill" && <Bone w={64} h={22} r={999} />}
                  {c === "text" && <Bone w={pick(r + i)} h={11} style={{ minWidth: 60 }} />}
                  {c === "check" && <Bone w={18} h={18} r={5} />}
                  {c === "action" && <Bone w={28} h={28} r={8} style={{ marginLeft: "auto" }} />}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Project key cards
export function ProjectCardsSkeleton({ count = 3 }) {
  return (
    <div className="project-grid">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card project-card">
          <div className="row">
            <Bone w={38} h={38} r={11} />
            <div style={{ flex: 1 }}>
              <Bone w="55%" h={14} style={{ marginBottom: 7 }} />
              <Bone w="35%" h={10} />
            </div>
            <Bone w={40} h={22} r={999} />
          </div>
          <Bone h={36} r={10} />
          <Bone h={36} r={10} />
          <div className="row" style={{ gap: 18 }}>
            <Bone w={50} h={26} />
            <Bone w={70} h={26} />
            <Bone w={70} h={26} />
          </div>
          <div className="row">
            <Bone w={64} h={22} r={999} />
            <Bone w={70} h={22} r={999} />
            <div className="spacer" />
            <Bone w={80} h={30} r={8} />
          </div>
        </div>
      ))}
    </div>
  );
}

// Email reader: toolbar, subject, sender row and the email body card
export function ReaderSkeleton() {
  return (
    <div className="reader">
      <div className="reader-toolbar">
        <Bone w={190} h={36} r={11} />
        <div className="spacer" />
        <Bone w={34} h={34} r={10} />
        <Bone w={34} h={34} r={10} />
      </div>
      <div className="reader-scroll">
        <Bone w="58%" h={24} style={{ marginBottom: 14 }} />
        <div className="row" style={{ marginBottom: 24 }}>
          <Bone w={84} h={20} r={6} />
          <Bone w={44} h={20} r={999} />
          <Bone w={120} h={20} r={999} />
        </div>
        <div className="row" style={{ gap: 12, marginBottom: 18 }}>
          <Bone w={42} h={42} r={999} />
          <div style={{ flex: 1 }}>
            <Bone w="30%" h={13} style={{ marginBottom: 8 }} />
            <Bone w="22%" h={10} />
          </div>
          <Bone w={150} h={10} />
        </div>
        <div className="email-canvas" style={{ padding: "36px 0" }}>
          <div style={{ maxWidth: 560, margin: "0 auto", padding: "0 20px" }}>
            <Bone h={120} r={10} style={{ marginBottom: 26 }} />
            <Bone w="88%" h={12} style={{ marginBottom: 10 }} />
            <Bone w="76%" h={12} style={{ marginBottom: 10 }} />
            <Bone w="82%" h={12} style={{ marginBottom: 26 }} />
            <Bone w={170} h={42} r={8} style={{ margin: "0 auto 26px", display: "block" }} />
            <Bone w="40%" h={12} style={{ marginBottom: 10 }} />
            <Bone w="30%" h={12} />
          </div>
        </div>
      </div>
    </div>
  );
}

// Sidebar mailbox list
export function MailboxListSkeleton({ count = 3 }) {
  return (
    <div style={{ padding: "4px 12px" }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="row" style={{ height: 34, gap: 12, padding: "0 4px" }}>
          <Bone w={9} h={9} r={3} />
          <Bone w={pick(i)} h={10} />
        </div>
      ))}
    </div>
  );
}

// Filter chips row (projects in the inbox)
export function ChipsSkeleton() {
  return (
    <div className="filter-chips">
      {[86, 74, 96].map((w, i) => (
        <Bone key={i} w={w} h={28} r={999} />
      ))}
    </div>
  );
}

// First paint while the session is being restored: looks like the app shell
export function AppBootSkeleton() {
  return (
    <div className="shell boot">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <Bone w={34} h={34} r={10} />
          <Bone w={130} h={14} />
        </div>
        <div style={{ padding: "8px 12px" }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="row" style={{ height: 38, gap: 12, padding: "0 12px" }}>
              <Bone w={18} h={18} r={5} />
              <Bone w={pick(i)} h={11} />
            </div>
          ))}
        </div>
        <MailboxListSkeleton />
      </aside>
      <div className="shell-main">
        <header className="topbar">
          <Bone w="min(620px, 100%)" h={44} r={12} />
          <div className="spacer" />
          <Bone w={32} h={32} r={999} />
        </header>
        <div className="shell-content" style={{ padding: 24 }}>
          <Bone w={220} h={20} style={{ marginBottom: 20 }} />
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="row" style={{ gap: 12, marginBottom: 22 }}>
              <Bone w={38} h={38} r={999} />
              <div style={{ flex: 1, maxWidth: 420 }}>
                <Bone w={pick(i)} h={12} style={{ marginBottom: 8 }} />
                <Bone w={pick(i + 2)} h={10} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
