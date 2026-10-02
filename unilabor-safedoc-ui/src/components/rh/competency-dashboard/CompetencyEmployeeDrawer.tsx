import { useCallback, useEffect, useState } from 'react';
import { Briefcase, Building2, CalendarClock, Eye, FileStack, Layers, Loader2, X } from 'lucide-react';
import { getCompetencyEmployeeDetail } from '../../../api/service.api-rh-competency-dashboard';
import { getEmployeeDocumentUrl } from '../../../api/service.api-training';
import { getApiErrorMessage } from '../../../api/service.parsers';
import type { CompetencyDashboardEmployee, CompetencyEmployeeDetail } from '../../../types/competencyDashboard';
import { formatDateOnly } from '../../../utils/competency';
import { STANDING_META, initials } from '../../../utils/competencyDashboard';
import { notifyError } from '../../../utils/notify';
import { PdfSafeViewer } from '../../PdfSafeViewerSafe';
import { StandingBadge } from './CompetencyCollaborators';
import { DocumentRow, EvaluationTraceCard, type ViewDocumentRequest } from './CompetencyEvaluationTrace';

type DrawerTab = 'trace' | 'documents';

interface CompetencyEmployeeDrawerProps {
  employee: CompetencyDashboardEmployee;
  onClose: () => void;
}

/**
 * Detalle de un colaborador: cada evaluación con sus hitos, resultados,
 * bitácora de auditoría y documentos soporte; y una vista consolidada de
 * todos los documentos (registro y constancia, con versiones superadas).
 * Los PDF se abren solo en el visor protegido.
 */
export const CompetencyEmployeeDrawer = ({ employee, onClose }: CompetencyEmployeeDrawerProps) => {
  const [detail, setDetail] = useState<CompetencyEmployeeDetail | null>(null);
  const [tab, setTab] = useState<DrawerTab>('trace');
  const [viewer, setViewer] = useState<{ url: string; title: string } | null>(null);
  const meta = STANDING_META[employee.standing];

  useEffect(() => {
    let alive = true;
    getCompetencyEmployeeDetail(employee.employee_id)
      .then((data) => {
        if (alive) setDetail(data);
      })
      .catch((error) => {
        if (alive) notifyError(getApiErrorMessage(error, 'No se pudo cargar el detalle del colaborador.'));
      });
    return () => {
      alive = false;
    };
  }, [employee.employee_id]);

  const closeViewer = useCallback(() => {
    setViewer((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return null;
    });
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (viewer) closeViewer();
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewer, closeViewer, onClose]);

  const openDocument = async ({ id, title }: ViewDocumentRequest) => {
    try {
      setViewer({ url: await getEmployeeDocumentUrl(id), title });
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo abrir el documento.'));
    }
  };

  const documentsCount = detail?.documents.length ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[rgba(11,34,53,0.32)] backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`Competencia de ${employee.full_name}`} onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-4xl flex-col overflow-hidden bg-[rgba(246,249,252,1)] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        style={{ animation: 'comp-drawer-in .35s cubic-bezier(.2,.8,.2,1) both' }}
      >
        <header className="relative overflow-hidden px-6 pb-4 pt-5 text-white" style={{ background: `linear-gradient(120deg, #0b2235, var(--color-brand-700) 55%, ${meta.color})` }}>
          <div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
          <div className="relative flex items-start gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-lg font-black ring-2 ring-white/30">{initials(employee.full_name)}</span>
            <div className="min-w-0 flex-1">
              <p className="text-xl font-black leading-tight">{employee.full_name}</p>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-white/80">
                <span>{employee.employee_code}</span>
                {employee.branch_name ? <span className="inline-flex items-center gap-1"><Building2 size={11} /> {employee.branch_name}</span> : null}
                {employee.area ? <span className="inline-flex items-center gap-1"><Layers size={11} /> {employee.area}</span> : null}
              </div>
              <p className="mt-1 inline-flex items-start gap-1 text-[11px] text-white/90">
                <Briefcase size={11} className="mt-0.5 shrink-0" />
                {employee.positions.map((position) => position.name).join(' · ') || 'Sin puesto activo'}
              </p>
            </div>
            <button type="button" onClick={onClose} className="rounded-full bg-white/15 p-2 transition hover:bg-white/25" aria-label="Cerrar">
              <X size={16} />
            </button>
          </div>
          <div className="relative mt-4 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white p-0.5"><StandingBadge standing={employee.standing} /></span>
            {employee.valid_until ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold">
                <CalendarClock size={12} /> Vigencia al {formatDateOnly(employee.valid_until)}
                {employee.days_to_expiry !== null ? ` (${employee.days_to_expiry < 0 ? `venció hace ${Math.abs(employee.days_to_expiry)} d` : `${employee.days_to_expiry} d`})` : ''}
              </span>
            ) : null}
            <span className="text-[11px] text-white/75">{meta.description}</span>
          </div>
          <nav className="relative mt-4 flex gap-1" role="tablist">
            {([['trace', 'Trazabilidad', Eye, employee.evaluations_count], ['documents', 'Documentos', FileStack, documentsCount]] as const).map(([key, label, Icon, count]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={`inline-flex items-center gap-1.5 rounded-t-xl px-4 py-2 text-xs font-bold transition ${tab === key ? 'bg-[rgba(246,249,252,1)] text-[var(--color-brand-700)]' : 'text-white/80 hover:bg-white/10'}`}
              >
                <Icon size={13} /> {label}
                <span className={`rounded-full px-1.5 text-[10px] ${tab === key ? 'bg-[rgba(191,212,230,0.6)]' : 'bg-white/20'}`}>{count}</span>
              </button>
            ))}
          </nav>
        </header>

        <div className="flex-1 overflow-y-auto p-5">
          {!detail ? (
            <div className="flex items-center justify-center gap-2 py-20 text-sm text-[var(--unilabor-neutral)]">
              <Loader2 size={18} className="animate-spin" /> Cargando trazabilidad…
            </div>
          ) : tab === 'trace' ? (
            detail.evaluations.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[rgba(0,65,106,0.16)] bg-white py-14 text-center">
                <p className="text-sm font-bold text-[var(--color-brand-700)]">Sin evaluaciones de competencia</p>
                <p className="mt-1 text-xs text-[var(--unilabor-neutral)]">Crea el REH-REG-003 desde “Evaluación de competencia”.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {detail.evaluations.map((evaluation) => (
                  <EvaluationTraceCard
                    key={evaluation.id}
                    evaluation={evaluation}
                    trace={detail.trace.filter((event) => event.evaluation_id === evaluation.id)}
                    documents={detail.documents.filter((document) => document.evaluation_id === evaluation.id)}
                    onView={(request) => void openDocument(request)}
                  />
                ))}
              </div>
            )
          ) : detail.documents.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[rgba(0,65,106,0.16)] bg-white py-14 text-center text-xs text-[var(--unilabor-neutral)]">
              Aún no hay documentos de competencia archivados en el expediente.
            </div>
          ) : (
            <div className="space-y-4">
              {[...new Set(detail.documents.map((document) => document.evaluation_id))].map((evaluationId) => (
                <section key={evaluationId} className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white p-4">
                  <h3 className="mb-2 text-xs font-black text-[var(--color-brand-700)]">REH-REG-003 #{evaluationId}</h3>
                  <ul className="space-y-1.5">
                    {detail.documents
                      .filter((document) => document.evaluation_id === evaluationId)
                      .map((document) => (
                        <DocumentRow key={document.id} document={document} onView={(request) => void openDocument(request)} />
                      ))}
                  </ul>
                </section>
              ))}
              <p className="text-[11px] text-[var(--unilabor-neutral)]">
                Las versiones superadas se conservan como evidencia (p. ej. registro v1 del cierre y v2 con la autorización).
              </p>
            </div>
          )}
        </div>
      </aside>

      {viewer ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(11,34,53,0.4)] p-4" onClick={(event) => event.stopPropagation()}>
          <div className="w-full max-w-5xl overflow-hidden rounded-3xl border border-[rgba(0,65,106,0.08)] bg-white/95 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[rgba(0,65,106,0.08)] px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-bold text-[var(--color-brand-700)]">
                <Eye size={16} /> {viewer.title}
              </div>
              <button type="button" onClick={closeViewer} className="rounded-full px-3 py-1.5 text-sm text-[var(--unilabor-neutral)] transition hover:bg-[rgba(191,212,230,0.28)]">
                Cerrar
              </button>
            </div>
            <PdfSafeViewer key={viewer.url} fileUrl={viewer.url} />
          </div>
        </div>
      ) : null}
    </div>
  );
};
