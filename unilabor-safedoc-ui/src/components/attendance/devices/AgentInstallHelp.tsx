import { useState } from 'react';
import { ChevronDown, CircleHelp } from 'lucide-react';

export const AgentInstallHelp = () => {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/70">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-semibold text-[var(--color-brand-700)]"
      >
        <CircleHelp size={16} aria-hidden /> ¿Cómo instalar el agente?
        <ChevronDown size={16} className={`ml-auto transition ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open ? (
        <ol className="list-decimal space-y-1 px-9 pb-4 text-sm text-slate-600">
          <li>Crea el agente de la sucursal y guarda la clave que se muestra una sola vez.</li>
          <li>En la PC de la sucursal (con acceso a los relojes) instala el agente y pega el JSON de configuración en su archivo de configuración.</li>
          <li>Inícialo: en unos segundos aparecerá "Agente en línea" y sus relojes en esta pantalla.</li>
          <li>Usa "Sincronizar pendientes" para enviar a los relojes las altas de colaboradores.</li>
        </ol>
      ) : null}
      {open ? (
        <p className="px-4 pb-4 text-xs text-slate-500">
          Instrucciones completas en <code>attendance-agent/README.md</code> del repositorio.
        </p>
      ) : null}
    </div>
  );
};
