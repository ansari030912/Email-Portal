const cleanIp = (ip) => {
  if (!ip) return null;
  let value = String(ip).trim();
  if (value.startsWith("::ffff:")) value = value.slice(7);
  return value || null;
};

// app.set("trust proxy", 1) makes req.ip the real client behind the load balancer.
const getClientIp = (req) => {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return cleanIp(String(forwarded).split(",")[0]);
  return cleanIp(req.ip || req.socket?.remoteAddress);
};

const getRequestMeta = (req) => ({
  ip: getClientIp(req),
  userAgent: (req.headers["user-agent"] || "").slice(0, 500),
});

module.exports = { getClientIp, getRequestMeta, cleanIp };
