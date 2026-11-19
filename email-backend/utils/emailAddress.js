// Turns every address format nodemailer accepts into [{ name, address }]:
//   "a@b.com"
//   "a@b.com, c@d.com"
//   "John Doe <a@b.com>"
//   '"Doe, John" <a@b.com>'
//   { name: "John", address: "a@b.com" }
//   [ any mix of the above ]
const EMAIL_RULE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]+$/;

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();
const isValidEmail = (email) => EMAIL_RULE.test(normalizeEmail(email));

// Split on commas / semicolons that are not inside quotes or <>.
const splitAddressString = (value) => {
  const parts = [];
  let current = "";
  let inQuotes = false;
  let inAngle = false;
  for (const ch of value) {
    if (ch === '"') inQuotes = !inQuotes;
    if (!inQuotes && ch === "<") inAngle = true;
    if (!inQuotes && ch === ">") inAngle = false;
    if ((ch === "," || ch === ";") && !inQuotes && !inAngle) {
      if (current.trim()) parts.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
};

const parseSingle = (raw) => {
  const value = String(raw).trim();
  const angle = value.match(/^(.*)<\s*([^>]+)\s*>\s*$/);
  if (angle) {
    const name = angle[1].trim().replace(/^"(.*)"$/, "$1").trim();
    return { name: name || null, address: normalizeEmail(angle[2]) };
  }
  return { name: null, address: normalizeEmail(value.replace(/^mailto:/i, "")) };
};

const parseAddressList = (input) => {
  if (input === undefined || input === null || input === "") return [];
  const items = Array.isArray(input) ? input : [input];
  const result = [];
  for (const item of items) {
    if (!item) continue;
    if (typeof item === "object") {
      if (item.address) {
        result.push({
          name: item.name ? String(item.name).trim() : null,
          address: normalizeEmail(item.address),
        });
      }
      continue;
    }
    for (const piece of splitAddressString(String(item))) result.push(parseSingle(piece));
  }
  // keep valid, unique addresses (first occurrence wins)
  const seen = new Set();
  return result.filter((entry) => {
    if (!isValidEmail(entry.address) || seen.has(entry.address)) return false;
    seen.add(entry.address);
    return true;
  });
};

const parseSingleAddress = (input) => parseAddressList(input)[0] || null;

module.exports = { parseAddressList, parseSingleAddress, normalizeEmail, isValidEmail };
