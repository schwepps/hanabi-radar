import { ItemListContainer } from '@/features/items/components/ItemListContainer';
import { fetchListItems } from '@/features/items/data';

// Read env + Supabase at request time, not build time (CI builds without a DB).
export const dynamic = 'force-dynamic';

// NOTE (FSC-90): this route is not auth-gated yet. It serves the shared,
// non-sensitive items feed (never item_sources); partner authentication + RLS
// land with the auth ticket. Keep it off a public URL with real data until then.

export default async function HomePage() {
  const items = await fetchListItems();

  const accounts = Array.from(
    new Set(
      items
        .map((item) => item.account)
        .filter((account): account is string => account != null),
    ),
  ).sort((a, b) => a.localeCompare(b, 'fr'));

  return <ItemListContainer initialItems={items} accounts={accounts} />;
}
