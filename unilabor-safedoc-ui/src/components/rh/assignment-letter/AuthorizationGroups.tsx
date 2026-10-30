import { useMemo } from 'react';
import type { AssignmentAuthorizationItem } from '../../../types/models';
import { AuthorizationToggle } from './AuthorizationToggle';

interface AuthorizationGroupsProps {
  items: AssignmentAuthorizationItem[];
  isChecked: (itemId: number) => boolean;
  onToggle: (itemId: number) => void;
  /** Activa (true) o desactiva (false) todas las autorizaciones de una seccion. */
  onToggleGroup: (itemIds: number[], value: boolean) => void;
  disabled?: boolean;
}

/** Las autorizaciones del REH-REG-008 agrupadas por seccion tematica, con activar / desactivar por seccion. */
export const AuthorizationGroups = ({ items, isChecked, onToggle, onToggleGroup, disabled = false }: AuthorizationGroupsProps) => {
  const groups = useMemo(() => {
    const map = new Map<string, { order: number; label: string; items: AssignmentAuthorizationItem[] }>();
    for (const item of items) {
      const label = item.group_label ?? 'Otras';
      const entry = map.get(label) ?? { order: item.group_order ?? 999, label, items: [] };
      entry.items.push(item);
      map.set(label, entry);
    }
    return [...map.values()].sort((a, b) => a.order - b.order);
  }, [items]);

  return (
    <div className="space-y-3">
      {groups.map((group) => {
        const ids = group.items.map((item) => item.id);
        const active = ids.filter((id) => isChecked(id)).length;
        const allOn = active === ids.length;
        return (
          <section key={group.label} className="overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.1)]">
            <header className="flex flex-wrap items-center justify-between gap-2 bg-[rgba(238,245,250,0.9)] px-3 py-2">
              <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-brand-700)]">
                {group.label}
                <span className="ml-2 font-semibold normal-case tracking-normal text-[var(--unilabor-neutral)]">
                  {active}/{ids.length} · {group.items[0]?.item_no}–{group.items[group.items.length - 1]?.item_no}
                </span>
              </p>
              {!disabled ? (
                <button type="button" onClick={() => onToggleGroup(ids, !allOn)} className="text-[11px] font-semibold text-[var(--color-brand-500)] hover:underline">
                  {allOn ? 'Desactivar sección' : 'Activar sección'}
                </button>
              ) : null}
            </header>
            <div className="grid gap-1 p-2 sm:grid-cols-2">
              {group.items.map((item) => (
                <AuthorizationToggle key={item.id} item={item} checked={isChecked(item.id)} disabled={disabled} onToggle={() => onToggle(item.id)} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
};
