import { Check, ChevronDown, ShieldCheck, User } from "lucide-react";
import { Dropdown } from "./ui";

const ROLES = [
  { value: "Admin", label: "Admin", icon: ShieldCheck, hint: "2-step verification required" },
  { value: "User", label: "User", icon: User, hint: "Sees only assigned mailboxes" },
];

// Pill style role switcher used in the team table (SuperAdmin can't be picked)
export default function RolePicker({ value, onChange }) {
  const current = ROLES.find((r) => r.value === value) || ROLES[1];
  const Icon = current.icon;
  return (
    <Dropdown
      align="left"
      width={250}
      trigger={
        <button type="button" className={`role-trigger role-${current.value}`}>
          <Icon size={14} />
          <span>{current.label}</span>
          <ChevronDown size={14} className="role-chevron" />
        </button>
      }
    >
      <div className="menu-title">Change role</div>
      {ROLES.map((r) => {
        const RIcon = r.icon;
        const active = r.value === value;
        return (
          <button key={r.value} className={`menu-item role-option ${active ? "active" : ""}`} onClick={() => !active && onChange(r.value)}>
            <span className={`role-option-icon role-${r.value}`}>
              <RIcon size={15} />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <b style={{ display: "block", fontSize: 13.5 }}>{r.label}</b>
              <span className="hint">{r.hint}</span>
            </span>
            {active && <Check size={16} color="var(--primary)" />}
          </button>
        );
      })}
    </Dropdown>
  );
}
