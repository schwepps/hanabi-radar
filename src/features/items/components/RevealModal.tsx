'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { revealWarmPath } from '../actions';
import {
  DEGREE_LABEL,
  formatSeenAt,
  initials,
  revealPathLabel,
} from '../lib/presentation';
import type { ListItem, RevealPath } from '../types';
import { ConnectionGlyph } from './ConnectionGlyph';

const FOCUSABLE =
  'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

const LOAD_ERROR = 'Le chemin n’a pas pu être chargé.';

function trapFocus(event: KeyboardEvent, container: HTMLElement | null) {
  if (container == null) {
    return;
  }
  const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE));
  if (items.length === 0) {
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

/** Local view state — the sensitive reveal payload lives ONLY here (modal-scoped),
 *  never in the reducer / feed / realtime caches (types.ts privacy invariant). */
type RevealView =
  | { status: 'loading' }
  | { status: 'ready'; paths: RevealPath[] }
  | { status: 'error'; message: string };

function liveMessage(view: RevealView): string {
  switch (view.status) {
    case 'loading':
      return 'Résolution du chemin d’introduction…';
    case 'error':
      return view.message;
    default:
      return view.paths.length === 0
        ? 'Aucun chemin d’introduction disponible.'
        : `${view.paths.length} chemin${view.paths.length > 1 ? 's' : ''} d’introduction trouvé${view.paths.length > 1 ? 's' : ''}.`;
  }
}

/** One revealed member/contact. `degree: 'none'` = a social-proof alternative path. */
function HolderRow({ path, isTop }: { path: RevealPath; isTop: boolean }) {
  const isSocial = path.degree === 'none';
  return (
    <li className="flex items-center gap-3 rounded-card border border-border-faint bg-surface-muted px-3 py-2.5">
      <Avatar
        content={path.holderInitials}
        bgClassName={isSocial ? 'bg-surface-sunken' : 'bg-brand-tint'}
        fgClassName={isSocial ? 'text-text-mid' : 'text-stream-signal'}
        size={40}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-bold text-ink">
          {path.holderName}
        </p>
        <p className="truncate text-[12px] text-text-mid">
          {revealPathLabel(path.degree)}
        </p>
        {path.socialProof != null && (
          <p className="mt-0.5 text-[11px] text-text-low">{path.socialProof}</p>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {isTop ? (
          <Badge className="border border-success-border bg-stream-opportunity-tint text-success">
            Chemin le plus court
          </Badge>
        ) : (
          !isSocial && (
            <Badge className="bg-surface-sunken text-text-mid">
              {DEGREE_LABEL[path.degree]}
            </Badge>
          )
        )}
        <span className="font-mono text-[10px] text-text-low">
          {formatSeenAt(path.seenAt)}
        </span>
      </div>
    </li>
  );
}

function AuthorNode({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar
        content={initials(name)}
        bgClassName="bg-surface-sunken"
        fgClassName="text-text-mid"
        size={40}
      />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-bold text-ink">{name}</p>
        <p className="text-[12px] text-text-mid">Auteur de la publication</p>
      </div>
    </div>
  );
}

/**
 * Permissioned warm-intro reveal. On open it fetches the sensitive holder
 * list on demand via the `revealWarmPath` Server Action (permission-checked
 * `reveal_item_sources` RPC), shows the members who can introduce — strongest-first,
 * with a social-proof alternative when no member is 1st-degree — and never lets that
 * payload leave the modal. The header degree badge stays non-identifying (`item.path`,
 * the aggregate known before the fetch resolves).
 */
export function RevealModal({
  item,
  onClose,
}: {
  item: ListItem;
  onClose: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const mountedRef = useRef(true);
  const [view, setView] = useState<RevealView>({ status: 'loading' });

  // Fetch the sensitive payload on demand. The modal remounts per item
  // (key={item.id} at the call site), so item.id is stable for this instance —
  // no A→B race; the mounted guard drops a late resolve after close. Kept free of a
  // synchronous setState so the mount effect never re-renders during commit (initial
  // state is already 'loading'); the retry handler resets to 'loading' on click.
  const fetchPaths = useCallback(() => {
    revealWarmPath(item.id)
      .then((res) => {
        if (!mountedRef.current) return;
        setView(
          res.ok
            ? { status: 'ready', paths: res.paths }
            : { status: 'error', message: res.error },
        );
      })
      .catch(() => {
        if (mountedRef.current) {
          setView({ status: 'error', message: LOAD_ERROR });
        }
      });
  }, [item.id]);

  useEffect(() => {
    mountedRef.current = true;
    fetchPaths();
    return () => {
      mountedRef.current = false;
    };
  }, [fetchPaths]);

  const retry = useCallback(() => {
    setView({ status: 'loading' });
    fetchPaths();
  }, [fetchPaths]);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      } else if (event.key === 'Tab') {
        trapFocus(event, cardRef.current);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      onMouseDown={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay-scrim p-6 motion-safe:animate-[hb-drop_0.2s_ease-out]"
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reveal-title"
        aria-describedby="reveal-note"
        aria-busy={view.status === 'loading'}
        onMouseDown={(event) => event.stopPropagation()}
        className="flex max-h-[86svh] w-full max-w-[480px] flex-col overflow-hidden rounded-modal border border-border bg-surface shadow-overlay"
      >
        <div className="flex items-center gap-2 border-b border-border-faint px-[22px] py-[18px]">
          <ConnectionGlyph className="text-spark-glyph" />
          <h2
            id="reveal-title"
            className="flex-1 text-[15px] font-bold text-ink"
          >
            Chemin d’introduction chaud
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="-mr-2 inline-flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center text-[20px] leading-none text-text-low hover:text-ink"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-[22px] py-[22px]">
          <Badge className="bg-spark-bg tracking-[0.06em] text-spark-text uppercase">
            Réservé aux partenaires · Chemin {DEGREE_LABEL[item.path]}
          </Badge>

          <p className="sr-only" role="status" aria-live="polite">
            {liveMessage(view)}
          </p>

          <div className="mt-4">
            {view.status === 'loading' && (
              <p className="py-6 text-center text-[13px] text-text-mid motion-safe:animate-pulse">
                Résolution du chemin d’introduction…
              </p>
            )}

            {view.status === 'error' && (
              <div className="py-5 text-center">
                <p className="text-[13px] text-text-mid">{view.message}</p>
                <div className="mt-3 flex justify-center">
                  <Button variant="secondary" onClick={retry}>
                    Réessayer
                  </Button>
                </div>
              </div>
            )}

            {view.status === 'ready' && view.paths.length === 0 && (
              <p className="py-6 text-center text-[13px] text-text-mid">
                Aucun chemin d’introduction disponible pour cette publication.
              </p>
            )}

            {view.status === 'ready' && view.paths.length > 0 && (
              <>
                <ul className="flex flex-col gap-2">
                  {view.paths.map((path, index) => (
                    <HolderRow
                      key={`${path.holderName}-${path.degree}-${index}`}
                      path={path}
                      isTop={index === 0 && view.paths.length > 1}
                    />
                  ))}
                </ul>
                <div className="my-2 ml-[19px] border-l-2 border-dashed border-spark py-1 pl-6">
                  <span className="font-mono text-[11px] text-spark-glyph">
                    vers l’auteur
                  </span>
                </div>
                <AuthorNode name={item.authorName} />
              </>
            )}
          </div>

          <p
            id="reveal-note"
            className="mt-4 border-t border-border-faint pt-3 text-[12px] text-text-low"
          >
            Ces identités ne sont visibles que par les partenaires, à la
            demande. Elles n’apparaissent jamais sur les cartes du flux — le
            badge n’a jamais révélé qui détenait le chemin.
          </p>
        </div>

        <div className="border-t border-border-faint bg-surface-muted px-[22px] py-4">
          <Button variant="secondary" className="w-full" onClick={onClose}>
            Fermer
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
