import { Activity, Clock, FileText, Users } from 'lucide-react';

export const DashboardHome = () => {
  const stats = [
    {
      label: 'Documentos vigentes',
      value: '124',
      icon: FileText,
      color: 'text-cyan-300',
      bg: 'bg-cyan-500/15',
    },
    {
      label: 'Usuarios activos',
      value: '12',
      icon: Users,
      color: 'text-sky-300',
      bg: 'bg-sky-500/15',
    },
    {
      label: 'Revisiones pendientes',
      value: '3',
      icon: Clock,
      color: 'text-amber-300',
      bg: 'bg-amber-500/15',
    },
    {
      label: 'Estado del sistema',
      value: 'Optimo',
      icon: Activity,
      color: 'text-emerald-300',
      bg: 'bg-emerald-500/15',
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-100">Panel de control</h1>
        <p className="text-slate-400">Bienvenido al sistema de gestion Unilabor.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 backdrop-blur-xl shadow-xl shadow-slate-950/40"
          >
            <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl ${stat.bg} ${stat.color}`}>
              <stat.icon size={24} />
            </div>
            <p className="text-sm font-medium text-slate-400">{stat.label}</p>
            <p className="mt-1 text-2xl font-bold text-slate-100">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 backdrop-blur-xl shadow-xl shadow-slate-950/40">
        <h3 className="mb-4 font-bold text-slate-100">Actividad reciente</h3>
        <div className="py-10 text-center text-sm text-slate-500">No hay registros recientes para mostrar.</div>
      </div>
    </div>
  );
};
