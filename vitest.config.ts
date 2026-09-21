import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    exclude: ["node_modules/**", "e2e/**"],
    // lib/supabase.ts calls createClient at import time and throws without a
    // URL. Placeholders make the suite independent of a developer's .env.local,
    // which CI does not have. Nothing is ever sent to this host in tests.
    env: {
      VITE_SUPABASE_URL: "https://placeholder.supabase.test",
      VITE_SUPABASE_ANON_KEY: "placeholder-anon-key",
    },
  },
});
