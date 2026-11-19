const PALETTE = ["#4f6bff", "#7c4dff", "#e5487d", "#f97316", "#10b981", "#0ea5e9", "#a855f7", "#14b8a6", "#ef4444", "#eab308"];

export const colorFor = (seed = "") => {
  let h = 0;
  for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
};

export const initials = (nameOrEmail = "") => {
  const clean = String(nameOrEmail).replace(/<.*>/, "").trim();
  if (!clean) return "?";
  const base = clean.includes("@") && !clean.includes(" ") ? clean.split("@")[0] : clean;
  const parts = base.split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts.length > 1 ? parts[parts.length - 1][0] : parts[0]?.[1] || "")).toUpperCase() || "?";
};

export const displayAddress = (a) => (a ? a.name || a.address : "Unknown sender");

export const formatListDate = (value) => {
  if (!value) return "";
  const d = new Date(value);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString([], { month: "short", day: "numeric" });
  return d.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
};

export const formatFullDate = (value) =>
  value
    ? new Date(value).toLocaleString([], { weekday: "short", year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "—";

export const timeAgo = (value) => {
  if (!value) return "never";
  const s = Math.round((Date.now() - new Date(value).getTime()) / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} d ago`;
  return formatListDate(value);
};

export const formatBytes = (bytes = 0) => {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
};

export const formatDuration = (ms) => {
  if (ms <= 0) return "0m";
  const total = Math.floor(ms / 60000);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
};

export const passwordChecks = (pw = "") => [
  { label: "8+ characters", hint: "At least 8 characters", ok: pw.length >= 8 },
  { label: "A–Z & a–z", hint: "Upper and lower case letters", ok: /[a-z]/.test(pw) && /[A-Z]/.test(pw) },
  { label: "Number", hint: "At least one number (0-9)", ok: /\d/.test(pw) },
  { label: "Symbol", hint: "At least one symbol (!@#$…)", ok: /[^A-Za-z0-9]/.test(pw) },
];

export const copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};
