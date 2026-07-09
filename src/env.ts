/**
 * Single source of truth for environment configuration.
 *
 * Values are read from environment variables (see `.env.example`). Local dev
 * points at the local Supabase stack via `.env.development`; deployed
 * environments (Vercel EU) inject the hosted config.
 *
 * Validation is lazy (per-getter) so a build without secrets — e.g. CI — never
 * fails: a variable is only required when it is actually read at runtime.
 */

function requireEnv(name: string, value: string | undefined): string {
  if (value == null || value.trim() === '') {
    throw new Error(
      `Missing required environment variable: ${name}. See .env.example.`,
    );
  }
  return value.trim();
}

function assertServerOnly(name: string): void {
  if (typeof window !== 'undefined') {
    throw new Error(
      `${name} is server-only and must not be read in the browser.`,
    );
  }
}

export const env = {
  /** Supabase project URL (browser-safe). */
  get supabaseUrl(): string {
    return requireEnv(
      'NEXT_PUBLIC_SUPABASE_URL',
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    );
  },
  /** Supabase anonymous key (browser-safe). */
  get supabaseAnonKey(): string {
    return requireEnv(
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );
  },
  /** Supabase service-role key — server-only, bypasses RLS. Never send to the client. */
  get supabaseServiceRoleKey(): string {
    assertServerOnly('SUPABASE_SERVICE_ROLE_KEY');
    return requireEnv(
      'SUPABASE_SERVICE_ROLE_KEY',
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );
  },
  /** Anthropic (Claude) API key — server-only. */
  get anthropicApiKey(): string {
    assertServerOnly('ANTHROPIC_API_KEY');
    return requireEnv('ANTHROPIC_API_KEY', process.env.ANTHROPIC_API_KEY);
  },
  /**
   * Shared secret authorizing the classification worker (`GET/POST /api/classify`) —
   * server-only. The cron scheduler sends it as `Authorization: Bearer <secret>`;
   * on Vercel Cron set this to the same value as `CRON_SECRET`. Use a high-entropy
   * value (e.g. `openssl rand -hex 32`).
   */
  get classifyTriggerSecret(): string {
    assertServerOnly('CLASSIFY_TRIGGER_SECRET');
    return requireEnv(
      'CLASSIFY_TRIGGER_SECRET',
      process.env.CLASSIFY_TRIGGER_SECRET,
    );
  },
};
