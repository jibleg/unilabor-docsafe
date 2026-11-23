import { useState } from 'react';
import { Loader2, Save, X } from 'lucide-react';
import { saveAuthorizationLevel, saveOrganizationalLevel } from '../../../api/service.api-rh-authorized-personnel';
import { getApiErrorMessage } from '../../../api/service.parsers';
import { notifyError, notifySuccess, notifyWarning } from '../../../utils/notify';
import { useEscapeStack } from '../../attendance/schedule/ModalShell';

export type PersonnelLevelKind = 'authorization' | 'organizational';

export interface PersonnelLevelDraft {
  kind: PersonnelLevelKind;
  /** null = alta. */
  id: number | null;
  /** Número de nivel (autorización) o clave (organizacional). */
  key: string;
  name: string;
  description: string;
  is_active: boolean;
}

interface PersonnelLevelModalProps {
  initial: PersonnelLevelDraft;
  onClose: () => void;
  onSaved: () => void;
}

const INPUT =
  'w-full rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(248,251,253,0.95)] px-3 py-2 text-sm text-[var(--unilabor-ink)] outline-none focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]';
const LABEL = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]';

/**
 * Alta o edición de un nivel de autorización u organizacional (catálogos del
 * REH-REG-026). Se abre encima del panel de catálogos (z-70 sobre el z-60 del
 * drawer) y comparte su pila de Escape.
 */
export const PersonnelLevelModal = ({ initial, onClose, onSaved }: PersonnelLevelModalProps) => {
  const [draft, setDraft] = useState<PersonnelLevelDraft>(initial);
  const [saving, setSaving] = useState(false);
  useEscapeStack(onClose, saving);

  const isAuthorization = draft.kind === 'authorization';
  const noun = isAuthorization ? 'nivel de autorización' : 'nivel organizacional';

  const save = async () => {
    const key = draft.key.trim();
    if (!key || !draft.name.trim()) {
      notifyWarning(isAuthorization ? 'Captura el número y el nombre del nivel.' : 'Captura la clave y el nombre del nivel.');
      return;
    }
    if (isAuthorization && !/^[1-9]\d?$/.test(key)) {
      notifyWarning('El número de nivel debe ser un entero entre 1 y 99.');
      return;
    }
    setSaving(true);
    try {
      const common = { name: draft.name.trim(), description: draft.description.trim() || null, is_active: draft.is_active };
      if (isAuthorization) {
        await saveAuthorizationLevel(draft.id, { ...common, level_no: Number(key) });
      } else {
        await saveOrganizationalLevel(draft.id, { ...common, code: key.toUpperCase() });
      }
      notifySuccess(draft.id ? 'Nivel actualizado.' : 'Nivel agregado.');
      onSaved();
      onClose();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo guardar el nivel.'));
    } finally {
      setSaving(false);
    }
  };

  const title = `${draft.id ? 'Editar' : 'Nuevo'} ${noun}`;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(11,34,53,0.35)] p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={title}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        className="w-full max-w-md rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white p-6 shadow-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-brand-500)]">REH-REG-026 · Catálogos</p>
            <h2 className="mt-1 text-lg font-bold text-[var(--color-brand-700)]">{title}</h2>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg p-1.5 text-[var(--unilabor-neutral)] transition hover:bg-[rgba(191,212,230,0.3)] disabled:opacity-40" aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>

        <div className="grid grid-cols-[96px_1fr] gap-3">
          <label>
            <span className={LABEL}>{isAuthorization ? 'Nivel' : 'Clave'}</span>
            <input
              autoFocus
              value={draft.key}
              onChange={(event) => setDraft({ ...draft, key: event.target.value })}
              inputMode={isAuthorization ? 'numeric' : 'text'}
              maxLength={isAuthorization ? 2 : 4}
              placeholder={isAuthorization ? '5' : 'G'}
              className={`${INPUT} text-center font-bold uppercase`}
            />
          </label>
          <label>
            <span className={LABEL}>Nombre</span>
            <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} maxLength={80} className={INPUT} />
          </label>
        </div>

        <label className="mt-3 block">
          <span className={LABEL}>Descripción (se imprime en el formato)</span>
          <textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} rows={3} maxLength={400} className={INPUT} />
        </label>

        <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-[var(--color-brand-700)]">
          <span className={`relative h-5 w-9 rounded-full transition ${draft.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`}>
            <input
              type="checkbox"
              role="switch"
              checked={draft.is_active}
              onChange={(event) => setDraft({ ...draft, is_active: event.target.checked })}
              className="peer absolute inset-0 cursor-pointer opacity-0"
              aria-label="Nivel activo"
            />
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${draft.is_active ? 'left-[18px]' : 'left-0.5'}`} />
          </span>
          {draft.is_active ? 'Activo' : 'Inactivo'}
        </label>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-xl border border-[rgba(0,65,106,0.14)] bg-white px-4 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.3)] disabled:opacity-50">
            Cancelar
          </button>
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-brand-700)] px-4 py-2 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Guardar
          </button>
        </div>
      </form>
    </div>
  );
};
