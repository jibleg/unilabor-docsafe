import { useCallback, useEffect, useState } from 'react';
import { FileSignature, Loader2, RefreshCw, Search, Sparkles } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { generatePendingAssignmentLetters, getAssignmentLetter, listAssignmentLetters } from '../api/service.api-rh-assignment-letter';
import { getApiErrorMessage } from '../api/service.parsers';
import { AssignmentLetterEditor } from '../components/rh/assignment-letter/AssignmentLetterEditor';
import { buttonClass, cardClass, formatDateOnly, inputClass } from '../components/rh/supervision/supervision-ui';
import type { AssignmentLetter, AssignmentLetterListRow, AssignmentLetterStatus } from '../types/models';
import { notifyError, notifyInfo } from '../utils/notify';

const TABS: Array<[AssignmentLetterStatus, string]> = [
  ['DRAFT', 'Por firmar'],
  ['CLOSED', 'Firmadas'],
];

/**
 * Cartas de asignación de puesto REH-REG-008 (Fase 7): una por puesto, se
 * abren al autorizar el REH-REG-003 inicial del puesto. RH revisa las
 * autorizaciones, recaba las 3 firmas y la carta se archiva en el expediente.
 */
export const RhAssignmentLettersPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<AssignmentLetterStatus>('DRAFT');
  const [rows, setRows] = useState<AssignmentLetterListRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selected, setSelected] = useState<AssignmentLetter | null>(null);
  const [opening, setOpening] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listAssignmentLetters({ status: tab, ...(search.trim() ? { q: search.trim() } : {}) }));
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudieron cargar las cartas de asignación.'));
    } finally {
      setLoading(false);
    }
  }, [tab, search]);
  useEffect(() => {
    void load();
  }, [load]);

  const open = useCallback(async (id: number) => {
    setOpening(id);
    try {
      setSelected(await getAssignmentLetter(id));
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo abrir la carta.'));
    } finally {
      setOpening(null);
    }
  }, []);

  // Enlace directo ?letter=ID (p. ej. desde la autorización del REH-REG-003).
  useEffect(() => {
    const id = Number(searchParams.get('letter'));
    if (id > 0) {
      void open(id);
      setSearchParams((current) => {
        current.delete('letter');
        return current;
      });
    }
  }, [searchParams, setSearchParams, open]);

  const generate = async () => {
    setGenerating(true);
    try {
      notifyInfo(await generatePendingAssignmentLetters());
      await load();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudieron generar las cartas.'));
    } finally {
      setGenerating(false);
    }
  };

  if (selected) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6">
        <section className={cardClass}>
          <AssignmentLetterEditor
            letter={selected}
            onBack={() => {
              setSelected(null);
              void load();
            }}
            onChanged={setSelected}
            onDeleted={() => {
              setSelected(null);
              void load();
            }}
          />
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--color-brand-500)]">Recursos Humanos · Inducción Fase 7</p>
          <h1 className="text-2xl font-bold text-[var(--color-brand-700)]">Cartas de asignación de puesto (REH-REG-008)</h1>
          <p className="max-w-3xl text-sm text-[var(--unilabor-ink)]">
            Autorización formal para el desempeño independiente de cada puesto. Se abre al autorizar el REH-REG-003 inicial del puesto, con las
            autorizaciones del puesto ya marcadas.
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void generate()} disabled={generating} className={buttonClass} title="Abre las cartas de los REH-REG-003 ya autorizados que aún no tienen">
            {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Generar pendientes
          </button>
          <button type="button" onClick={() => void load()} className={buttonClass}>
            <RefreshCw size={14} /> Actualizar
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex overflow-hidden rounded-xl border border-[rgba(0,65,106,0.14)] bg-white">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`px-4 py-2 text-sm font-semibold ${tab === key ? 'bg-[var(--color-brand-700)] text-white' : 'text-[var(--unilabor-neutral)] hover:bg-[rgba(191,212,230,0.3)]'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative min-w-[260px] flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--unilabor-neutral)]" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por colaborador, puesto o folio" className={`${inputClass} pl-9`} />
        </div>
      </div>

      <section className={`${cardClass} space-y-2`}>
        {loading ? (
          <p className="inline-flex items-center gap-2 text-sm text-[var(--unilabor-neutral)]">
            <Loader2 size={14} className="animate-spin" /> Cargando…
          </p>
        ) : rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[rgba(0,65,106,0.14)] p-6 text-center text-sm text-[var(--unilabor-neutral)]">
            {tab === 'DRAFT' ? 'No hay cartas por firmar.' : 'Aún no hay cartas firmadas.'}
          </p>
        ) : (
          rows.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => void open(row.id)}
              disabled={opening !== null}
              className="flex w-full flex-wrap items-center justify-between gap-2 rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white px-4 py-3 text-left hover:border-[var(--color-brand-300)] disabled:opacity-60"
            >
              <div>
                <p className="text-sm font-semibold text-[var(--unilabor-ink)]">
                  {row.employee_name} · <span className="text-[var(--color-brand-700)]">{row.position_code}</span> {row.position_name}
                </p>
                <p className="text-[11px] text-[var(--unilabor-neutral)]">
                  {row.folio} · {row.area_name ?? 'Puesto sin área'} · {row.authorized_count} autorizaciones · {formatDateOnly(row.letter_date)}
                  {row.closed_at ? ` · firmada ${formatDateOnly(row.closed_at)}` : ''}
                </p>
              </div>
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-brand-500)]">
                {opening === row.id ? <Loader2 size={13} className="animate-spin" /> : <FileSignature size={13} />} Abrir
              </span>
            </button>
          ))
        )}
      </section>
    </div>
  );
};
