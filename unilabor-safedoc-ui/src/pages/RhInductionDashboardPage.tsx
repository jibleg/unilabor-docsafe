import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { Award, LayoutDashboard, Loader2, RefreshCw, Settings2, StepForward, Users } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { removeEnrollment } from '../api/service.api-rh-induction';
import {
  advanceEnrollment,
  getInductionDashboardOverview,
  getInductionPhaseRoster,
  issueEnrollmentCertificate,
  resendReadingNotice,
  startDeferredEnrollmentNow,
} from '../api/service.api-rh-induction-dashboard';
import { getApiErrorMessage } from '../api/service.parsers';
import { EnrollmentCertificateDataModal } from '../components/rh/EnrollmentCertificateDataModal';
import { InductionReopenReadingModal } from '../components/rh/InductionReopenReadingModal';
import { InductionRetryModal } from '../components/rh/InductionRetryModal';
import { InductionBulkReopenModal } from '../components/rh/induction-dashboard/InductionBulkReopenModal';
import { InductionCollaboratorDirectory } from '../components/rh/induction-dashboard/InductionCollaboratorDirectory';
import { InductionCollaboratorDrawer } from '../components/rh/induction-dashboard/InductionCollaboratorDrawer';
import { InductionCollaboratorSummary } from '../components/rh/induction-dashboard/InductionCollaboratorSummary';
import { InductionPhaseCard } from '../components/rh/induction-dashboard/InductionPhaseCard';
import { InductionPhaseFunnelChart } from '../components/rh/induction-dashboard/InductionPhaseFunnelChart';
import { InductionPhase7Card } from '../components/rh/induction-dashboard/InductionPhase7Card';
import { InductionPhaseRulesPanel } from '../components/rh/induction-dashboard/InductionPhaseRulesPanel';
import { InductionPositionPhasePanel } from '../components/rh/induction-dashboard/InductionPositionPhasePanel';
import { InductionPracticalCaptureModal } from '../components/rh/induction-dashboard/InductionPracticalCaptureModal';
import { InductionTransitionModal, type TransitionCandidateRef } from '../components/rh/induction-dashboard/InductionTransitionModal';
import { InductionTransitionsView, type TransitionsTab } from '../components/rh/induction-dashboard/InductionTransitionsView';
import { InductionProgramKpis } from '../components/rh/induction-dashboard/InductionProgramKpis';
import { InductionResetAttemptModal } from '../components/rh/induction-dashboard/InductionResetAttemptModal';
import { InductionRosterTable, type RosterFilters } from '../components/rh/induction-dashboard/InductionRosterTable';
import type {
  InductionAction,
  InductionEmployee360,
  InductionProgramOverview,
  InductionRosterPage,
  InductionRosterRow,
  InductionTransitionTarget,
} from '../types/models';
import { confirmAction } from '../utils/confirm';
import { canReopenReading, formatDateTime } from '../utils/inductionDashboard';
import { notifyError, notifySuccess } from '../utils/notify';

const cardClass = 'rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/90 p-5 shadow-xl shadow-[rgba(0,65,106,0.08)]';
const DEFAULT_FILTERS: RosterFilters = { q: '', stages: [], alerts: [], page: 1, limit: 30 };
const ATTENTION_ALERTS: RosterFilters['alerts'] = ['LECTURA_VENCIDA', 'EVALUACION_TRUNCADA', 'EVALUACION_VENCIDA', 'NO_ACREDITADA', 'SIN_CUESTIONARIO', 'AVANCE_PENDIENTE'];

type Modal =
  | { kind: 'reopen'; row: InductionRosterRow }
  | { kind: 'retry'; row: InductionRosterRow }
  | { kind: 'reset'; row: InductionRosterRow }
  | { kind: 'data'; row: InductionRosterRow }
  | { kind: 'bulk-reopen'; rows: InductionRosterRow[] }
  | { kind: 'practical'; row: InductionRosterRow }
  | { kind: 'transition'; target: InductionTransitionTarget; candidates: TransitionCandidateRef[] }
  | null;

const parseTransitionsTab = (value: string | null): TransitionsTab =>
  value === 'positions' ? 'positions' : value === '6' ? 6 : value === '7' ? 7 : 5;

/**
 * Tablero de gestión integral de la Inducción (Fases 1-7): panorama del
 * programa, gestión por fase (reglas o configuración por puesto + roster con
 * acciones), bandeja de avance de las fases por puesto (4→5→6→7, para que
 * nadie quede detenido) y expediente 360 por colaborador.
 */
export const RhInductionDashboardPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [overview, setOverview] = useState<InductionProgramOverview | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [roster, setRoster] = useState<InductionRosterPage | null>(null);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [filters, setFilters] = useState<RosterFilters>(DEFAULT_FILTERS);
  const [debouncedQ, setDebouncedQ] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [drawer, setDrawer] = useState<{ employeeId: number; phaseNumber?: number; enrollmentId?: number } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [modal, setModal] = useState<Modal>(null);

  const selectedPhaseId = Number(searchParams.get('phase')) || null;
  const collaboratorsView = !selectedPhaseId && searchParams.get('view') === 'collaborators';
  const transitionsView = !selectedPhaseId && searchParams.get('view') === 'transitions';
  const transitionsTab = parseTransitionsTab(searchParams.get('tab'));
  const selectedEmployeeId = Number(searchParams.get('employee')) || null;
  const selectedPhase = useMemo(() => overview?.phases.find((phase) => phase.phase_id === selectedPhaseId) ?? null, [overview, selectedPhaseId]);

  const loadOverview = useCallback(async () => {
    setLoadingOverview(true);
    try {
      setOverview(await getInductionDashboardOverview());
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo cargar el tablero de inducción.'));
    } finally {
      setLoadingOverview(false);
    }
  }, []);

  const loadRoster = useCallback(async () => {
    if (!selectedPhaseId) {
      setRoster(null);
      return;
    }
    setLoadingRoster(true);
    try {
      setRoster(
        await getInductionPhaseRoster(selectedPhaseId, {
          q: debouncedQ || undefined,
          stages: filters.stages,
          alerts: filters.alerts,
          page: filters.page,
          limit: filters.limit,
        }),
      );
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo cargar el roster de la fase.'));
    } finally {
      setLoadingRoster(false);
    }
  }, [selectedPhaseId, debouncedQ, filters.stages, filters.alerts, filters.page, filters.limit]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedQ(filters.q.trim()), 300);
    return () => window.clearTimeout(handle);
  }, [filters.q]);

  useEffect(() => {
    void loadRoster();
  }, [loadRoster]);

  useEffect(() => {
    setSelected(new Set());
  }, [selectedPhaseId, filters.page, filters.stages, filters.alerts, debouncedQ]);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadOverview(), loadRoster()]);
    setRefreshKey((key) => key + 1);
  }, [loadOverview, loadRoster]);

  const selectPhase = (phaseId: number | null, nextFilters?: Partial<RosterFilters>) => {
    setFilters({ ...DEFAULT_FILTERS, ...nextFilters });
    setSearchParams(phaseId ? { phase: String(phaseId) } : {});
  };

  const openCollaborators = (employeeId?: number) =>
    setSearchParams(employeeId ? { view: 'collaborators', employee: String(employeeId) } : { view: 'collaborators' });

  const openTransitions = (tab: TransitionsTab = 5) => setSearchParams({ view: 'transitions', tab: String(tab) });

  const openTransitionFor = (target: InductionTransitionTarget, employee: InductionEmployee360['employee']) =>
    setModal({
      kind: 'transition',
      target,
      candidates: [{ employee_id: employee.id, employee_name: employee.full_name, position_code: employee.position_name }],
    });

  const runAction = async (label: string, fn: () => Promise<string>, fallback: string) => {
    try {
      const message = await fn();
      notifySuccess(message || label);
      await refreshAll();
    } catch (error) {
      notifyError(getApiErrorMessage(error, fallback));
    }
  };

  const handleAction = async (action: InductionAction, row: InductionRosterRow) => {
    switch (action) {
      case 'REOPEN_READING':
      case 'EXTEND_READING':
      case 'REOPEN_SIGNATURES':
        setModal({ kind: 'reopen', row });
        return;
      case 'AUTHORIZE_RETRY':
        setModal({ kind: 'retry', row });
        return;
      case 'RESET_ATTEMPT':
        setModal({ kind: 'reset', row });
        return;
      case 'COMPLETE_DATA':
        setModal({ kind: 'data', row });
        return;
      case 'GRADE':
        navigate('/rh/grading');
        return;
      case 'CAPTURE_PRACTICAL':
        setModal({ kind: 'practical', row });
        return;
      case 'START_NOW': {
        const ok = await confirmAction(
          'Terminar el descanso ahora',
          `${row.employee_name} está en periodo de descanso (sus lecturas se activarían ${formatDateTime(row.readings_start_at)}). Al confirmar recibe sus lecturas, su plazo empieza a contar y se le envía el SMS de la fase.`,
          'Iniciar lectura ahora',
          'primary',
        );
        if (!ok) return;
        await runAction('Descanso terminado.', () => startDeferredEnrollmentNow(row.enrollment_id), 'No se pudo activar la inscripción.');
        return;
      }
      case 'RESEND_NOTICE': {
        const ok = await confirmAction(
          'Reenviar aviso SMS',
          `Se enviará de nuevo a ${row.employee_name} el SMS con sus lecturas de la Fase ${row.phase_number}${
            row.reading_deadline_at ? ` y su fecha límite (${formatDateTime(row.reading_deadline_at)})` : ''
          }. Consume un crédito SMS.`,
          'Reenviar',
          'primary',
        );
        if (!ok) return;
        await runAction('Aviso reenviado.', () => resendReadingNotice(row.enrollment_id), 'No se pudo reenviar el aviso.');
        return;
      }
      case 'ADVANCE': {
        // De la Fase 4 en adelante el avance depende del puesto: pasa por la
        // misma validación de la bandeja (listo / bloqueado con su motivo).
        if (row.phase_number >= 4) {
          setModal({
            kind: 'transition',
            target: (row.phase_number + 1) as InductionTransitionTarget,
            candidates: [{ employee_id: row.employee_id, employee_name: row.employee_name, position_code: row.position_name }],
          });
          return;
        }
        const ok = await confirmAction(
          `Avanzar a la Fase ${row.phase_number + 1}`,
          `${row.employee_name} aprobó la Fase ${row.phase_number}. ${
            row.next_phase_published
              ? 'Quedará inscrito con sus lecturas asignadas desde ahora y recibirá un SMS.'
              : 'La siguiente fase sigue en borrador: quedará en espera hasta publicarla.'
          }`,
          'Avanzar',
          'primary',
        );
        if (!ok) return;
        await runAction('Avance registrado.', async () => (await advanceEnrollment(row.enrollment_id)).message, 'No se pudo avanzar al colaborador.');
        return;
      }
      case 'ISSUE_CERTIFICATE': {
        const ok = await confirmAction(
          'Emitir constancia',
          `Se emitirá la constancia oficial de la Fase ${row.phase_number} para ${row.employee_name} y se archivará en su expediente.${
            row.missing_branch || row.missing_position ? ' Faltan sucursal/puesto: la constancia saldrá incompleta; captúralos primero si lo prefieres.' : ''
          }`,
          'Emitir',
          'primary',
        );
        if (!ok) return;
        await runAction('Constancia emitida.', async () => (await issueEnrollmentCertificate(row.enrollment_id)).message, 'No se pudo emitir la constancia.');
        return;
      }
      case 'UNENROLL': {
        const ok = await confirmAction(
          'Dar de baja de la fase',
          `Se elimina la inscripción de ${row.employee_name} en la Fase ${row.phase_number}. Sus acuses pendientes se retiran; los firmados y las evaluaciones presentadas se conservan.`,
          'Dar de baja',
          'danger',
        );
        if (!ok) return;
        await runAction('Inscripción eliminada.', async () => {
          await removeEnrollment(row.enrollment_id);
          return 'Inscripción eliminada.';
        }, 'No se pudo dar de baja la inscripción.');
        return;
      }
      default:
        return;
    }
  };

  const toggleSelect = (enrollmentId: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(enrollmentId)) next.delete(enrollmentId);
      else next.add(enrollmentId);
      return next;
    });

  const toggleSelectAll = (rows: InductionRosterRow[]) =>
    setSelected((prev) => {
      const all = rows.every((row) => prev.has(row.enrollment_id));
      return all ? new Set() : new Set(rows.map((row) => row.enrollment_id));
    });

  const waitingTransitions = overview ? overview.transitions.reduce((acc, item) => acc + item.READY + item.BLOCKED, 0) : 0;

  const pendingReaders = roster ? Object.entries(roster.stage_counts).reduce((acc, [stage, count]) => (['SIN_INICIAR', 'LEYENDO', 'LECTURA_VENCIDA'].includes(stage) ? acc + count : acc), 0) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--color-brand-500)]">Programa de Inducción</p>
          <h1 className="mt-2 text-3xl font-bold text-[var(--color-brand-700)]">Tablero de Inducción</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--unilabor-neutral)]">
            Gestión integral de las 7 fases. En las Fases 1-4 cada colaborador avanza a su ritmo; en las Fases 5-7 (por puesto) RH lo mueve
            desde la bandeja de avance, que muestra a cada quien listo o bloqueado con su motivo para que nadie se quede detenido. Desde
            aquí se resuelven lecturas vencidas, intentos truncados, reevaluaciones, prácticas, avances y constancias.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void refreshAll()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] hover:bg-[rgba(124,173,211,0.3)]"
          >
            <RefreshCw size={15} className={loadingOverview || loadingRoster ? 'animate-spin' : ''} /> Actualizar
          </button>
          <button
            type="button"
            onClick={() => navigate('/rh/induction')}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[rgba(0,65,106,0.14)] bg-white px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] hover:bg-[rgba(191,212,230,0.3)]"
          >
            <Settings2 size={15} /> Configurar fases
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => selectPhase(null)}
          className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold transition ${
            !selectedPhaseId && !collaboratorsView && !transitionsView ? 'bg-[var(--color-brand-700)] text-white' : 'bg-[rgba(191,212,230,0.4)] text-[var(--color-brand-700)] hover:bg-[rgba(124,173,211,0.3)]'
          }`}
        >
          <LayoutDashboard size={14} /> Panorama
        </button>
        <button
          type="button"
          onClick={() => openCollaborators(selectedEmployeeId ?? undefined)}
          className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold transition ${
            collaboratorsView ? 'bg-[var(--color-brand-700)] text-white' : 'bg-[rgba(191,212,230,0.4)] text-[var(--color-brand-700)] hover:bg-[rgba(124,173,211,0.3)]'
          }`}
        >
          <Users size={14} /> Por colaborador
        </button>
        <button
          type="button"
          onClick={() => openTransitions(transitionsView ? transitionsTab : 5)}
          className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold transition ${
            transitionsView ? 'bg-[var(--color-brand-700)] text-white' : 'bg-[rgba(191,212,230,0.4)] text-[var(--color-brand-700)] hover:bg-[rgba(124,173,211,0.3)]'
          }`}
        >
          <StepForward size={14} /> Bandeja de avance
          {waitingTransitions > 0 ? <span className="rounded-full bg-rose-500 px-1.5 text-[10px] text-white">{waitingTransitions}</span> : null}
        </button>
        {overview?.phases.map((phase) => (
          <button
            key={phase.phase_id}
            type="button"
            onClick={() => selectPhase(phase.phase_id)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
              selectedPhaseId === phase.phase_id ? 'bg-[var(--color-brand-700)] text-white' : 'bg-[rgba(191,212,230,0.4)] text-[var(--color-brand-700)] hover:bg-[rgba(124,173,211,0.3)]'
            }`}
          >
            Fase {phase.phase_number}
            <span className="ml-1.5 rounded-full bg-white/70 px-1.5 text-[10px] text-[var(--color-brand-700)]">{phase.enrolled}</span>
          </button>
        ))}
        {overview ? (
          <button
            type="button"
            onClick={() => openTransitions(7)}
            className={`inline-flex items-center gap-1 rounded-full px-4 py-1.5 text-sm font-semibold transition ${
              transitionsView && transitionsTab === 7 ? 'bg-[var(--color-brand-700)] text-white' : 'bg-[rgba(191,212,230,0.4)] text-[var(--color-brand-700)] hover:bg-[rgba(124,173,211,0.3)]'
            }`}
          >
            <Award size={13} /> Fase 7
            <span className="ml-1 rounded-full bg-white/70 px-1.5 text-[10px] text-[var(--color-brand-700)]">
              {overview.phase7.in_process + overview.phase7.pending_authorization + overview.phase7.approved + overview.phase7.not_approved}
            </span>
          </button>
        ) : null}
      </div>

      {transitionsView ? (
        <InductionTransitionsView
          tab={transitionsTab}
          overview={overview}
          refreshKey={refreshKey}
          onTabChange={(tab) => openTransitions(tab)}
          onChanged={() => void refreshAll()}
          onOpenEmployee={(employeeId) => setDrawer({ employeeId })}
        />
      ) : collaboratorsView ? (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(320px,0.34fr)_minmax(0,1fr)]">
          <aside className={`${cardClass} self-start`}>
            <h2 className="text-lg font-bold text-[var(--color-brand-700)]">Colaboradores</h2>
            <p className="mb-3 text-xs text-[var(--unilabor-neutral)]">Inscritos en el programa (Fases 1-7). Elige uno para ver su resumen y el detalle de cada fase.</p>
            <InductionCollaboratorDirectory selectedEmployeeId={selectedEmployeeId} refreshKey={refreshKey} onSelect={(employeeId) => openCollaborators(employeeId)} />
          </aside>
          <section className={cardClass}>
            {selectedEmployeeId ? (
              <InductionCollaboratorSummary
                key={selectedEmployeeId}
                employeeId={selectedEmployeeId}
                refreshKey={refreshKey}
                onAction={handleAction}
                onTransition={openTransitionFor}
              />
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
                <Users size={28} className="text-[var(--color-brand-300)]" />
                <p className="text-sm font-semibold text-[var(--color-brand-700)]">Selecciona un colaborador</p>
                <p className="max-w-sm text-xs text-[var(--unilabor-neutral)]">
                  Verás su avance en las 7 fases, documentos firmados, intentos de evaluación, constancias y la bitácora de gestión de RH.
                </p>
              </div>
            )}
          </section>
        </div>
      ) : loadingOverview && !overview ? (
        <div className={`${cardClass} flex items-center justify-center py-12`}>
          <Loader2 size={22} className="animate-spin text-[var(--unilabor-neutral)]" />
        </div>
      ) : overview && !selectedPhase ? (
        <>
          <InductionProgramKpis
            overview={overview}
            onFocusAttention={() => {
              const first = overview.phases.find((phase) => ATTENTION_ALERTS.some((alert) => (phase.alert_counts[alert] ?? 0) > 0));
              if (first) selectPhase(first.phase_id, { alerts: ATTENTION_ALERTS });
            }}
            onOpenTransitions={() => {
              const first = overview.transitions.find((item) => item.READY + item.BLOCKED > 0);
              openTransitions(first?.target ?? 5);
            }}
          />
          <section className={cardClass}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-[var(--color-brand-700)]">Embudo por fase</h2>
                <p className="text-xs text-[var(--unilabor-neutral)]">Inscritos de cada fase según su etapa. Haz clic en una barra para gestionar la fase.</p>
              </div>
              <p className="text-[11px] text-[var(--unilabor-neutral)]">Actualizado {formatDateTime(overview.generated_at)}</p>
            </div>
            <InductionPhaseFunnelChart phases={overview.phases} onSelectPhase={(phaseId) => selectPhase(phaseId)} />
          </section>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {overview.phases.map((phase) => (
              <InductionPhaseCard key={phase.phase_id} phase={phase} onOpen={(phaseId) => selectPhase(phaseId)} />
            ))}
            <InductionPhase7Card phase7={overview.phase7} onOpen={() => openTransitions(7)} />
          </div>
        </>
      ) : overview && selectedPhase ? (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(300px,0.34fr)_minmax(0,1fr)]">
          <aside>
            <div className="mb-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-brand-500)]">Fase {selectedPhase.phase_number}</p>
              <h2 className="text-xl font-bold text-[var(--color-brand-700)]">{selectedPhase.name}</h2>
              <p className="text-xs text-[var(--unilabor-neutral)]">
                {selectedPhase.enrolled} inscritos · {selectedPhase.stage_counts.APROBADA ?? 0} aprobados
                {selectedPhase.pending_advance > 0 ? ` · ${selectedPhase.pending_advance} por avanzar` : ''}
              </p>
            </div>
            {selectedPhase.scope === 'POSITION' ? (
              <InductionPositionPhasePanel
                phase={selectedPhase}
                onOpenTransitions={() => openTransitions(selectedPhase.phase_number as InductionTransitionTarget)}
                onOpenPositions={() => openTransitions('positions')}
              />
            ) : (
              <InductionPhaseRulesPanel phase={selectedPhase} pendingReaders={pendingReaders} onChanged={refreshAll} />
            )}
          </aside>
          <section className={cardClass}>
            <InductionRosterTable
              roster={roster}
              loading={loadingRoster}
              filters={filters}
              onFiltersChange={setFilters}
              selected={selected}
              onToggleSelect={toggleSelect}
              onToggleSelectAll={toggleSelectAll}
              onOpenEmployee={(row) => setDrawer({ employeeId: row.employee_id, phaseNumber: row.phase_number, enrollmentId: row.enrollment_id })}
              onAction={handleAction}
              onBulkReopen={() => {
                const rows = (roster?.rows ?? []).filter(
                  (row) => selected.has(row.enrollment_id) && canReopenReading(row),
                );
                if (rows.length > 0) setModal({ kind: 'bulk-reopen', rows });
              }}
            />
          </section>
        </div>
      ) : null}

      <AnimatePresence>
        {drawer ? (
          <InductionCollaboratorDrawer
            key={drawer.employeeId}
            employeeId={drawer.employeeId}
            focusPhaseNumber={drawer.phaseNumber}
            focusEnrollmentId={drawer.enrollmentId}
            refreshKey={refreshKey}
            onClose={() => setDrawer(null)}
            onAction={handleAction}
            onTransition={openTransitionFor}
          />
        ) : null}
      </AnimatePresence>

      {modal?.kind === 'reopen' ? <InductionReopenReadingModal enrollment={modal.row} onClose={() => setModal(null)} onReopened={() => void refreshAll()} /> : null}
      {modal?.kind === 'retry' ? <InductionRetryModal enrollment={modal.row} onClose={() => setModal(null)} onAuthorized={() => void refreshAll()} /> : null}
      {modal?.kind === 'reset' ? <InductionResetAttemptModal row={modal.row} onClose={() => setModal(null)} onDone={() => void refreshAll()} /> : null}
      {modal?.kind === 'practical' ? <InductionPracticalCaptureModal row={modal.row} onClose={() => setModal(null)} onDone={() => void refreshAll()} /> : null}
      {modal?.kind === 'transition' ? (
        <InductionTransitionModal target={modal.target} candidates={modal.candidates} onClose={() => setModal(null)} onDone={() => void refreshAll()} />
      ) : null}
      {modal?.kind === 'bulk-reopen' ? <InductionBulkReopenModal rows={modal.rows} onClose={() => setModal(null)} onDone={() => void refreshAll()} /> : null}
      {modal?.kind === 'data' ? (
        <EnrollmentCertificateDataModal
          employeeId={modal.row.employee_id}
          employeeName={modal.row.employee_name}
          missingBranch={modal.row.missing_branch}
          missingPosition={modal.row.missing_position}
          onClose={() => setModal(null)}
          onSaved={() => void refreshAll()}
        />
      ) : null}
    </div>
  );
};
