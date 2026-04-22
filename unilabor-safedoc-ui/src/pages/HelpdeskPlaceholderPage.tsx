import { ClipboardList } from 'lucide-react';

export const HelpdeskPlaceholderPage = ({ title }: { title: string }) => {
  return (
    <div className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/90 p-6 shadow-xl shadow-[rgba(0,65,106,0.08)]">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[rgba(191,212,230,0.32)] text-[var(--color-brand-700)]">
          <ClipboardList size={22} />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-500)]">
            Mesa de Ayuda
          </p>
          <h1 className="text-xl font-bold text-[var(--color-brand-700)]">{title}</h1>
        </div>
      </div>
      <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--unilabor-neutral)]">
        Esta vista queda preparada como parte de la arquitectura inicial del modulo. Su funcionalidad se implementara en los siguientes sprints del roadmap Helpdesk.
      </p>
    </div>
  );
};
