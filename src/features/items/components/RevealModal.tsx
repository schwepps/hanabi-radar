'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DEGREE_LABEL, hopLabel, initials } from '../lib/presentation';
import type { Degree, ListItem } from '../types';
import { ConnectionGlyph } from './ConnectionGlyph';

const FOCUSABLE =
  'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

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

function HolderNode() {
  // Holder identity is deliberately NOT resolved here — the permissioned reveal
  // (item_sources.social_proof) lands with FSC-106. This is a labelled placeholder.
  return (
    <div className="flex items-center gap-3">
      <Avatar
        content="?"
        bgClassName="bg-brand-tint"
        fgClassName="text-stream-signal"
        size={40}
      />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-bold text-ink">Membre du collectif</p>
        <p className="text-[12px] text-text-mid">
          Identité révélée à l’acceptation (FSC-106)
        </p>
      </div>
      <Badge className="border border-success-border bg-stream-opportunity-tint text-success">
        Détient le chemin
      </Badge>
    </div>
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
 * Permissioned warm-intro reveal. Shows the non-identifying path chain (degree
 * from `best_author_degree`) and the privacy note. It never renders holder
 * identity, and "Demander une introduction" is disabled until FSC-106.
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
  const degree: Degree = item.path;

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
        onMouseDown={(event) => event.stopPropagation()}
        className="w-full max-w-[480px] overflow-hidden rounded-modal border border-border bg-surface shadow-overlay"
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
            className="text-[20px] leading-none text-text-low hover:text-ink"
          >
            ×
          </button>
        </div>

        <div className="px-[22px] py-[22px]">
          <Badge className="bg-spark-bg tracking-[0.06em] text-spark-text uppercase">
            Réservé aux partenaires · Chemin {DEGREE_LABEL[degree]}
          </Badge>

          <div className="mt-4">
            <HolderNode />
            <div className="my-1 ml-[19px] border-l-2 border-dashed border-spark py-1 pl-6">
              <span className="font-mono text-[11px] text-spark-glyph">
                {hopLabel(degree)}
              </span>
            </div>
            <AuthorNode name={item.authorName} />
          </div>

          <p
            id="reveal-note"
            className="mt-4 border-t border-border-faint pt-3 text-[12px] text-text-low"
          >
            Le détenteur du chemin voit cette demande en premier. L’identité de
            la relation reste privée jusqu’à l’acceptation de l’introduction —
            le badge sur la carte n’a jamais révélé qui détenait le chemin.
          </p>
        </div>

        <div className="border-t border-border-faint bg-surface-muted px-[22px] py-4">
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Fermer
            </Button>
            <Button className="flex-1" disabled>
              Demander une introduction
            </Button>
          </div>
          <p className="mt-2 text-center font-mono text-[10px] text-text-low">
            Le flux d’introduction arrive avec FSC-106.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
