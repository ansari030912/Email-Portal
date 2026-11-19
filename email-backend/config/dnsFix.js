// Same fix as DEFA index.js: some Windows / ISP resolvers refuse the SRV lookup
// that mongodb+srv:// needs (querySrv ECONNREFUSED). Use public resolvers + IPv4 first.
const dns = require("dns");

dns.setDefaultResultOrder("ipv4first");
if (process.env.DISABLE_DNS_OVERRIDE !== "true") {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
}
