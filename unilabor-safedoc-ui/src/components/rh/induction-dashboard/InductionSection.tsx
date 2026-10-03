import type { LucideIcon } from 'lucide-react';

/** Encabezado de sección (icono + título en versalitas) del detalle de inducción. */
export const InductionSection = ({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: React.ReactNode }) => (
  <section>
    <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--unilabor-neutral)]">
      <Icon size={13} /> {title}
    </p>
    {children}
  </section>
);
