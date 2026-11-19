import { Check, ChevronDown } from "lucide-react";
import { Dropdown } from "./ui";
import { colorFor } from "../utils/format";

/**
 * Styled replacement for <select> (the browser's own option list can't be styled).
 * options: [{ value, label, dot?: true }]  - dot = coloured dot from the value
 */
export default function SelectMenu({ value, onChange, options, width = 220, icon: Icon, placeholder = "Select" }) {
  const current = options.find((o) => o.value === value);
  return (
    <Dropdown
      align="left"
      width={Math.max(width, 200)}
      trigger={
        <button type="button" className="select-trigger" style={{ width }}>
          {Icon && <Icon size={15} className="faint" />}
          {current?.dot && <span className="mailbox-dot" style={{ background: colorFor(current.value), margin: 0 }} />}
          <span className="truncate" style={{ flex: 1, textAlign: "left" }}>{current?.label || placeholder}</span>
          <ChevronDown size={15} className="select-chevron" />
        </button>
      }
    >
      <div className="select-options">
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button key={o.value || "__all"} className={`menu-item select-option ${active ? "active" : ""}`} onClick={() => onChange(o.value)}>
              {o.dot ? <span className="mailbox-dot" style={{ background: colorFor(o.value), margin: 0 }} /> : <span style={{ width: 9 }} />}
              <span className="truncate" style={{ flex: 1 }}>{o.label}</span>
              {active && <Check size={15} color="var(--primary)" />}
            </button>
          );
        })}
      </div>
    </Dropdown>
  );
}
