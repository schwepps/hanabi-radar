import { afterEach, describe, expect, it, vi } from 'vitest';

import { env } from './env';

const KEY = 'NEXT_PUBLIC_SUPABASE_URL';
const original = process.env[KEY];

afterEach(() => {
  vi.unstubAllGlobals();
  if (original === undefined) {
    delete process.env[KEY];
  } else {
    process.env[KEY] = original;
  }
});

describe('env', () => {
  it('returns the value when the variable is set', () => {
    process.env[KEY] = 'http://127.0.0.1:54321';
    expect(env.supabaseUrl).toBe('http://127.0.0.1:54321');
  });

  it('throws a helpful error when a required variable is missing', () => {
    delete process.env[KEY];
    expect(() => env.supabaseUrl).toThrow(
      /Missing required environment variable/,
    );
  });

  it('rejects whitespace-only values', () => {
    process.env[KEY] = '   ';
    expect(() => env.supabaseUrl).toThrow(
      /Missing required environment variable/,
    );
  });

  it('refuses to read a server-only secret in the browser', () => {
    vi.stubGlobal('window', {});
    expect(() => env.supabaseServiceRoleKey).toThrow(/server-only/);
  });
});
