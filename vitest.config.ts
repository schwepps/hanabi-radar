import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Mirror the tsconfig `@/* -> ./src/*` path alias so tests can import modules that
// resolve `@/…` at runtime (e.g. the ingestion schema's `Constants` value import).
// The string `@` alias only matches `@` or `@/…`, leaving scoped packages like
// `@supabase/*` untouched. Environment stays Vitest's Node default.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // `server-only` throws when imported outside a React Server Component build,
      // which would break importing server-only modules (data.ts, worker.ts) under
      // Vitest. Alias it to its own client-safe empty module; the Next build-time
      // guard is unaffected.
      'server-only': fileURLToPath(
        new URL('./node_modules/server-only/empty.js', import.meta.url),
      ),
    },
  },
});
