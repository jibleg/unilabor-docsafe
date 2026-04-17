import { useEffect, useState } from 'react';
import { Building2, FolderKanban, ShieldCheck, Users } from 'lucide-react';
import { getApiErrorMessage, getEmployeeSummary } from '../api/service';
import type { EmployeeSummary } from '../types/models';
import { notifyError } from '../utils/notify';

const EMPTY_SUMMARY: EmployeeSummary = {
  total: 0,
  active: 0,
  linked_users: 0,
  unlinked_users: 0,
};

export const RhDashboardPage = () => {
  const [summary, setSummary] = useState<EmployeeSummary>(EMPTY_SUMMARY);

  useEffect(() => {
    let mounted = true;

    const loadSummary = async () => {
      try {
        const response = await getEmployeeSummary();
        if (mounted) {
          setSummary(response);
        }
      } catch (error) {
        notifyError(getApiErrorMessage(error, 'No se pudo cargar el resumen de RH.'));
      }
    };

    void loadSummary();

    return () => {
      mounted = false;
    };
  }, []);

  const summaryCards = [
    { label: 'Colaboradores', value: summary.total, icon: Users },
    { label: 'Activos', value: summary.active, icon: FolderKanban },
    { label: 'Con usuario vinculado', value: summary.linked_users, icon: ShieldCheck },
  ];

  return (
    <div className="space-y-8">
      <div className="overflow-hidden rounded-3xl border border-[rgba(0,65,106,0.1)] bg-[linear-gradient(135deg,#ffffff_0%,#eef5fa_56%,#dbe8f2_100%)] shadow-xl shadow-[rgba(0,65,106,0.1)]">
        <div className="bg-[radial-gradient(circle_at_top_right,rgba(124,173,211,0.22),transparent_28%)] px-6 py-7">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--color-brand-500)]">
            Recursos Humanos
          </p>
          <h1 className="mt-2 text-3xl font-bold text-[var(--color-brand-700)]">Panel RH</h1>
          <p className="mt-2 text-[var(--unilabor-neutral)]">
            Sprint 2 ya habilita la base real de colaboradores, vinculacion opcional con usuarios y espacio navegable propio para RH.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {summaryCards.map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/88 p-6 backdrop-blur-xl shadow-xl shadow-[rgba(0,65,106,0.08)]"
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[rgba(191,212,230,0.32)] text-[var(--color-brand-700)]">
              <card.icon size={24} />
            </div>
            <p className="text-sm font-medium text-[var(--unilabor-neutral)]">{card.label}</p>
            <p className="mt-1 text-2xl font-bold text-[var(--color-brand-700)]">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.25fr_1fr]">
        <div className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(239,245,250,0.96))] p-6 backdrop-blur-xl shadow-xl shadow-[rgba(0,65,106,0.08)]">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[rgba(0,65,106,0.08)] bg-[rgba(191,212,230,0.3)] text-[var(--color-brand-700)]">
              <Building2 size={22} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[var(--color-brand-700)]">Base RH lista para crecer</h2>
              <p className="mt-2 text-sm leading-7 text-[var(--unilabor-neutral)]">
                Ya puedes administrar colaboradores, vincularlos con usuarios del sistema y dejar preparada la estructura que alimentara expedientes, documentos sensibles y portal del colaborador.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/88 p-6 backdrop-blur-xl shadow-xl shadow-[rgba(0,65,106,0.08)]">
          <h2 className="text-lg font-bold text-[var(--color-brand-700)]">Proximo paso natural</h2>
          <p className="mt-2 text-sm leading-7 text-[var(--unilabor-neutral)]">
            La siguiente capa del producto sera la estructura documental RH: secciones, tipos documentales y expediente por colaborador.
          </p>
          <div className="mt-4 rounded-2xl border border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.95)] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Sin vincular</p>
            <p className="mt-1 text-2xl font-bold text-[var(--color-brand-700)]">{summary.unlinked_users}</p>
            <p className="mt-2 text-xs text-[var(--unilabor-neutral)]">
              colaboradores aun sin usuario del sistema asociado
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
