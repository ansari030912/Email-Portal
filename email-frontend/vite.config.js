import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// Dev: the frontend calls /api/* and Vite forwards it to the backend, so the
// session cookie is first-party. Prod: set VITE_API_URL or reverse-proxy /api.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        "/api": {
          target: env.VITE_DEV_BACKEND || "http://localhost:5050",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
      },
    },
    build: { outDir: "dist", sourcemap: false },
  };
});
