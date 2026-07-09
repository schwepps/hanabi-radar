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
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error != null) {
    // Never surface the raw auth error; a generic flag avoids account enumeration.
    redirect('/login?error=1');
  }

  revalidatePath('/', 'layout');
  redirect('/');
}

/** Sign out and return to the login screen (demo affordance). */
export async function signOut() {
  const supabase = await createServerSupabaseAuthClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/login');
}
