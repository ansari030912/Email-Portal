import { Check, ChevronDown, ShieldCheck, User, Info } from "lucide-react";
import { Dropdown } from "./ui";

const ROLES = [
  { value: "Admin", label: "Admin", icon: ShieldCheck, hint: "Mandatory 2-step verification" },
  { value: "User", label: "User", icon: User, hint: "Only assigned mailboxes" },
];

// Pill style role switcher used in the team table (SuperAdmin can't be picked)
export default function RolePicker({ value, onChange }) {
  const current = ROLES.find((r) => r.value === value) || ROLES[1];
  const Icon = current.icon;
  return (
    <Dropdown
      align="left"
      width={284}
      trigger={
        <button type="button" className={`role-trigger role-${current.value}`}>
          <Icon size={14} />
          <span>{current.label}</span>
          <ChevronDown size={14} className="role-chevron" />
        </button>
      }
    >
      <div className="role-menu">
        <div className="menu-title">Change role</div>
        {ROLES.map((r) => {
          const RIcon = r.icon;
          const active = r.value === value;
          return (
            <button
              key={r.value}
              className={`role-option ${active ? "active" : ""}`}
              onClick={() => !active && onChange(r.value)}
              role="menuitemradio"
              aria-checked={active}
            >
              <span className={`role-option-icon role-${r.value}`}>
                <RIcon size={16} />
              </span>
              <span className="role-option-text">
                <b>{r.label}</b>
                <span>{r.hint}</span>
              </span>
              <span className="role-radio">{active && <Check size={11} strokeWidth={3.5} />}</span>
            </button>
          );
        })}
        <div className="role-note">
          <Info size={13} /> Changing role signs the user out
        </div>
      </div>
    </Dropdown>
  );
}
