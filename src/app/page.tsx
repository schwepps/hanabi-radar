import { redirect } from 'next/navigation';
import { ItemListContainer } from '@/features/items/components/ItemListContainer';
import { fetchListItems } from '@/features/items/data';
import { createServerSupabaseAuthClient } from '@/lib/supabase/server-auth';

// Read env + Supabase at request time, not build time (CI builds without a DB).
export const dynamic = 'force-dynamic';

// Partners-only (FSC-93): the RLS-enforced cookie client gates the feed at the DB
// (a non-partner sees zero rows); the getUser() guard adds the redirect-to-login
// UX on top, and the proxy blocks unauthenticated requests before we even render.
export default async function HomePage() {
  const supabase = await createServerSupabaseAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user == null) {
    redirect('/login');
  }

  const items = await fetchListItems(supabase);

  // Accounts for the filter rail are derived client-side from the live feed
  // (ItemListContainer) so realtime arrivals from new accounts stay filterable.
  return <ItemListContainer initialItems={items} />;
}
