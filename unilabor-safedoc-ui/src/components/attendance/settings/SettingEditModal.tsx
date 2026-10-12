import { useState, type FormEvent } from 'react';
import { Loader2, RotateCcw } from 'lucide-react';
import { getApiErrorMessage } from '../../../api/service';
import { updateAttendanceSetting, type AttendanceSetting } from '../../../api/service.api-attendance-settings';
import { notifyError, notifySuccess } from '../../../utils/notify';
import { inputClass, labelClass, ModalShell, primaryButtonClass, secondaryButtonClass } from '../devices/ModalShell';
import { formatSettingValue, optionLabel, parseSettingValue, rangeText, validateSettingInput } from './settingsHelpers';

interface SettingEditModalProps {
  setting: AttendanceSetting;
  onClose: () => void;
  onSaved: (settings: AttendanceSetting[]) => void;
}

export const SettingEditModal = ({ setting, onClose, onSaved }: SettingEditModalProps) => {
  const [value, setValue] = useState(String(setting.value));
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const problem = validateSettingInput(setting, value, reason);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const settings = await updateAttendanceSetting(setting.key, {
        value: parseSettingValue(setting, value),
        reason: reason.trim(),
      });
      notifySuccess('Parámetro actualizado.');
      onSaved(settings);
    } catch (err) {
      notifyError(getApiErrorMessage(err, 'No se pudo guardar el parámetro.'));
      setSaving(false);
    }
  };

  const range = rangeText(setting);

  return (
    <ModalShell title={setting.label} eyebrow="Editar parámetro" onClose={onClose} locked={saving}>
      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        <p className="text-sm text-slate-600">{setting.description}</p>
        <div>
          <label className={labelClass} htmlFor="setting-value">Valor{setting.unit ? ` (${setting.unit})` : ''}</label>
          {setting.type === 'enum' ? (
            <select id="setting-value" className={inputClass} value={value} onChange={(event) => setValue(event.target.value)}>
              {(setting.options ?? []).map((option) => (
                <option key={option} value={option}>{optionLabel(option)}</option>
              ))}
            </select>
          ) : (
            <input
              id="setting-value"
              className={inputClass}
              type={setting.type === 'integer' ? 'number' : setting.type === 'time' ? 'time' : 'text'}
              min={setting.min ?? undefined}
              max={setting.max ?? undefined}
              step={setting.type === 'integer' ? 1 : undefined}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              autoFocus
            />
          )}
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>{range}</span>
            <button
              type="button"
              className="inline-flex items-center gap-1 font-semibold text-[var(--color-brand-700)] hover:underline"
              onClick={() => setValue(String(setting.default_value))}
            >
              <RotateCcw size={12} aria-hidden /> Por defecto: {formatSettingValue(setting, setting.default_value)}
            </button>
          </div>
        </div>
        <div>
          <label className={labelClass} htmlFor="setting-reason">Motivo del cambio *</label>
          <textarea
            id="setting-reason"
            className={inputClass}
            rows={3}
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Mínimo 5 caracteres. Queda en el historial."
          />
        </div>
        {error ? <p role="alert" className="text-sm font-medium text-red-700">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <button type="button" className={secondaryButtonClass} onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" className={primaryButtonClass} disabled={saving}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : null} Guardar
          </button>
        </div>
      </form>
    </ModalShell>
  );
};
