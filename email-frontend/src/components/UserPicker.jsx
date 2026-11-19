import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Avatar, RoleBadge } from "./ui";
import { Bone } from "./Skeletons";

// Multi-select list of portal users (used when giving mailbox access)
export default function UserPicker({ users, value, onChange }) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return users.filter((u) => !s || u.name.toLowerCase().includes(s) || u.email.includes(s));
  }, [users, q]);
  const toggle = (id) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  return (
    <div>
      <div className="input-wrap" style={{ marginBottom: 10 }}>
        <Search size={16} />
        <input className="input sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search team members" autoFocus />
      </div>
      <div className="picker-list">
        {/* the team always has at least the Super Admin, so an empty list means it is still loading */}
        {users.length === 0 &&
          [0, 1, 2, 3].map((i) => (
            <div key={i} className="picker-row" style={{ cursor: "default" }}>
              <Bone w={18} h={18} r={5} />
              <Bone w={30} h={30} r={999} />
              <div style={{ flex: 1 }}>
                <Bone w={["55%", "42%", "60%", "48%"][i]} h={11} style={{ marginBottom: 6 }} />
                <Bone w={["70%", "58%", "66%", "52%"][i]} h={9} />
              </div>
              <Bone w={46} h={20} r={999} />
            </div>
          ))}
        {list.map((u) => (
          <label key={u._id} className={`picker-row ${value.includes(u._id) ? "on" : ""} ${u.isBlocked ? "blocked" : ""}`}>
            <input type="checkbox" className="checkbox" checked={value.includes(u._id)} onChange={() => toggle(u._id)} />
            <Avatar name={u.name} email={u.email} size={30} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <b className="truncate" style={{ display: "block", fontSize: 13 }}>{u.name}</b>
              <span className="hint truncate" style={{ display: "block" }}>{u.email}</span>
            </div>
            {u.isBlocked ? <span className="badge danger">Blocked</span> : <RoleBadge role={u.role} />}
          </label>
        ))}
        {users.length > 0 && !list.length && <div className="hint" style={{ padding: 12 }}>No team members found</div>}
      </div>
      <div className="hint" style={{ marginTop: 8 }}>{value.length} selected</div>
    </div>
  );
}
