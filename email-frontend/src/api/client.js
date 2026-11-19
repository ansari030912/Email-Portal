export const API_BASE = (import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.code = data?.code;
    this.data = data || {};
  }
  get isTwoFactorError() {
    return typeof this.code === "string" && this.code.startsWith("TWO_FACTOR");
  }
}

// These mean the session is gone - the app logs out and shows the reason.
const SESSION_END_CODES = new Set(["NOT_AUTHENTICATED", "SESSION_EXPIRED", "SESSION_REPLACED", "SESSION_REVOKED", "INVALID_SESSION", "ACCOUNT_BLOCKED"]);

export const request = async (method, path, body, { silentAuth = false } = {}) => {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      credentials: "include",
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        "X-Requested-With": "EmailPortal", // required by the backend CSRF guard
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("Can't reach the server. Check your connection.", 0, { code: "NETWORK" });
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok || data?.success === false) {
    const err = new ApiError(data?.message || `Request failed (${response.status})`, response.status, data);
    if (!silentAuth && SESSION_END_CODES.has(err.code)) {
      window.dispatchEvent(new CustomEvent("portal:session-ended", { detail: { code: err.code, message: err.message } }));
    }
    throw err;
  }
  return data;
};

export const qs = (params) => {
  const search = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") search.set(k, v);
  });
  const text = search.toString();
  return text ? `?${text}` : "";
};
