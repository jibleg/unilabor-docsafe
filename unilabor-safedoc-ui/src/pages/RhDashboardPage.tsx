import { Building2, FolderKanban, ShieldCheck, Users } from 'lucide-react';

const summaryCards = [
  { label: 'Colaboradores', value: '0', icon: Users },
  { label: 'Expedientes activos', value: '0', icon: FolderKanban },
  { label: 'Documentos sensibles', value: '0', icon: ShieldCheck },
];

export const RhDashboardPage = () => {
  return (
    <div className="space-y-8">
      <div className="overflow-hidden rounded-3xl border border-[rgba(0,65,106,0.1)] bg-[linear-gradient(135deg,#ffffff_0%,#eef5fa_56%,#dbe8f2_100%)] shadow-xl shadow-[rgba(0,65,106,0.1)]">
        <div className="bg-[radial-gradient(circle_at_top_right,rgba(124,173,211,0.22),transparent_28%)] px-6 py-7">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--color-brand-500)]">
            Recursos Humanos
          </p>
          <h1 className="mt-2 text-3xl font-bold text-[var(--color-brand-700)]">Panel RH</h1>
          <p className="mt-2 text-[var(--unilabor-neutral)]">
            El acceso multi-modulo ya reconoce `RH` como espacio independiente y esta listo para recibir las siguientes iteraciones funcionales.
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

      <div className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(239,245,250,0.96))] p-6 backdrop-blur-xl shadow-xl shadow-[rgba(0,65,106,0.08)]">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[rgba(0,65,106,0.08)] bg-[rgba(191,212,230,0.3)] text-[var(--color-brand-700)]">
            <Building2 size={22} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[var(--color-brand-700)]">Base RH preparada</h2>
            <p className="mt-2 text-sm leading-7 text-[var(--unilabor-neutral)]">
              En el siguiente sprint empezaremos a construir colaboradores, expediente y estructura documental propia para Recursos Humanos.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
