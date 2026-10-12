import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { createAttendanceAgent, type AgentKeyResult, type DevicesBranchOverview } from '../../../api/service.api-attendance-devices';
import { getApiErrorMessage } from '../../../api/service';
import { notifyError } from '../../../utils/notify';
import { inputClass, labelClass, ModalShell, primaryButtonClass, secondaryButtonClass } from './ModalShell';

interface CreateAgentModalProps {
  branch: DevicesBranchOverview;
  onClose: () => void;
  onCreated: (result: AgentKeyResult) => void;
}

export const CreateAgentModal = ({ branch, onClose, onCreated }: CreateAgentModalProps) => {
  const [name, setName] = useState(`Agente ${branch.branch_name}`.slice(0, 80));
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      notifyError('El nombre debe tener al menos 2 caracteres.');
      return;
    }
    setSaving(true);
    try {
      onCreated(await createAttendanceAgent({ branch_id: branch.branch_id, name: trimmed }));
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo crear el agente.'));
      setSaving(false);
    }
  };

  return (
    <ModalShell title="Crear agente" eyebrow={branch.branch_name} onClose={onClose} locked={saving}>
      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        <div>
          <label className={labelClass} htmlFor="agent-name">Nombre del agente</label>
          <input id="agent-name" className={inputClass} value={name} maxLength={80} onChange={(event) => setName(event.target.value)} autoFocus />
          <p className="mt-1 text-xs text-slate-500">Es el programa que se instala en la PC de la sucursal y habla con los relojes.</p>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className={secondaryButtonClass} onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" className={primaryButtonClass} disabled={saving}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : null} Crear
          </button>
        </div>
      </form>
    </ModalShell>
  );
};
