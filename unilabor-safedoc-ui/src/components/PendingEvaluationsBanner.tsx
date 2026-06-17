import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { GraduationCap, X } from 'lucide-react';
import { usePendingEvaluations } from '../hooks/usePendingEvaluations';

/**
 * Aviso in-app que se muestra al ingresar cuando el colaborador tiene
 * evaluaciones de capacitacion pendientes (con ventana de 72h vigente).
 * Es descartable por sesion de vista.
 */
export const PendingEvaluationsBanner = () => {
  const { count, loading } = usePendingEvaluations(true);
  const [dismissed, setDismissed] = useState(false);

  const visible = !loading && count > 0 && !dismissed;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-[rgba(0,65,106,0.14)] bg-[linear-gradient(135deg,rgba(191,212,230,0.5),rgba(124,173,211,0.22))] px-4 py-3 shadow-[0_12px_28px_rgba(0,65,106,0.08)]"
        >
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/80 text-[var(--color-brand-700)]">
              <GraduationCap size={20} />
            </span>
            <div>
              <p className="text-sm font-bold text-[var(--color-brand-700)]">
                Tienes {count} evaluacion{count === 1 ? '' : 'es'} de capacitacion pendiente{count === 1 ? '' : 's'}
              </p>
              <p className="text-xs text-[var(--unilabor-ink)]">
                Cuentas con 72 horas desde su disponibilidad para realizarla. Revisa el detalle en tu modulo de
                evaluaciones.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/rh/my-evaluations"
              className="rounded-xl border border-[rgba(0,65,106,0.14)] bg-white/85 px-3 py-2 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-white"
            >
              Ver evaluaciones
            </Link>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-brand-700)] transition hover:bg-white/60"
              aria-label="Descartar aviso"
            >
              <X size={16} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
