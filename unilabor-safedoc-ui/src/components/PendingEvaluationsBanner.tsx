import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight, GraduationCap, X } from 'lucide-react';
import { usePendingEvaluations } from '../hooks/usePendingEvaluations';

/**
 * Aviso in-app de PRIORIDAD que se muestra al ingresar cuando el colaborador
 * tiene evaluaciones de capacitacion pendientes (con ventana de 72h vigente).
 * Disenado para resaltar como accion requerida. Es descartable por sesion de vista.
 */
export const PendingEvaluationsBanner = () => {
  const { count, loading } = usePendingEvaluations(true);
  const [dismissed, setDismissed] = useState(false);

  const visible = !loading && count > 0 && !dismissed;
  const plural = count === 1 ? '' : 'es';

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -14 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="relative mb-5 overflow-hidden rounded-2xl border border-amber-300/70 bg-[linear-gradient(120deg,#fffaf0_0%,#fff4e0_45%,rgba(255,255,255,0.9)_100%)] shadow-[0_14px_34px_rgba(180,120,10,0.14)]"
        >
          {/* Franja lateral de prioridad */}
          <span className="absolute inset-y-0 left-0 w-1.5 bg-[linear-gradient(180deg,#f59e0b,#d97706)]" />

          <div className="flex flex-col gap-3 py-3 pl-5 pr-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              {/* Icono con indicador pulsante */}
              <div className="relative shrink-0">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--color-brand-700)] text-white shadow-sm">
                  <GraduationCap size={22} />
                </span>
                <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5">
                  <motion.span
                    className="absolute inline-flex h-full w-full rounded-full bg-amber-400"
                    animate={{ scale: [1, 1.8], opacity: [0.7, 0] }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut' }}
                  />
                  <span className="relative inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-white">
                    {count}
                  </span>
                </span>
              </div>

              <div>
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                  Acción requerida
                </span>
                <p className="mt-1 text-sm font-bold text-[var(--color-brand-700)]">
                  Tienes {count} evaluación{plural} de capacitación pendiente{plural}
                </p>
                <p className="text-xs text-[var(--unilabor-ink)]">
                  Cuentas con <span className="font-semibold text-amber-700">72 horas</span> desde su disponibilidad
                  para realizarla. Después deberás solicitar autorización a RH.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center">
              <Link
                to="/rh/my-evaluations"
                className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--color-brand-700)] px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:opacity-90"
              >
                Realizar ahora <ArrowRight size={14} />
              </Link>
              <button
                type="button"
                onClick={() => setDismissed(true)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-brand-700)] transition hover:bg-white/70"
                aria-label="Descartar aviso"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
