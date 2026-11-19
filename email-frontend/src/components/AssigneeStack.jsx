import { Lock } from "lucide-react";
import { Avatar } from "./ui";

// "Who can see it": overlapping avatars + a short label, full list on hover
export default function AssigneeStack({ users, max = 4 }) {
  if (!users.length) {
    return (
      <span className="badge warning">
        <Lock size={11} /> Nobody yet
      </span>
    );
  }
  const shown = users.slice(0, max);
  const extra = users.length - shown.length;
  const first = users[0].name;
  const label =
    users.length === 1 ? first : users.length === 2 ? `${first} & ${users[1].name}` : `${first} +${users.length - 1}`;

  return (
    <div className="assignees" title={users.map((u) => `${u.name} (${u.role})`).join("\n")}>
      <div className="avatar-stack">
        {shown.map((u) => (
          <span key={u._id} className={`stack-item role-ring-${u.role}`}>
            <Avatar name={u.name} email={u.email} size={26} />
          </span>
        ))}
        {extra > 0 && <span className="stack-more">+{extra}</span>}
      </div>
      <span className="assignees-label truncate">{label}</span>
    </div>
  );
}
