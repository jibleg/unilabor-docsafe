import { useState } from 'react';
import { AlertTriangle, Check, Copy } from 'lucide-react';
import type { AgentKeyResult } from '../../../api/service.api-attendance-devices';
import { notifyError, notifySuccess } from '../../../utils/notify';
import { buildAgentConfigJson } from './deviceHelpers';
import { ModalShell, primaryButtonClass, secondaryButtonClass } from './ModalShell';

interface AgentKeyModalProps {
  result: AgentKeyResult;
  /** 'created' al dar de alta; 'rotated' al rotar. */
  origin: 'created' | 'rotated';
  onClose: () => void;
}

/** Muestra la clave del agente UNA sola vez. La clave solo vive en el estado de este modal. */
export const AgentKeyModal = ({ result, origin, onClose }: AgentKeyModalProps) => {
  const [copied, setCopied] = useState<'key' | 'json' | null>(null);
  const json = buildAgentConfigJson(result.config);

  const copy = async (text: string, kind: 'key' | 'json') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      notifySuccess(kind === 'key' ? 'Clave copiada.' : 'Configuración copiada.');
    } catch {
      notifyError('No se pudo copiar; selecciona el texto y cópialo manualmente.');
    }
  };

  return (
    <ModalShell
      title={origin === 'created' ? 'Agente creado' : 'Clave rotada'}
      eyebrow={result.agent.branch_name}
      onClose={onClose}
      locked
      maxWidthClass="max-w-2xl"
    >
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900" role="alert">
        <p className="flex items-center gap-2 font-semibold">
          <AlertTriangle size={16} aria-hidden /> Guarda esta clave ahora
        </p>
        <p className="mt-1">
          Solo se muestra esta vez y no se volverá a mostrar. {origin === 'rotated' ? 'La clave anterior ya dejó de funcionar. ' : ''}
          Si la pierdes, deberás rotarla.
        </p>
      </div>

      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Clave del agente</p>
        <div className="mt-1 flex items-center gap-2">
          <code className="min-w-0 flex-1 break-all rounded-xl bg-slate-100 px-3 py-2 text-xs text-[var(--unilabor-ink)]">
            {result.agent_key}
          </code>
          <button type="button" className={secondaryButtonClass} onClick={() => void copy(result.agent_key, 'key')} aria-label="Copiar clave">
            {copied === 'key' ? <Check size={16} /> : <Copy size={16} />}
          </button>
        </div>
      </div>

      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
          Configuración sugerida (archivo del agente)
        </p>
        <pre className="mt-1 overflow-x-auto rounded-xl bg-slate-900 p-3 text-xs text-slate-100">{json}</pre>
        <button type="button" className={`${secondaryButtonClass} mt-2`} onClick={() => void copy(json, 'json')}>
          {copied === 'json' ? <Check size={16} /> : <Copy size={16} />} Copiar configuración
        </button>
      </div>

      <div className="mt-5 flex justify-end">
        <button type="button" className={primaryButtonClass} onClick={onClose}>
          Ya la guardé
        </button>
      </div>
    </ModalShell>
  );
};
