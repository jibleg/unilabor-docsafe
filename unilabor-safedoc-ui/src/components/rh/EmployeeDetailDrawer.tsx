import { AnimatePresence, motion } from 'motion/react';
import { Edit3, FileCog, Loader2, UserCog, X } from 'lucide-react';
import type { Employee } from '../../types/models';
import { EmployeeXlabLinkCard } from './EmployeeXlabLinkCard';

interface EmployeeDetailDrawerProps {
  /** Abierto mientras carga o cuando ya hay colaborador. */
  open: boolean;
  loading: boolean;
  employee: Employee | null;
  onClose: () => void;
  onEdit: (employee: Employee) => void;
  onConfigureAccess: (employee: Employee) => void;
  onXlabLinkChange: (linked: boolean) => void;
}

const cardClass = 'rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/90 p-4';
const labelClass = 'text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]';

/** Ficha del colaborador en RH → Colaboradores: datos base, usuario vinculado y XLab. */
export const EmployeeDetailDrawer = ({ open, loading, employee, onClose, onEdit, onConfigureAccess, onXlabLinkChange }: EmployeeDetailDrawerProps) => (
  <AnimatePresence>
    {open ? (
      <div className="fixed inset-0 z-50 flex justify-end" role="presentation">
        <motion.div
          className="absolute inset-0 bg-[rgba(11,34,53,0.32)] backdrop-blur-sm"
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
          className="relative flex h-full w-full max-w-lg flex-col bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(239,245,250,0.98))] shadow-2xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="employee-detail-title"
        >
          <div className="flex items-center justify-between gap-3 border-b border-[rgba(0,65,106,0.1)] px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[rgba(191,212,230,0.32)] text-[var(--color-brand-700)]">
                <UserCog size={22} />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-500)]">Detalle</p>
                <h2 id="employee-detail-title" className="text-lg font-bold text-[var(--color-brand-700)]">
                  Ficha del colaborador
                </h2>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1 text-[var(--unilabor-neutral)] transition hover:bg-slate-100"
              aria-label="Cerrar"
              title="Cerrar"
            >
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            {loading || !employee ? (
              <div className="flex items-center gap-3 text-sm text-[var(--unilabor-neutral)]">
                <Loader2 size={16} className="animate-spin" />
                Cargando detalle...
              </div>
            ) : (
              <div className="space-y-4">
                <div className={cardClass}>
                  <p className={labelClass}>Código</p>
                  <p className="mt-1 text-lg font-bold text-[var(--color-brand-700)]">{employee.employee_code}</p>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className={cardClass}>
                    <p className={labelClass}>Nombre</p>
                    <p className="mt-1 text-sm font-semibold text-[var(--color-brand-700)]">{employee.full_name}</p>
                  </div>
                  <div className={cardClass}>
                    <p className={labelClass}>Correo</p>
                    <p className="mt-1 wrap-break-word text-sm text-[var(--unilabor-ink)]">{employee.email}</p>
                  </div>
                  <div className={cardClass}>
                    <p className={labelClass}>Sección / Departamento</p>
                    <p className="mt-1 text-sm text-[var(--unilabor-ink)]">{employee.area || 'Sin sección'}</p>
                  </div>
                  <div className={cardClass}>
                    <p className={labelClass}>Puesto</p>
                    <p className="mt-1 text-sm text-[var(--unilabor-ink)]">{employee.position || 'Sin puesto'}</p>
                  </div>
                </div>

                <div className={cardClass}>
                  <p className={labelClass}>Usuario vinculado</p>
                  {employee.linked_user ? (
                    <div className="mt-3 space-y-2">
                      <p className="text-sm font-semibold text-[var(--color-brand-700)]">{employee.linked_user.full_name}</p>
                      <p className="wrap-break-word text-xs text-[var(--unilabor-neutral)]">{employee.linked_user.email}</p>
                      <div className="flex flex-wrap gap-2">
                        {employee.linked_user.modules.map((moduleAccess) => (
                          <span
                            key={`${employee.linked_user?.id}-${moduleAccess.code}`}
                            className="rounded-full border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.34)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--color-brand-700)]"
                          >
                            {moduleAccess.code}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-[var(--unilabor-neutral)]">Aún no tiene usuario del sistema asociado.</p>
                  )}
                </div>

                {employee.user_id ? <EmployeeXlabLinkCard key={`${employee.id}-${employee.user_id}`} employeeId={employee.id} onChange={onXlabLinkChange} /> : null}

                <button
                  type="button"
                  onClick={() => onEdit(employee)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.34)] px-4 py-2.5 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)]"
                >
                  <Edit3 size={16} />
                  Editar colaborador
                </button>

                <button
                  type="button"
                  onClick={() => onConfigureAccess(employee)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.34)] px-4 py-2.5 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)]"
                >
                  <FileCog size={16} />
                  Configurar expediente documental
                </button>
              </div>
            )}
          </div>
        </motion.aside>
      </div>
    ) : null}
  </AnimatePresence>
);
