import type { ReactNode } from 'react';

interface SignatoryToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  hint?: string;
  disabled?: boolean;
}

/** Interruptor con etiqueta para las opciones de "Firmantes por área". */
export const SignatoryToggle = ({ checked, onChange, label, hint, disabled = false }: SignatoryToggleProps) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className="flex items-start gap-2.5 text-left text-xs text-[var(--unilabor-ink)] disabled:cursor-not-allowed disabled:opacity-60"
  >
    <span className={`mt-0.5 inline-flex h-4 w-7 shrink-0 items-center rounded-full p-0.5 transition ${checked ? 'bg-emerald-500' : 'bg-slate-300'}`}>
      <span className={`h-3 w-3 rounded-full bg-white shadow transition ${checked ? 'translate-x-3' : ''}`} />
    </span>
    <span className="min-w-0">
      <span className="font-semibold">{label}</span>
      {hint ? <span className="block text-[11px] text-[var(--unilabor-neutral)]">{hint}</span> : null}
    </span>
  </button>
);
