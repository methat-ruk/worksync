import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  define: {
    "process.env.NEXT_PUBLIC_API_BASE_URL": JSON.stringify(
      "http://localhost:4000"
    ),
    "process.env.NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED": JSON.stringify("false")
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    clearMocks: true,
    exclude: ["test/e2e/**", "node_modules/**"]
  }
});
