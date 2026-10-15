import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Copy } from 'lucide-react';
import { getApiErrorMessage } from '../../../api/service';
import { copySchedule, getScheduleWeek, type CopyResult } from '../../../api/service.api-attendance-schedule';
import { SearchableSelect } from '../../SearchableSelect';
import { notifyError, notifyWarning } from '../../../utils/notify';
import { ATTENDANCE_MIN_DATE, formatDateShort } from '../shared/format';
import { ModalShell } from './ModalShell';
import { inputClass, labelClass, primaryButton, secondaryButton } from './ui';

interface CopyModalProps {
  weekDate: string;
  defaultSourceId?: number;
  onClose: () => void;
  onCopied: () => void;
}

interface Person {
  id: number;
  name: string;
  code: string | null;
}

export const CopyModal = ({ weekDate, defaultSourceId, onClose, onCopied }: CopyModalProps) => {
  const [people, setPeople] = useState<Person[]>([]);
  const [loadingPeople, setLoadingPeople] = useState(true);
  const [source, setSource] = useState(defaultSourceId ? String(defaultSourceId) : '');
  const [sourceDate, setSourceDate] = useState(weekDate);
  const [targets, setTargets] = useState<number[]>([]);
  const [targetSearch, setTargetSearch] = useState('');
  const [mode, setMode] = useState<'next' | 'same'>('next');
  const [weeks, setWeeks] = useState(1);
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CopyResult | null>(null);

  useEffect(() => {
    let active = true;
    getScheduleWeek({ week: weekDate, limit: 500, only_enabled: true })
      .then((week) => {
        if (active) setPeople(week.data.map((r) => ({ id: r.employee_id, name: r.full_name, code: r.employee_code })));
      })
      .catch((error) => notifyError(getApiErrorMessage(error, 'No se pudo cargar la lista de colaboradores.')))
      .finally(() => active && setLoadingPeople(false));
    return () => {
      active = false;
    };
  }, [weekDate]);

  const sourceOptions = useMemo(() => people.map((p) => ({ value: String(p.id), label: p.name, hint: p.code ?? undefined })), [people]);
  const visibleTargets = useMemo(() => {
    const q = targetSearch.trim().toLowerCase();
    return people.filter((p) => p.id !== Number(source) && (!q || `${p.name} ${p.code ?? ''}`.toLowerCase().includes(q)));
  }, [people, targetSearch, source]);

  const toggleTarget = (id: number) => setTargets((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const submit = async () => {
    if (!source) return notifyWarning('Elige el colaborador de origen.');
    if (!sourceDate) return notifyWarning('Indica una fecha de la semana de origen.');
    setBusy(true);
    try {
      const copied = await copySchedule({
        source_employee_id: Number(source),
        source_date: sourceDate,
        target_employee_ids: targets,
        same_week: mode === 'same',
        weeks,
        replace,
      });
      setResult(copied);
      onCopied();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo copiar el horario.'));
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <ModalShell title="Horario copiado" onClose={onClose} widthClass="max-w-lg" footer={<button type="button" className={primaryButton} onClick={onClose}>Listo</button>}>
        <div className="space-y-3 text-sm">
          <p className="flex items-center gap-2 font-semibold text-emerald-700"><CheckCircle2 size={18} /> {result.created} {result.created === 1 ? 'día creado' : 'días creados'}</p>
          <ul className="space-y-1 text-[var(--unilabor-ink)]">
            <li>Programaciones creadas: <strong>{result.assignments_created}</strong></li>
            <li>Omitidos por ya tener horario: <strong>{result.skipped_existing}</strong></li>
            <li>Omitidos por conflicto: <strong>{result.skipped_conflict}</strong></li>
          </ul>
          {result.detail.length > 0 && (
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="mb-1 text-xs font-semibold uppercase text-[var(--unilabor-neutral)]">Detalle (primeros {result.detail.length})</p>
              <ul className="space-y-1 text-xs">
                {result.detail.map((d) => (
                  <li key={`${d.employee_id}-${d.date}-${d.reason}`}>
                    <span className="font-semibold">{people.find((p) => p.id === d.employee_id)?.name ?? `Colaborador ${d.employee_id}`}</span> · <span className="capitalize">{formatDateShort(d.date)}</span> · {d.reason === 'existing' ? 'ya tenía horario' : 'conflicto'}: {d.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell
      title="Copiar horario"
      subtitle="Copia una semana completa como días sueltos."
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <button type="button" className={secondaryButton} onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="button" className={primaryButton} onClick={() => void submit()} disabled={busy || !source}><Copy size={15} /> {busy ? 'Copiando…' : 'Copiar'}</button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <span className={labelClass}>Origen</span>
            <SearchableSelect value={source} options={sourceOptions} onChange={setSource} placeholder={loadingPeople ? 'Cargando…' : 'Colaborador'} disabled={loadingPeople} />
          </div>
          <div>
            <label className={labelClass} htmlFor="copy-date">Semana (cualquier día)</label>
            <input id="copy-date" type="date" min={ATTENDANCE_MIN_DATE} className={inputClass} value={sourceDate} onChange={(e) => setSourceDate(e.target.value)} />
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className={`${labelClass} mb-0`}>Destinos {targets.length > 0 ? `(${targets.length})` : ''}</span>
            <span className="text-xs text-[var(--unilabor-neutral)]">Vacío = el mismo colaborador</span>
          </div>
          <input className={`${inputClass} mb-2`} placeholder="Buscar colaborador" aria-label="Buscar destino" value={targetSearch} onChange={(e) => setTargetSearch(e.target.value)} />
          <div className="max-h-44 overflow-y-auto rounded-xl border border-[rgba(0,65,106,0.12)] p-1">
            {visibleTargets.length === 0 ? (
              <p className="p-3 text-center text-xs text-[var(--unilabor-neutral)]">{loadingPeople ? 'Cargando…' : 'Sin colaboradores'}</p>
            ) : (
              visibleTargets.map((p) => (
                <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
                  <input type="checkbox" checked={targets.includes(p.id)} onChange={() => toggleTarget(p.id)} />
                  <span className="truncate">{p.name}</span>
                  {p.code && <span className="text-xs text-[var(--unilabor-neutral)]">{p.code}</span>}
                </label>
              ))
            )}
          </div>
        </div>

        <div className="space-y-2 rounded-xl border border-[rgba(0,65,106,0.12)] p-3 text-sm">
          <label className="flex flex-wrap items-center gap-2">
            <input type="radio" checked={mode === 'next'} onChange={() => setMode('next')} />
            Las siguientes
            <input type="number" min={1} max={12} aria-label="Número de semanas" className={`${inputClass} !w-20`} value={weeks} disabled={mode !== 'next'} onChange={(e) => setWeeks(Math.min(12, Math.max(1, Number(e.target.value) || 1)))} />
            semanas
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={mode === 'same'} onChange={() => setMode('same')} />
            La misma semana
          </label>
          {mode === 'same' && <p className="text-xs text-[var(--unilabor-neutral)]">Si el destino es el mismo colaborador, se copia a la semana siguiente.</p>}
          <label className="flex items-center gap-2 border-t border-[rgba(0,65,106,0.08)] pt-2">
            <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
            Reemplazar lo que ya esté programado en esos días
          </label>
        </div>
      </div>
    </ModalShell>
  );
};
