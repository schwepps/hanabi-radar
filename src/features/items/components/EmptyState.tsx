import { Button } from '@/components/ui/Button';

export function EmptyState({ onReset }: { onReset: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-[16px] border border-dashed border-border-strong bg-surface-muted px-6 py-[72px] text-center">
      <span
        aria-hidden
        className="mb-4 flex size-[46px] items-center justify-center rounded-xl bg-surface-sunken text-[20px] text-text-mid"
      >
        ◎
      </span>
      <h2 className="text-[16px] font-bold text-ink">
        Aucun résultat pour ces filtres
      </h2>
      <p className="mt-2 max-w-[340px] text-body-sm text-text-mid">
        Aucun élément ne correspond à cette combinaison de filtres. Élargissez
        la recherche ou réinitialisez.
      </p>
      <Button className="mt-5" onClick={onReset}>
        Réinitialiser les filtres
      </Button>
    </div>
  );
}
