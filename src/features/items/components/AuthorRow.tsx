import { Avatar } from '@/components/ui/Avatar';
import {
  AUTHOR_AVATAR,
  AUTHOR_KIND_LABEL,
  initials,
} from '../lib/presentation';
import type { ListItem } from '../types';

/** Author avatar + name (with type suffix) + meta line + date. */
export function AuthorRow({ item }: { item: ListItem }) {
  const avatar = AUTHOR_AVATAR[item.authorKind];
  const content = avatar.glyph ?? initials(item.authorName);
  // Aggregates show their count in the meta line, not a type suffix.
  const suffix =
    item.authorKind === 'aggregate' ? null : AUTHOR_KIND_LABEL[item.authorKind];

  return (
    <div className="flex items-center gap-2.5">
      <Avatar
        content={content}
        bgClassName={avatar.bg}
        fgClassName={avatar.fg}
        size={30}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-body-sm font-semibold text-ink">
          {item.authorName}
          {suffix != null && (
            <span className="font-normal text-text-faint"> · {suffix}</span>
          )}
        </p>
        {item.authorMeta != null && (
          <p className="truncate text-[12px] text-text-mid">
            {item.authorMeta}
          </p>
        )}
      </div>
      <span className="shrink-0 font-mono text-[11px] text-text-faint">
        {item.dateLabel}
      </span>
    </div>
  );
}
