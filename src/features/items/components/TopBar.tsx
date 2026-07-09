import type { Ref } from 'react';
import { signOut } from '@/app/login/actions';
import { Avatar } from '@/components/ui/Avatar';
import { BrandMark } from '@/components/ui/BrandMark';
import { Button } from '@/components/ui/Button';
import { Dot } from '@/components/ui/Dot';
import { SearchField } from './SearchField';

interface TopBarProps {
  query: string;
  onQueryChange: (value: string) => void;
  searchRef: Ref<HTMLInputElement>;
}

export function TopBar({ query, onQueryChange, searchRef }: TopBarProps) {
  return (
    <header className="sticky top-0 z-40 flex h-[58px] items-center gap-4 border-b border-border bg-surface px-4 sm:px-6">
      <BrandMark />
      <div className="mx-auto w-full max-w-[420px]">
        <SearchField ref={searchRef} value={query} onChange={onQueryChange} />
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="hidden items-center gap-1.5 rounded-pill border border-success-border bg-stream-opportunity-tint px-2.5 py-1 text-[12px] font-semibold text-success sm:inline-flex">
          <Dot size={7} className="bg-success" isPulsing />
          Live
        </span>
        <Avatar
          content="FS"
          bgClassName="bg-ink"
          fgClassName="text-white"
          size={32}
          radiusClassName="rounded-full"
        />
        {/* signOut is a Server Action; a plain form works from this client tree. */}
        <form action={signOut}>
          <Button type="submit" variant="ghost">
            Déconnexion
          </Button>
        </form>
      </div>
    </header>
  );
}
