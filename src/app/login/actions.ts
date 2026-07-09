'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createServerSupabaseAuthClient } from '@/lib/supabase/server-auth';

/**
 * Sign a partner in with email + password. Runs as a Server Action (which — unlike
 * a Server Component — may write cookies), so the Supabase client persists the
 * session cookies before we redirect. RLS then gates what the dashboard returns;
 * a valid but non-partner login lands on `/` and simply sees an empty feed.
 */
export async function login(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  const supabase = await createServerSupabaseAuthClient();

  // Bad credentials come back as { error }; network/unexpected failures throw.
  // Treat both the same and never surface the raw error (avoids enumeration).
  // Keep redirect() OUT of the try — it works by throwing NEXT_REDIRECT.
  let failed: boolean;
  try {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    failed = error != null;
  } catch {
    failed = true;
  }

  if (failed) {
    redirect('/login?error=1');
  }

  revalidatePath('/', 'layout');
  redirect('/');
}

/** Sign out and return to the login screen. */
export async function signOut() {
  const supabase = await createServerSupabaseAuthClient();
  const { error } = await supabase.auth.signOut();
  if (error != null) {
    // Don't swallow silently; the redirect still clears the client-side session.
    console.error('[auth] signOut failed:', error.message);
  }
  revalidatePath('/', 'layout');
  redirect('/login');
}
