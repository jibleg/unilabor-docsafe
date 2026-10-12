import { useState } from 'react';
import { Check, Fingerprint, Loader2, Pencil, X } from 'lucide-react';
import type { AttendanceTerminal } from '../../../api/service.api-attendance-devices';
import { formatDateTime } from '../shared/format';
import { clockDriftLabel } from './deviceHelpers';
import { inputClass } from './ModalShell';

interface TerminalRowProps {
  terminal: AttendanceTerminal;
  agentOnline: boolean;
  onRename: (terminalId: number, name: string) => Promise<boolean>;
}

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="min-w-0">
    <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
    <dd className="truncate text-xs text-[var(--unilabor-ink)]">{value}</dd>
  </div>
);

export const TerminalRow = ({ terminal, agentOnline, onRename }: TerminalRowProps) => {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(terminal.name);
  const [saving, setSaving] = useState(false);
  const online = terminal.is_online && agentOnline && terminal.is_active;

  const save = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 1 || trimmed === terminal.name) {
      setEditing(false);
      setName(terminal.name);
      return;
    }
    setSaving(true);
    const ok = await onRename(terminal.id, trimmed);
    setSaving(false);
    if (ok) setEditing(false);
  };

  return (
    <li className="rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/80 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Fingerprint size={16} className="text-[var(--color-brand-500)]" aria-hidden />
        {editing ? (
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <input
              className={`${inputClass} !py-1`}
              value={name}
              maxLength={80}
              aria-label="Nombre del reloj"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void save();
                if (event.key === 'Escape') { setEditing(false); setName(terminal.name); }
              }}
              autoFocus
            />
            <button type="button" onClick={() => void save()} disabled={saving} aria-label="Guardar nombre" className="rounded-lg p-1.5 text-emerald-700 hover:bg-emerald-50">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            </button>
            <button type="button" onClick={() => { setEditing(false); setName(terminal.name); }} disabled={saving} aria-label="Cancelar edición" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
              <X size={16} />
            </button>
          </div>
        ) : (
          <>
            <span className="min-w-0 truncate text-sm font-semibold text-[var(--color-brand-700)]">{terminal.name}</span>
            <button type="button" onClick={() => setEditing(true)} aria-label={`Renombrar ${terminal.name}`} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-[var(--color-brand-700)]">
              <Pencil size={14} />
            </button>
          </>
        )}
        <span
          className={`ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            !terminal.is_active ? 'bg-slate-100 text-slate-500' : online ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${!terminal.is_active ? 'bg-slate-400' : online ? 'bg-emerald-500' : 'bg-red-500'}`} aria-hidden />
          {!terminal.is_active ? 'Inactivo' : online ? 'En línea' : 'Sin conexión'}
        </span>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-3 lg:grid-cols-4">
        <Stat label="Modelo" value={terminal.model ?? '—'} />
        <Stat label="Serie" value={terminal.serial_number} />
        <Stat label="IP" value={terminal.local_ip ?? '—'} />
        <Stat label="Firmware" value={terminal.firmware_version ?? '—'} />
        <Stat label="Personas" value={terminal.enrolled_people_count === null ? '—' : String(terminal.enrolled_people_count)} />
        <Stat label="Desfase de hora" value={clockDriftLabel(terminal.clock_drift_seconds)} />
        <Stat label="Último evento" value={formatDateTime(terminal.last_event_at)} />
      </dl>
    </li>
  );
};
