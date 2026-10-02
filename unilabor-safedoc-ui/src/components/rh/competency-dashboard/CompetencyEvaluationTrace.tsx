import {
  Award,
  BookOpenCheck,
  CheckCircle2,
  Circle,
  ExternalLink,
  Eye,
  FilePlus2,
  FileSignature,
  History,
  Lock,
  ShieldAlert,
  Stamp,
  Trash2,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type { RhCompetencyEvaluation } from '../../../types/models';
import type { CompetencySupportDocument, CompetencyTraceEvent } from '../../../types/competencyDashboard';
import { AUTHORIZATION_UI, DICTAMEN_UI, formatDateOnly } from '../../../utils/competency';
import { EVALUATION_TYPE_LABELS, SECTION_META, formatDateTime, scoreColor } from '../../../utils/competencyDashboard';

export interface ViewDocumentRequest {
  id: number;
  title: string;
}

const ACTION_META: Record<string, { label: string; icon: LucideIcon; color: string }> = {
  RH_COMP_EVAL_CREATE: { label: 'Evaluación creada (borrador)', icon: FilePlus2, color: '#0284c7' },
  RH_COMP_EVAL_KNOWLEDGE_ASSIGNED: { label: 'Cuestionario de conocimiento asignado (banco)', icon: BookOpenCheck, color: '#0d9488' },
  RH_COMP_EVAL_KNOWLEDGE_COURSE: { label: 'Conocimiento ligado a capacitación del puesto', icon: BookOpenCheck, color: '#0d9488' },
  RH_COMP_EVAL_KNOWLEDGE_CANCELLED: { label: 'Cuestionario de conocimiento retirado', icon: XCircle, color: '#64748b' },
  RH_COMP_EVAL_CLOSE: { label: 'Evaluación cerrada y firmada', icon: Lock, color: '#00416a' },
  RH_COMP_EVAL_AUTHORIZE: { label: 'Decisión de autorización', icon: Stamp, color: '#7c3aed' },
  RH_COMP_EVAL_CERTIFICATE_ISSUED: { label: 'Constancia archivada en expediente', icon: Award, color: '#059669' },
  RH_COMP_EVAL_DELETE_DRAFT: { label: 'Borrador eliminado', icon: Trash2, color: '#e11d48' },
};

const detailText = (event: CompetencyTraceEvent): string | null => {
  if (!event.detail) return null;
  const first = event.detail.split(':')[0] ?? '';
  if (event.action === 'RH_COMP_EVAL_CLOSE') return DICTAMEN_UI[first]?.label ?? first;
  if (event.action === 'RH_COMP_EVAL_AUTHORIZE') return AUTHORIZATION_UI[first]?.label ?? first;
  return null;
};

interface Milestone {
  label: string;
  date: string | null;
  done: boolean;
  tone?: 'bad';
}

/** Hitos del ciclo de vida del REH-REG-003 derivados de la propia evaluación. */
const milestonesFor = (evaluation: RhCompetencyEvaluation): Milestone[] => {
  const quiz = evaluation.knowledge_quiz;
  const authorization = evaluation.results.authorization_result;
  const decided = authorization && authorization !== 'PENDIENTE';
  return [
    { label: 'Creada', date: formatDateTime(evaluation.created_at), done: true },
    {
      label: quiz ? `Conocimiento (${quiz.percentage !== null ? `${Math.round(quiz.percentage)}%` : quiz.status})` : 'Conocimiento',
      date: quiz?.submitted_at ? formatDateTime(quiz.submitted_at) : null,
      done: evaluation.results.knowledge_pct !== null,
    },
    { label: 'Cerrada y firmada', date: evaluation.closed_at ? formatDateTime(evaluation.closed_at) : null, done: evaluation.status === 'CLOSED' },
    {
      label: decided ? AUTHORIZATION_UI[authorization]?.label ?? authorization : 'Autorización',
      date: decided ? formatDateOnly(evaluation.authorized_at) : null,
      done: Boolean(decided),
      tone: authorization === 'NO_AUTORIZADO' ? 'bad' : undefined,
    },
    { label: 'Constancia', date: evaluation.valid_until ? `Vigente al ${formatDateOnly(evaluation.valid_until)}` : null, done: Boolean(evaluation.certificate_document_id) },
  ];
};

const Stepper = ({ evaluation }: { evaluation: RhCompetencyEvaluation }) => (
  <ol className="grid grid-cols-5 gap-1">
    {milestonesFor(evaluation).map((milestone, i, all) => {
      const color = milestone.tone === 'bad' ? '#e11d48' : milestone.done ? '#059669' : '#cbd5e1';
      const Icon = milestone.tone === 'bad' ? ShieldAlert : milestone.done ? CheckCircle2 : Circle;
      return (
        <li key={milestone.label} className="relative flex flex-col items-center text-center">
          {i < all.length - 1 ? (
            <span className="absolute left-1/2 top-3 h-0.5 w-full" style={{ backgroundColor: all[i + 1].done ? '#059669' : 'rgba(0,65,106,0.1)' }} />
          ) : null}
          <span className="relative z-10 rounded-full bg-white">
            <Icon size={24} style={{ color }} />
          </span>
          <span className="mt-1 text-[10px] font-bold leading-tight text-[var(--unilabor-ink)]">{milestone.label}</span>
          <span className="text-[9px] leading-tight text-[var(--unilabor-neutral)]">{milestone.date ?? 'Pendiente'}</span>
        </li>
      );
    })}
  </ol>
);

interface EvaluationCardProps {
  evaluation: RhCompetencyEvaluation;
  trace: CompetencyTraceEvent[];
  documents: CompetencySupportDocument[];
  onView: (request: ViewDocumentRequest) => void;
}

/** Tarjeta de una evaluación: hitos, resultados, bitácora y documentos soporte. */
export const EvaluationTraceCard = ({ evaluation, trace, documents, onView }: EvaluationCardProps) => {
  const { results } = evaluation;
  const dictamen = results.dictamen ? DICTAMEN_UI[results.dictamen] : null;
  const scored = (evaluation.items ?? []).filter((item) => item.score !== null || item.is_correct !== null).length;
  const totalItems = evaluation.items?.length ?? 0;
  return (
    <article className="overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white shadow-sm" style={{ animation: 'agr-pop .4s ease both' }}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgba(0,65,106,0.06)] bg-gradient-to-r from-[rgba(239,245,250,1)] to-white px-4 py-3">
        <div>
          <p className="text-sm font-black text-[var(--color-brand-700)]">
            REH-REG-003 #{evaluation.id} · {EVALUATION_TYPE_LABELS[evaluation.evaluation_type] ?? evaluation.evaluation_type}
          </p>
          <p className="text-[11px] text-[var(--unilabor-neutral)]">
            {evaluation.position_name} · {formatDateOnly(evaluation.evaluation_date)} · Evaluador: {evaluation.evaluator_name}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${evaluation.status === 'CLOSED' ? 'bg-[var(--color-brand-700)] text-white' : 'bg-sky-100 text-sky-800'}`}>
            {evaluation.status === 'CLOSED' ? 'Cerrada' : `Borrador · ${scored}/${totalItems} calificados`}
          </span>
          {dictamen ? <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${dictamen.className}`}>{dictamen.label}</span> : null}
          {results.authorization_result ? (
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${AUTHORIZATION_UI[results.authorization_result]?.className ?? ''}`}>
              {AUTHORIZATION_UI[results.authorization_result]?.label ?? results.authorization_result}
            </span>
          ) : null}
        </div>
      </header>

      <div className="space-y-4 p-4">
        <Stepper evaluation={evaluation} />

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {SECTION_META.map((section) => (
            <div key={section.key} className="rounded-xl border border-[rgba(0,65,106,0.08)] p-2.5">
              <p className="text-[10px] font-semibold text-[var(--unilabor-neutral)]">{section.label} · {section.weight}%</p>
              <p className="text-lg font-black tabular-nums" style={{ color: section.color }}>{results[section.key] !== null ? `${results[section.key]}%` : '—'}</p>
              <div className="h-1.5 overflow-hidden rounded-full bg-[rgba(0,65,106,0.08)]">
                <span className="block h-full rounded-full" style={{ width: `${results[section.key] ?? 0}%`, backgroundColor: section.color }} />
              </div>
            </div>
          ))}
          <div className="rounded-xl p-2.5 text-white" style={{ background: `linear-gradient(135deg, ${scoreColor(results.final_pct)}, #00416a)` }}>
            <p className="text-[10px] font-semibold text-white/80">Calificación final{evaluation.status === 'DRAFT' ? ' (en vivo)' : ''}</p>
            <p className="text-2xl font-black tabular-nums">{results.final_pct !== null ? `${results.final_pct}%` : '—'}</p>
            {results.veto_applied ? <p className="text-[10px] font-bold">Veto por competencia crítica</p> : null}
          </div>
        </div>

        {evaluation.authorized_by_name || evaluation.authorization_note || evaluation.reference_course_title || (evaluation.actions?.length ?? 0) > 0 ? (
          <dl className="grid grid-cols-1 gap-x-4 gap-y-1 rounded-xl bg-[rgba(248,251,253,1)] p-3 text-[11px] sm:grid-cols-2">
            {evaluation.authorized_by_name ? (
              <div><dt className="inline font-semibold text-[var(--unilabor-neutral)]">Autorizó: </dt><dd className="inline text-[var(--unilabor-ink)]">{evaluation.authorized_by_name}</dd></div>
            ) : null}
            {evaluation.reference_course_title ? (
              <div><dt className="inline font-semibold text-[var(--unilabor-neutral)]">Capacitación de referencia: </dt><dd className="inline text-[var(--unilabor-ink)]">{evaluation.reference_course_title}</dd></div>
            ) : null}
            {evaluation.authorization_note ? (
              <div className="sm:col-span-2"><dt className="inline font-semibold text-[var(--unilabor-neutral)]">Nota de autorización: </dt><dd className="inline text-[var(--unilabor-ink)]">{evaluation.authorization_note}</dd></div>
            ) : null}
            {(evaluation.actions?.length ?? 0) > 0 ? (
              <div className="sm:col-span-2">
                <dt className="font-semibold text-[var(--unilabor-neutral)]">Plan de acciones ({evaluation.actions?.length})</dt>
                {evaluation.actions?.map((action) => (
                  <dd key={action.id ?? action.sort_order} className="text-[var(--unilabor-ink)]">
                    • {action.improvement_area}: {action.required_action}
                    {action.due_date ? ` (compromiso ${formatDateOnly(action.due_date)})` : ''}
                  </dd>
                ))}
              </div>
            ) : null}
          </dl>
        ) : null}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <h4 className="mb-2 inline-flex items-center gap-1.5 text-xs font-bold text-[var(--color-brand-700)]">
              <History size={14} /> Bitácora de auditoría
            </h4>
            {trace.length === 0 ? (
              <p className="text-[11px] text-[var(--unilabor-neutral)]">Sin eventos registrados en la bitácora.</p>
            ) : (
              <ol className="relative space-y-2.5 border-l-2 border-[rgba(0,65,106,0.08)] pl-4">
                {trace.map((event) => {
                  const meta = ACTION_META[event.action] ?? { label: event.action, icon: Circle, color: '#64748b' };
                  const Icon = meta.icon;
                  return (
                    <li key={event.id} className="relative">
                      <span className="absolute -left-[27px] flex h-5 w-5 items-center justify-center rounded-full bg-white ring-2" style={{ color: meta.color, ['--tw-ring-color' as string]: meta.color }}>
                        <Icon size={11} />
                      </span>
                      <p className="text-[11px] font-bold text-[var(--unilabor-ink)]">
                        {meta.label}
                        {detailText(event) ? <span className="font-semibold text-[var(--unilabor-neutral)]"> · {detailText(event)}</span> : null}
                      </p>
                      <p className="text-[10px] text-[var(--unilabor-neutral)]">
                        {formatDateTime(event.occurred_at)} · {event.user_name ?? 'Usuario no identificado'}
                      </p>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
          <div>
            <h4 className="mb-2 inline-flex items-center gap-1.5 text-xs font-bold text-[var(--color-brand-700)]">
              <FileSignature size={14} /> Documentos soporte
            </h4>
            {documents.length === 0 ? (
              <p className="text-[11px] text-[var(--unilabor-neutral)]">
                {evaluation.status === 'DRAFT' ? 'El registro se genera y archiva al cerrar la evaluación.' : 'Sin documentos archivados.'}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {documents.map((document) => (
                  <DocumentRow key={document.id} document={document} onView={onView} />
                ))}
              </ul>
            )}
            <Link
              to={`/rh/competency-evaluations?evaluation=${evaluation.id}`}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[rgba(0,65,106,0.14)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.3)]"
            >
              <ExternalLink size={12} /> Abrir evaluación completa
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
};

export const DocumentRow = ({ document, onView }: { document: CompetencySupportDocument; onView: (request: ViewDocumentRequest) => void }) => {
  const isCertificate = document.kind === 'CERTIFICATE';
  const Icon = isCertificate ? Award : FileSignature;
  return (
    <li className={`flex items-center gap-2.5 rounded-xl border px-2.5 py-2 ${document.is_current ? 'border-[rgba(0,65,106,0.1)] bg-white' : 'border-dashed border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,1)] opacity-80'}`}>
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${isCertificate ? 'bg-emerald-50 text-emerald-700' : 'bg-[rgba(191,212,230,0.5)] text-[var(--color-brand-700)]'}`}>
        <Icon size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-bold text-[var(--unilabor-ink)]">{isCertificate ? 'Constancia de competencia' : 'Registro REH-REG-003'}</p>
        <p className="truncate text-[10px] text-[var(--unilabor-neutral)]">
          v{document.version} · {document.is_current ? 'Vigente' : 'Superada'} · {formatDateTime(document.created_at)}
          {document.expiry_date ? ` · vence ${formatDateOnly(document.expiry_date)}` : ''}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onView({ id: document.id, title: `${isCertificate ? 'Constancia de competencia' : 'REH-REG-003'} · v${document.version}` })}
        className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[var(--color-brand-700)] px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-[var(--color-brand-500)]"
      >
        <Eye size={12} /> Ver
      </button>
    </li>
  );
};
