import { useCallback, useEffect, useState } from 'react';
import { ClipboardList, Download, Loader2, Plus } from 'lucide-react';
import { toast } from 'react-toastify';
import {
  createEffectivenessReview,
  getEmployeeInductionMasterRecord,
  getEmployeeInductionMasterRecordPdfUrl,
} from '../../api/service.api-rh-induction';
import { getApiErrorMessage } from '../../api/service.parsers';
import type { RhInductionMasterRecord, RhInductionPhaseRowStatus } from '../../types/models';

interface EmployeeInductionHistoryPanelProps {
  employeeId: number;
}

const STATUS_LABEL: Record<RhInductionPhaseRowStatus, string> = {
  PENDIENTE: 'Pendiente',
  EN_PROCESO: 'En proceso',
  APROBADA: 'Aprobada',
  NO_APROBADA: 'No aprobada',
  NO_DISPONIBLE: 'No disponible aún',
};

const STATUS_CLASS: Record<RhInductionPhaseRowStatus, string> = {
  PENDIENTE: 'bg-[rgba(151,163,172,0.14)] text-[var(--color-brand-700)]',
  EN_PROCESO: 'bg-amber-50 text-amber-700',
  APROBADA: 'bg-emerald-50 text-emerald-700',
  NO_APROBADA: 'bg-rose-50 text-rose-700',
  NO_DISPONIBLE: 'bg-[rgba(151,163,172,0.08)] text-[var(--unilabor-neutral)]',
};

const VERDICT_LABEL: Record<RhInductionMasterRecord['summary']['verdict'], string> = {
  SIN_INICIAR: 'Sin iniciar',
  EN_PROCESO: 'En proceso',
  NO_APROBADA: 'No aprobada',
  COMPLETA_1_A_4: 'Fases 1-4 completas',
};

const formatDate = (value: string | null): string => (value ? new Date(value).toLocaleDateString('es-MX') : '—');

export const EmployeeInductionHistoryPanel = ({ employeeId }: EmployeeInductionHistoryPanelProps) => {
  const [record, setRecord] = useState<RhInductionMasterRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const [showEffectivenessForm, setShowEffectivenessForm] = useState(false);
  const [reviewDate, setReviewDate] = useState('');
  const [method, setMethod] = useState('');
  const [resultPercentage, setResultPercentage] = useState('');
  const [performsAsExpected, setPerformsAsExpected] = useState('');
  const [evidenceNotes, setEvidenceNotes] = useState('');
  const [savingReview, setSavingReview] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRecord(await getEmployeeInductionMasterRecord(employeeId));
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo cargar el formato de inducción.'));
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleExportPdf = async () => {
    setExporting(true);
    try {
      const url = await getEmployeeInductionMasterRecordPdfUrl(employeeId);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo generar el PDF.'));
    } finally {
      setExporting(false);
    }
  };

  const handleSaveReview = async () => {
    if (!reviewDate.trim() || !method.trim()) {
      toast.warning('Fecha y método son obligatorios.');
      return;
    }
    setSavingReview(true);
    try {
      await createEffectivenessReview(employeeId, {
        review_date: reviewDate,
        method: method.trim(),
        result_percentage: resultPercentage.trim() ? Number(resultPercentage) : null,
        performs_as_expected: performsAsExpected === '' ? null : performsAsExpected === 'true',
        evidence_notes: evidenceNotes.trim() || null,
      });
      toast.success('Seguimiento de eficacia registrado correctamente.');
      setShowEffectivenessForm(false);
      setReviewDate('');
      setMethod('');
      setResultPercentage('');
      setPerformsAsExpected('');
      setEvidenceNotes('');
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo registrar el seguimiento.'));
    } finally {
      setSavingReview(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-3xl border border-[rgba(0,65,106,0.08)] bg-white/92 p-5 shadow-xl shadow-[rgba(0,65,106,0.08)]">
        <p className="text-sm text-[var(--unilabor-neutral)]">Cargando formato de inducción...</p>
      </div>
    );
  }

  if (!record) {
    return null;
  }

  return (
    <div className="rounded-3xl border border-[rgba(0,65,106,0.08)] bg-white/92 shadow-xl shadow-[rgba(0,65,106,0.08)]">
      <div className="flex items-center justify-between border-b border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.96)] px-5 py-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">
            Inducción por puesto — REH-REG-005
          </p>
          <h3 className="mt-1 flex items-center gap-2 text-lg font-bold text-[var(--color-brand-700)]">
            <ClipboardList size={18} />
            Formato de inducción
          </h3>
        </div>
        <button
          type="button"
          onClick={() => void handleExportPdf()}
          disabled={exporting}
          className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          Exportar PDF
        </button>
      </div>

      <div className="space-y-5 p-5">
        <div className="grid grid-cols-2 gap-3 text-xs text-[var(--unilabor-neutral)] sm:grid-cols-4">
          <div>
            <p className="font-semibold text-[var(--color-brand-700)]">Fases aprobadas</p>
            <p className="text-lg font-bold text-emerald-700">{record.summary.approved_count}</p>
          </div>
          <div>
            <p className="font-semibold text-[var(--color-brand-700)]">No aprobadas</p>
            <p className="text-lg font-bold text-rose-700">{record.summary.not_approved_count}</p>
          </div>
          <div>
            <p className="font-semibold text-[var(--color-brand-700)]">Pendientes</p>
            <p className="text-lg font-bold text-[var(--color-brand-700)]">{record.summary.pending_count}</p>
          </div>
          <div>
            <p className="font-semibold text-[var(--color-brand-700)]">Calificación media</p>
            <p className="text-lg font-bold text-[var(--color-brand-700)]">
              {record.summary.average_score !== null ? `${record.summary.average_score}%` : '—'}
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-[rgba(0,65,106,0.1)] bg-[rgba(248,251,253,0.96)] px-3 py-2 text-xs text-[var(--unilabor-neutral)]">
          <p>
            <span className="font-bold text-[var(--color-brand-700)]">Dictamen:</span> {VERDICT_LABEL[record.summary.verdict]}
          </p>
          <p className="mt-1">{record.summary.what_next}</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-[var(--unilabor-neutral)]">
                <th className="pb-2 pr-2 font-semibold">Fase</th>
                <th className="pb-2 pr-2 font-semibold">Responsable / supervisor</th>
                <th className="pb-2 pr-2 font-semibold">Fechas</th>
                <th className="pb-2 pr-2 font-semibold">Calif.</th>
                <th className="pb-2 pr-2 font-semibold">Checklist</th>
                <th className="pb-2 font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody>
              {record.phases.map((phase) => (
                <tr key={phase.phase_number} className="border-t border-[rgba(0,65,106,0.06)] align-top">
                  <td className="py-2 pr-2">
                    <p className="font-bold text-[var(--color-brand-700)]">Fase {phase.phase_number}</p>
                    <p className="text-[var(--unilabor-neutral)]">{phase.name}</p>
                  </td>
                  <td className="py-2 pr-2 text-[var(--unilabor-neutral)]">
                    <p>{phase.responsible_label}</p>
                    <p>Supervisor: {phase.supervisor_name ?? '—'}</p>
                  </td>
                  <td className="py-2 pr-2 text-[var(--unilabor-neutral)]">
                    <p>Inicio: {formatDate(phase.started_at)}</p>
                    <p>Término: {formatDate(phase.finished_at)}</p>
                  </td>
                  <td className="py-2 pr-2 text-[var(--unilabor-neutral)]">
                    {phase.score_percentage !== null ? `${phase.score_percentage}%` : '—'}
                  </td>
                  <td className="py-2 pr-2 text-[var(--unilabor-neutral)]">
                    {phase.checklist_completed}/{phase.checklist_total}
                  </td>
                  <td className="py-2">
                    <span className={`inline-block rounded-full px-2 py-0.5 font-semibold ${STATUS_CLASS[phase.status]}`}>
                      {STATUS_LABEL[phase.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-[var(--color-brand-700)]">
              Eficacia del programa de inducción ({record.effectiveness_reviews.length})
            </h4>
            <button
              type="button"
              onClick={() => setShowEffectivenessForm((prev) => !prev)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-brand-700)] hover:underline"
            >
              <Plus size={13} />
              Registrar seguimiento
            </button>
          </div>

          {showEffectivenessForm ? (
            <div className="mt-2 space-y-2 rounded-xl border border-[rgba(0,65,106,0.1)] bg-[rgba(248,251,253,0.96)] p-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  type="date"
                  value={reviewDate}
                  onChange={(event) => setReviewDate(event.target.value)}
                  className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-white px-3 py-2 text-sm outline-none"
                />
                <input
                  value={method}
                  onChange={(event) => setMethod(event.target.value)}
                  placeholder="Método de evaluación de la eficacia"
                  className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-white px-3 py-2 text-sm outline-none"
                />
                <input
                  type="number"
                  value={resultPercentage}
                  onChange={(event) => setResultPercentage(event.target.value)}
                  placeholder="Resultado obtenido (%)"
                  className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-white px-3 py-2 text-sm outline-none"
                />
                <select
                  value={performsAsExpected}
                  onChange={(event) => setPerformsAsExpected(event.target.value)}
                  className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-white px-3 py-2 text-sm outline-none"
                >
                  <option value="">¿Desempeña conforme a lo esperado?</option>
                  <option value="true">Sí</option>
                  <option value="false">No</option>
                </select>
              </div>
              <textarea
                value={evidenceNotes}
                onChange={(event) => setEvidenceNotes(event.target.value)}
                placeholder="Evidencia objetiva"
                rows={2}
                className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-white px-3 py-2 text-sm outline-none"
              />
              <button
                type="button"
                onClick={() => void handleSaveReview()}
                disabled={savingReview}
                className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingReview ? <Loader2 size={14} className="animate-spin" /> : 'Guardar seguimiento'}
              </button>
            </div>
          ) : null}

          {record.effectiveness_reviews.length > 0 ? (
            <div className="mt-2 space-y-1.5">
              {record.effectiveness_reviews.map((review) => (
                <div
                  key={review.id}
                  className="rounded-lg border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)] px-3 py-2 text-xs text-[var(--unilabor-neutral)]"
                >
                  <p>
                    <span className="font-semibold text-[var(--color-brand-700)]">{formatDate(review.review_date)}</span> —{' '}
                    {review.method} · Resultado:{' '}
                    {review.result_percentage !== null ? `${review.result_percentage}%` : 'N/D'} · ¿Desempeña conforme?:{' '}
                    {review.performs_as_expected === null ? 'N/D' : review.performs_as_expected ? 'Sí' : 'No'}
                  </p>
                  {review.evidence_notes ? <p className="mt-1">{review.evidence_notes}</p> : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
