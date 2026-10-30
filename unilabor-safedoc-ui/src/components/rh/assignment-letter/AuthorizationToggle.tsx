import type { AssignmentAuthorizationItem } from '../../../types/models';

interface AuthorizationToggleProps {
  item: AssignmentAuthorizationItem;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}

/** Una autorización del REH-REG-008 con interruptor Sí/No (las generales llevan la nota "a todos"). */
export const AuthorizationToggle = ({ item, checked, disabled = false, onToggle }: AuthorizationToggleProps) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={onToggle}
    className={`flex w-full items-start gap-2.5 rounded-lg border px-2.5 py-1.5 text-left text-xs transition ${
      checked ? 'border-[var(--color-brand-300)] bg-[rgba(191,212,230,0.25)]' : 'border-[rgba(0,65,106,0.08)] bg-white'
    } ${disabled ? 'cursor-default' : 'hover:border-[var(--color-brand-300)]'}`}
  >
    <span className={`mt-0.5 inline-flex h-4 w-7 shrink-0 items-center rounded-full p-0.5 transition ${checked ? 'bg-emerald-500' : 'bg-slate-300'} ${disabled ? 'opacity-60' : ''}`}>
      <span className={`h-3 w-3 rounded-full bg-white shadow transition ${checked ? 'translate-x-3' : ''}`} />
    </span>
    <span className="text-[var(--unilabor-ink)]">
      <span className="font-bold text-[var(--color-brand-500)]">{item.item_no}.</span> {item.item_text}
      {item.applies_to_all ? (
        <span className="ml-1.5 inline-block rounded-full border border-orange-300/60 bg-orange-400/15 px-1.5 py-px align-middle text-[9px] font-semibold uppercase tracking-wide text-orange-700">
          a todos
        </span>
      ) : null}
      {item.scope_label ? (
        <span className="ml-1.5 inline-block rounded-full border border-sky-300/60 bg-sky-400/15 px-1.5 py-px align-middle text-[9px] font-semibold uppercase tracking-wide text-sky-700">
          {item.scope_label}
        </span>
      ) : null}
    </span>
  </button>
);
