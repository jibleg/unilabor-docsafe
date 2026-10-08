import { useState } from 'react';
import { motion } from 'motion/react';
import { Loader2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { defaultOpenPhase, useInductionEmployee360 } from '../../../hooks/useInductionEmployee360';
import { InductionAuditLog } from './InductionAuditLog';
import { InductionPhaseDetail } from './InductionPhaseDetail';
import { InductionTrackStepper } from './InductionTrackStepper';
import type { InductionAction, InductionEmployee360, InductionRosterRow, InductionTransitionTarget } from '../../../types/models';

interface InductionCollaboratorDrawerProps {
  employeeId: number;
  /** Fase que se muestra expandida al abrir (la del roster desde donde se abrió). */
  focusPhaseNumber?: number;
  /** Fases por puesto: inscripcion (puesto) que se abrio desde la fila; si no, el puesto en curso. */
  focusEnrollmentId?: number;
  refreshKey: number;
  onClose: () => void;
  onAction: (action: InductionAction, row: InductionRosterRow) => void;
  /** Mover al colaborador a una fase por puesto (5-7) desde su ruta. */
  onTransition: (target: InductionTransitionTarget, employee: InductionEmployee360['employee']) => void;
}

/**
 * Vista 360 del colaborador en la Inducción: ruta de las 7 fases, detalle de
 * cada inscripción (lectura documento por documento, intentos, constancia),
 * estado de avance a las fases por puesto y bitácora de acciones de RH. Las
 * acciones se delegan a la página.
 */
export const InductionCollaboratorDrawer = ({
  employeeId,
  focusPhaseNumber,
  focusEnrollmentId,
  refreshKey,
  onClose,
  onAction,
  onTransition,
}: InductionCollaboratorDrawerProps) => {
  const navigate = useNavigate();
  const { detail, loading } = useInductionEmployee360(employeeId, refreshKey);
  const [openPhase, setOpenPhase] = useState<number | null>(focusPhaseNumber ?? null);

  const shownPhase = openPhase ?? (detail ? defaultOpenPhase(detail) : null);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="presentation">
      <motion.div
        className="absolute inset-0 bg-black/40"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
      />
      <motion.aside
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'tween', duration: 0.24, ease: 'easeOut' }}
        className="relative flex h-full w-full max-w-2xl flex-col overflow-y-auto bg-[rgba(248,251,253,1)] shadow-2xl"
        role="dialog"
        aria-modal="true"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-[rgba(0,65,106,0.1)] bg-white px-6 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-500)]">Expediente de inducción</p>
            {detail ? (
              <>
                <h2 className="mt-0.5 text-lg font-bold text-[var(--color-brand-700)]">{detail.employee.full_name}</h2>
                <p className="text-xs text-[var(--unilabor-neutral)]">
                  {detail.employee.employee_code}
                  {detail.employee.position_name ? ` · ${detail.employee.position_name}` : ''}
                  {detail.employee.branch_name ? ` · ${detail.employee.branch_name}` : ''}
                  {detail.employee.area ? ` · ${detail.employee.area}` : ''}
                </p>
              </>
            ) : (
              <h2 className="mt-0.5 text-lg font-bold text-[var(--color-brand-700)]">Cargando…</h2>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/rh/expedients')}
              className="rounded-lg border border-[rgba(0,65,106,0.14)] px-2 py-1 text-[11px] font-semibold text-[var(--color-brand-700)] hover:bg-[rgba(191,212,230,0.3)]"
            >
              Ver expediente RH
            </button>
            <button type="button" onClick={onClose} className="rounded-lg p-1 text-[var(--unilabor-neutral)] hover:bg-slate-100" aria-label="Cerrar">
              <X size={18} />
            </button>
          </div>
        </div>

        {loading && !detail ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 size={22} className="animate-spin text-[var(--unilabor-neutral)]" />
          </div>
        ) : detail ? (
          <div className="flex-1 space-y-6 px-6 py-5">
            <InductionTrackStepper detail={detail} openPhase={shownPhase} onSelectPhase={setOpenPhase} />

            <InductionPhaseDetail
              detail={detail}
              phaseNumber={shownPhase}
              initialEnrollmentId={shownPhase === focusPhaseNumber ? focusEnrollmentId : undefined}
              onAction={onAction}
              onTransition={(target) => onTransition(target, detail.employee)}
            />

            <InductionAuditLog audit={detail.audit} />
          </div>
        ) : null}
      </motion.aside>
    </div>
  );
};
