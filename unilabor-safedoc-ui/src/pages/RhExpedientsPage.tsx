import { FileStack, ShieldCheck, UserSquare2 } from 'lucide-react';

const cards = [
  {
    title: 'Estructura lista',
    description: 'El expediente RH ya tiene base de colaboradores para vincular documentos por persona.',
    icon: UserSquare2,
  },
  {
    title: 'Siguiente iteracion',
    description: 'Aqui construiremos secciones, tipos documentales y carga por colaborador.',
    icon: FileStack,
  },
  {
    title: 'Seguridad prevista',
    description: 'La separacion multi-modulo ya permite que RH evolucione con permisos propios.',
    icon: ShieldCheck,
  },
];

export const RhExpedientsPage = () => {
  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-3xl border border-[rgba(0,65,106,0.1)] bg-[linear-gradient(135deg,#ffffff_0%,#eef5fa_56%,#dbe8f2_100%)] shadow-xl shadow-[rgba(0,65,106,0.1)]">
        <div className="bg-[radial-gradient(circle_at_top_right,rgba(124,173,211,0.22),transparent_28%)] px-6 py-7">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--color-brand-500)]">
            Recursos Humanos
          </p>
          <h1 className="mt-2 text-3xl font-bold text-[var(--color-brand-700)]">Expedientes</h1>
          <p className="mt-2 max-w-3xl text-sm text-[var(--unilabor-neutral)]">
            Este espacio queda habilitado desde Sprint 2 como antesala del expediente digital del colaborador.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {cards.map((card) => (
          <div
            key={card.title}
            className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/88 p-6 shadow-xl shadow-[rgba(0,65,106,0.08)] backdrop-blur-xl"
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[rgba(191,212,230,0.32)] text-[var(--color-brand-700)]">
              <card.icon size={22} />
            </div>
            <h2 className="text-lg font-bold text-[var(--color-brand-700)]">{card.title}</h2>
            <p className="mt-2 text-sm leading-7 text-[var(--unilabor-neutral)]">{card.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
};
