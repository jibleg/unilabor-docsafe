import { useState } from 'react';
import { Award, BookOpenCheck, CheckCircle2, Eye, FileSignature, FileText, ListChecks } from 'lucide-react';
import { EvaluationResponsesModal } from '../EvaluationResponsesModal';
import { InductionReadingEvidenceViewer, type ReadingEvidenceTab } from './InductionReadingEvidenceViewer';
import { InductionSection as Section } from './InductionSection';
import type { InductionAction, InductionAttemptDetail, InductionReadingDocumentDetail, InductionRosterRow } from '../../../types/models';
import { EVALUATION_STATUS_META } from '../../../utils/evaluations';
import {
  ACTION_META,
  ALERT_META,
  ALERT_SEVERITY_CLASS,
  STAGE_META,
  formatDateTime,
  formatDuration,
  formatHours,
} from '../../../utils/inductionDashboard';

interface InductionEnrollmentDetailProps {
  row: InductionRosterRow;
  employeeName: string;
  /** Lecturas de esta inscripción (documento por documento). */
  documents: InductionReadingDocumentDetail[];
  /** Todos los intentos de evaluación de la fase, no solo el vigente. */
  attempts: InductionAttemptDetail[];
  onAction: (action: InductionAction, row: InductionRosterRow) => void;
}

/**
 * Detalle de una inscripción del colaborador en una fase: etapa, alertas,
 * acciones de RH, lectura por documento (con visor protegido y hoja de firma),
 * intentos de evaluación (con preguntas y respuestas) y constancia.
 */
export const InductionEnrollmentDetail = ({ row, employeeName, documents, attempts, onAction }: InductionEnrollmentDetailProps) => {
  /** Intento cuyas preguntas y respuestas se muestran en el modal de revisión. */
  const [responsesAssignmentId, setResponsesAssignmentId] = useState<number | null>(null);
  /** Documento leído (y su hoja de firma) abierto en el visor protegido. */
  const [evidence, setEvidence] = useState<{
    doc: InductionReadingDocumentDetail;
    tab: ReadingEvidenceTab;
  } | null>(null);

  return (
    <>
      <div className="space-y-5 rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-sm font-bold text-[var(--color-brand-700)]">Fase {row.phase_number}</p>
            <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STAGE_META[row.stage].className}`}>
              {STAGE_META[row.stage].label}
            </span>
            <p className="mt-1 text-[11px] text-[var(--unilabor-neutral)]">
              Inscrito {formatDateTime(row.enrolled_at)} · {formatHours(row.elapsed_hours)} en la fase
              {row.stage === 'EN_DESCANSO' ? ` · en descanso, lecturas desde ${formatDateTime(row.readings_start_at)}` : ''}
              {row.supervisor_name ? ` · Supervisor: ${row.supervisor_name}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-1">
            {row.alerts.map((alert) => (
              <span
                key={alert}
                className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${ALERT_SEVERITY_CLASS[ALERT_META[alert].severity]}`}
              >
                {ALERT_META[alert].label}
              </span>
            ))}
          </div>
        </div>

        {row.actions.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {row.actions.map((action) => (
              <button
                key={action}
                type="button"
                onClick={() => onAction(action, row)}
                className={`rounded-lg px-2 py-1 text-[11px] font-semibold ${
                  ACTION_META[action].tone === 'danger'
                    ? 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                    : ACTION_META[action].tone === 'warning'
                      ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                      : ACTION_META[action].tone === 'success'
                        ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                        : 'bg-[rgba(191,212,230,0.4)] text-[var(--color-brand-700)] hover:bg-[rgba(124,173,211,0.3)]'
                }`}
              >
                {ACTION_META[action].label}
              </button>
            ))}
          </div>
        ) : null}

        <Section icon={BookOpenCheck} title={`Lectura · ${row.reading_signed}/${row.reading_total} firmados`}>
          {documents.length === 0 ? (
            <p className="text-xs text-[var(--unilabor-neutral)]">
              {row.stage === 'EN_DESCANSO'
                ? `Periodo de descanso: las lecturas, el plazo y el SMS se activan ${formatDateTime(row.readings_start_at)}.`
                : row.phase_published
                  ? 'Sin lecturas asignadas.'
                  : 'Las lecturas se asignan al publicar la fase.'}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {documents.map((doc) => {
                const pct = doc.pages_total > 0 ? Math.min(100, Math.round((doc.pages_seen / doc.pages_total) * 100)) : 0;
                const signed = doc.status === 'signed';
                return (
                  <li key={doc.document_id} className="rounded-lg border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)] px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-semibold text-[var(--unilabor-ink)]">
                        {doc.document_code ? <span className="mr-1 rounded bg-slate-100 px-1 font-mono text-[10px]">{doc.document_code}</span> : null}
                        {doc.title}
                      </p>
                      <span
                        className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                          signed
                            ? 'bg-emerald-100 text-emerald-700'
                            : doc.status === 'expired'
                              ? 'bg-rose-100 text-rose-700'
                              : doc.status === 'read'
                                ? 'bg-sky-100 text-sky-800'
                                : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {signed
                          ? 'Firmado'
                          : doc.status === 'read'
                            ? 'Leído'
                            : doc.status === 'in_progress'
                              ? 'Leyendo'
                              : doc.status === 'expired'
                                ? 'Vencido'
                                : 'Pendiente'}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[rgba(0,65,106,0.08)]">
                      <div className={`h-full ${signed ? 'bg-emerald-500' : 'bg-[#0069a6]'}`} style={{ width: `${pct}%` }} />
                    </div>
                    <p className="mt-0.5 text-[10px] text-[var(--unilabor-neutral)]">
                      {doc.pages_seen}/{doc.pages_total} páginas · {formatDuration(doc.active_seconds)} de lectura
                      {doc.signed_at
                        ? ` · firmado ${formatDateTime(doc.signed_at)}`
                        : doc.deadline_at
                          ? ` · vence ${formatDateTime(doc.deadline_at)}`
                          : ''}
                    </p>
                    {doc.acknowledgement_id ? (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => setEvidence({ doc, tab: 'document' })}
                          className="inline-flex items-center gap-1 rounded-lg border border-[rgba(0,65,106,0.14)] bg-white px-2 py-1 text-[11px] font-semibold text-[var(--color-brand-700)] hover:bg-[rgba(191,212,230,0.3)]"
                        >
                          <Eye size={12} /> Ver documento
                        </button>
                        {signed ? (
                          <button
                            type="button"
                            onClick={() => setEvidence({ doc, tab: 'signature' })}
                            className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100"
                          >
                            <FileSignature size={12} /> Ver firma
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        <Section icon={FileText} title={`Evaluación · ${attempts.length} intento(s)`}>
          {attempts.length === 0 ? (
            <p className="text-xs text-[var(--unilabor-neutral)]">Aún no se abre el cuestionario de esta fase.</p>
          ) : (
            <ul className="space-y-1.5">
              {attempts.map((attempt) => {
                const meta = EVALUATION_STATUS_META[attempt.status as keyof typeof EVALUATION_STATUS_META];
                return (
                  <li
                    key={attempt.assignment_id}
                    className={`rounded-lg border px-3 py-2 ${attempt.is_current ? 'border-[var(--color-brand-300)] bg-white' : 'border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)]'}`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-[var(--unilabor-ink)]">
                        Intento #{attempt.attempt_no}
                        {attempt.is_current ? <span className="ml-1 text-[10px] font-normal text-[var(--unilabor-neutral)]">(vigente)</span> : null}
                      </span>
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${meta?.className ?? 'bg-slate-100 text-slate-600'}`}>
                        {meta?.label ?? attempt.status}
                        {attempt.percentage !== null ? ` · ${attempt.percentage} %` : ''}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[10px] text-[var(--unilabor-neutral)]">
                      Abierto {formatDateTime(attempt.available_at)} · vence {formatDateTime(attempt.deadline_at)}
                      {attempt.started_at ? ` · iniciado ${formatDateTime(attempt.started_at)}` : ''}
                      {attempt.submitted_at ? ` · enviado ${formatDateTime(attempt.submitted_at)}` : ''}
                      {` · ${attempt.response_count}/${attempt.question_count} respuestas`}
                    </p>
                    {attempt.response_count > 0 || ['submitted', 'grading', 'passed', 'failed'].includes(attempt.status) ? (
                      <button
                        type="button"
                        onClick={() => setResponsesAssignmentId(attempt.assignment_id)}
                        className="mt-1.5 inline-flex items-center gap-1 rounded-lg border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-2 py-1 text-[11px] font-semibold text-[var(--color-brand-700)] hover:bg-[rgba(124,173,211,0.3)]"
                      >
                        <ListChecks size={12} /> Ver preguntas y respuestas
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        <Section icon={Award} title="Constancia">
          {row.certificate_document_id ? (
            <p className="inline-flex items-center gap-1.5 text-xs text-emerald-700">
              <CheckCircle2 size={13} /> Emitida y archivada en el expediente (documento #{row.certificate_document_id}).
            </p>
          ) : (
            <p className="text-xs text-[var(--unilabor-neutral)]">
              {row.stage === 'APROBADA' ? 'Aprobada sin constancia: usa "Emitir constancia".' : 'Se emite automáticamente al acreditar.'}
              {row.missing_branch || row.missing_position ? ' Faltan datos (sucursal/puesto) para una constancia completa.' : ''}
            </p>
          )}
        </Section>
      </div>
      {evidence && evidence.doc.acknowledgement_id ? (
        <InductionReadingEvidenceViewer
          acknowledgementId={evidence.doc.acknowledgement_id}
          title={evidence.doc.title}
          documentCode={evidence.doc.document_code}
          signedAt={evidence.doc.signed_at}
          employeeName={employeeName}
          initialTab={evidence.tab}
          onClose={() => setEvidence(null)}
        />
      ) : null}
      {responsesAssignmentId !== null ? (
        <div className="relative z-[70]">
          <EvaluationResponsesModal assignmentId={responsesAssignmentId} onClose={() => setResponsesAssignmentId(null)} />
        </div>
      ) : null}
    </>
  );
};
