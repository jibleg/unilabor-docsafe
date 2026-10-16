import { CheckCheck, MinusCircle } from 'lucide-react';
import type { SupervisionChecklistSection, SupervisionResult } from '../../../types/models';
import { RESULT_UI } from './supervision-ui';

export interface SupervisionDraftResult {
  result: SupervisionResult | null;
  observations: string;
}

interface SupervisionSectionsEditorProps {
  sections: SupervisionChecklistSection[];
  values: Record<number, SupervisionDraftResult>;
  readOnly: boolean;
  onChange: (itemId: number, next: Partial<SupervisionDraftResult>) => void;
  onBulk: (itemIds: number[], result: SupervisionResult) => void;
}

const RESULTS: SupervisionResult[] = ['SI', 'NO', 'NA'];

/**
 * Las 9 secciones del ANA-REG-060: por cada aspecto, SÍ / NO / N/A y su
 * observación / acción correctiva. Atajos por sección para marcar todo SÍ o
 * todo N/A (puestos administrativos).
 */
export const SupervisionSectionsEditor = ({ sections, values, readOnly, onChange, onBulk }: SupervisionSectionsEditorProps) => (
  <div className="space-y-4">
    {sections.map((section) => {
      const ids = section.items.map((item) => item.item_id);
      const answered = ids.filter((id) => values[id]?.result).length;
      return (
        <section key={section.section_code} className="overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white">
          <header className="flex flex-wrap items-center justify-between gap-2 bg-[var(--color-brand-700)] px-4 py-2 text-white">
            <p className="text-xs font-bold uppercase tracking-wide">{section.section_title}</p>
            <div className="flex items-center gap-2 text-[11px]">
              <span className="rounded-full bg-white/15 px-2 py-0.5 font-semibold">
                {answered}/{ids.length}
              </span>
              {!readOnly ? (
                <>
                  <button
                    type="button"
                    onClick={() => onBulk(ids, 'SI')}
                    className="inline-flex items-center gap-1 rounded-lg bg-white/15 px-2 py-0.5 font-semibold hover:bg-white/25"
                    title="Marcar toda la sección como Cumple"
                  >
                    <CheckCheck size={12} /> Todo SÍ
                  </button>
                  <button
                    type="button"
                    onClick={() => onBulk(ids, 'NA')}
                    className="inline-flex items-center gap-1 rounded-lg bg-white/15 px-2 py-0.5 font-semibold hover:bg-white/25"
                    title="Marcar toda la sección como No aplica"
                  >
                    <MinusCircle size={12} /> Todo N/A
                  </button>
                </>
              ) : null}
            </div>
          </header>
          <ul className="divide-y divide-[rgba(0,65,106,0.08)]">
            {section.items.map((item) => {
              const value = values[item.item_id] ?? { result: item.result, observations: item.observations ?? '' };
              const [lead, ...rest] = item.item_text.split(': ');
              const hasLead = rest.length > 0 && (lead?.length ?? 0) <= 60;
              return (
                <li key={item.item_id} className={`grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(180px,0.6fr)] md:items-start ${value.result === 'NO' ? 'bg-rose-50/40' : ''}`}>
                  <p className="text-sm leading-5 text-[var(--unilabor-ink)]">
                    <span className="font-bold">{item.item_no}. </span>
                    {hasLead ? (
                      <>
                        <span className="font-semibold">{lead}:</span> {rest.join(': ')}
                      </>
                    ) : (
                      item.item_text
                    )}
                    {item.position_na ? (
                      <span className="ml-2 rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500" title="Preconfigurado como no aplica para el puesto">
                        N/A del puesto
                      </span>
                    ) : null}
                  </p>
                  <div className="inline-flex overflow-hidden rounded-xl border border-[rgba(0,65,106,0.14)]" role="radiogroup" aria-label={`Resultado del aspecto ${item.item_no}`}>
                    {RESULTS.map((option) => {
                      const active = value.result === option;
                      return (
                        <button
                          key={option}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          disabled={readOnly}
                          title={RESULT_UI[option].title}
                          onClick={() => onChange(item.item_id, { result: active ? null : option })}
                          className={`min-w-[44px] px-3 py-1.5 text-xs font-bold transition disabled:cursor-default ${
                            active ? RESULT_UI[option].active : 'bg-white text-[var(--unilabor-neutral)] hover:bg-[rgba(191,212,230,0.3)]'
                          }`}
                        >
                          {RESULT_UI[option].label}
                        </button>
                      );
                    })}
                  </div>
                  {readOnly ? (
                    <p className="text-xs text-[var(--unilabor-ink)]">{value.observations || <span className="text-[var(--unilabor-neutral)]">—</span>}</p>
                  ) : (
                    <input
                      value={value.observations}
                      onChange={(e) => onChange(item.item_id, { observations: e.target.value })}
                      placeholder={value.result === 'NO' ? 'Observación / acción correctiva (recomendado)' : 'Observación (opcional)'}
                      className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-1.5 text-xs text-[var(--unilabor-ink)] outline-none focus:border-[var(--color-brand-300)]"
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      );
    })}
  </div>
);
