import type { ExpedientTab } from '../../utils/expedientTabs';


interface ExpedientTabsProps {
  tabs: ExpedientTab[];
  active: string;
  onChange: (key: string) => void;
  /** Etiqueta accesible de la barra (por defecto, la del expediente). */
  ariaLabel?: string;
}

/** Barra de pestañas fija (expediente, fases de inducción): una por bloque/sección para acortar el scroll. */
export const ExpedientTabs = ({ tabs, active, onChange, ariaLabel = 'Secciones del expediente' }: ExpedientTabsProps) => (
  <div
    className="sticky top-0 z-20 -mx-1 rounded-2xl bg-[rgba(238,245,250,0.94)] px-1 py-1.5 backdrop-blur"
    role="tablist"
    aria-label={ariaLabel}
  >
    <div className="flex flex-wrap gap-1.5">
      {tabs.map((tab) => {
        const selected = tab.key === active;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.key)}
            className={`relative inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold transition ${
              selected
                ? 'border-[var(--color-brand-700)] bg-[var(--color-brand-700)] text-white shadow-md'
                : 'border-[rgba(0,65,106,0.12)] bg-white text-[var(--color-brand-700)] hover:bg-[rgba(191,212,230,0.3)]'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
            {tab.badge ? (
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums ${
                  selected ? 'bg-white/20 text-white' : tab.complete ? 'bg-emerald-50 text-emerald-700' : 'bg-[rgba(0,65,106,0.06)] text-[var(--color-brand-700)]'
                }`}
              >
                {tab.badge}
              </span>
            ) : null}
            {tab.attention ? (
              <span
                className={`absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full ring-2 ring-white ${
                  tab.attention === 'critical' ? 'bg-rose-500' : 'bg-amber-400'
                }`}
                title={tab.attention === 'critical' ? 'Tiene documentos vencidos' : 'Tiene documentos por vencer u obligatorios pendientes'}
              />
            ) : null}
          </button>
        );
      })}
    </div>
  </div>
);
