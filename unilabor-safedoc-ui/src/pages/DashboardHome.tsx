import { Activity, Clock, FileText, Users } from 'lucide-react';

export const DashboardHome = () => {
  const stats = [
    {
      label: 'Documentos vigentes',
      value: '124',
      icon: FileText,
      color: 'text-[var(--color-brand-200)]',
      bg: 'bg-[rgba(0,105,166,0.16)]',
    },
    {
      label: 'Usuarios activos',
      value: '12',
      icon: Users,
      color: 'text-[var(--color-brand-300)]',
      bg: 'bg-[rgba(124,173,211,0.14)]',
    },
    {
      label: 'Revisiones pendientes',
      value: '3',
      icon: Clock,
      color: 'text-[var(--color-brand-500)]',
      bg: 'bg-[rgba(151,163,172,0.18)]',
    },
    {
      label: 'Estado del sistema',
      value: 'Óptimo',
      icon: Activity,
      color: 'text-[var(--color-brand-700)]',
      bg: 'bg-[rgba(191,212,230,0.32)]',
    },
  ];

  return (
    <div className="space-y-8">
      <div className="overflow-hidden rounded-3xl border border-[rgba(0,65,106,0.1)] bg-[linear-gradient(135deg,#ffffff_0%,#eef5fa_56%,#dbe8f2_100%)] shadow-xl shadow-[rgba(0,65,106,0.1)]">
        <div className="bg-[radial-gradient(circle_at_top_right,rgba(124,173,211,0.22),transparent_28%)] px-6 py-7">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--color-brand-500)]">
            Unilabor
          </p>
          <h1 className="mt-2 text-3xl font-bold text-[var(--color-brand-700)]">Panel de control</h1>
          <p className="mt-2 text-[var(--unilabor-neutral)]">
            Bienvenido al sistema de gestion documental alineado a la identidad institucional.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/88 p-6 backdrop-blur-xl shadow-xl shadow-[rgba(0,65,106,0.08)]"
          >
            <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl ${stat.bg} ${stat.color}`}>
              <stat.icon size={24} />
            </div>
            <p className="text-sm font-medium text-[var(--unilabor-neutral)]">{stat.label}</p>
            <p className="mt-1 text-2xl font-bold text-[var(--color-brand-700)]">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(239,245,250,0.96))] p-6 backdrop-blur-xl shadow-xl shadow-[rgba(0,65,106,0.08)]">
        <h3 className="mb-4 font-bold text-[var(--color-brand-700)]">Actividad reciente</h3>
        <div className="py-10 text-center text-sm text-[var(--unilabor-neutral)]">No hay registros recientes para mostrar.</div>
      </div>
    </div>
  );
};
