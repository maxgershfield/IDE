import { defineConfig, loadEnv } from "vite";

/**
 * Dev-only proxy: browser calls /api/...; Vite forwards to ONODE so the page
 * origin stays localhost and CORS is not an issue. Set OASIS_API_URL in .env
 * (example in .env.example). Production apps should use a real backend, not
 * a public JWT in the browser.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = env.OASIS_API_URL || "http://127.0.0.1:5003";

  return {
    server: {
      port: 5174,
      proxy: {
        "/api": {
          target,
          changeOrigin: true
        }
      }
    }
  };
});
