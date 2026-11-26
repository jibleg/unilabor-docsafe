import { useEffect, useState } from 'react';
import { Loader2, Pencil, Plus, Save, X } from 'lucide-react';
import { listDisciplines, saveDiscipline } from '../../../api/service.api-rh-signature-registry';
import { getApiErrorMessage } from '../../../api/service.parsers';
import type { RhDiscipline } from '../../../types/models';
import { notifyError, notifySuccess, notifyWarning } from '../../../utils/notify';
import { DrawerShell } from '../../attendance/schedule/DrawerShell';
import { useEscapeStack } from '../../attendance/schedule/ModalShell';

interface DisciplinesDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Se llama al guardar, para refrescar el registro. */
  onChanged: () => void;
}

interface DisciplineDraft {
  id: number | null;
  name: string;
  is_active: boolean;
}

const INPUT =
  'w-full rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(248,251,253,0.95)] px-3 py-2 text-sm text-[var(--unilabor-ink)] outline-none focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]';

const DisciplineModal = ({ initial, onClose, onSaved }: { initial: DisciplineDraft; onClose: () => void; onSaved: () => void }) => {
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  useEscapeStack(onClose, saving);

  const save = async () => {
    if (!draft.name.trim()) {
      notifyWarning('Captura el nombre de la disciplina.');
      return;
    }
    setSaving(true);
    try {
      await saveDiscipline(draft.id, { name: draft.name.trim(), is_active: draft.is_active });
      notifySuccess(draft.id ? 'Disciplina actualizada.' : 'Disciplina agregada.');
      onSaved();
      onClose();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo guardar la disciplina.'));
    } finally {
      setSaving(false);
    }
  };

  const title = draft.id ? 'Editar disciplina' : 'Nueva disciplina';
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(11,34,53,0.35)] p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={title}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        className="w-full max-w-sm rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white p-6 shadow-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-brand-500)]">REH-REG-027 · Disciplinas</p>
            <h2 className="mt-1 text-lg font-bold text-[var(--color-brand-700)]">{title}</h2>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg p-1.5 text-[var(--unilabor-neutral)] transition hover:bg-[rgba(191,212,230,0.3)] disabled:opacity-40" aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Nombre</span>
          <input autoFocus value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} maxLength={80} className={INPUT} />
        </label>
        <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-[var(--color-brand-700)]">
          <span className={`relative h-5 w-9 rounded-full transition ${draft.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`}>
            <input type="checkbox" role="switch" checked={draft.is_active} onChange={(event) => setDraft({ ...draft, is_active: event.target.checked })} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Disciplina activa" />
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${draft.is_active ? 'left-[18px]' : 'left-0.5'}`} />
          </span>
          {draft.is_active ? 'Activa' : 'Inactiva'}
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-xl border border-[rgba(0,65,106,0.14)] bg-white px-4 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.3)] disabled:opacity-50">
            Cancelar
          </button>
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-brand-700)] px-4 py-2 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar
          </button>
        </div>
      </form>
    </div>
  );
};

/** Catálogo de disciplinas o áreas del REH-REG-027. El panel lista; alta y edición van en un modal. */
export const DisciplinesDrawer = ({ open, onClose, onChanged }: DisciplinesDrawerProps) => {
  const [disciplines, setDisciplines] = useState<RhDiscipline[]>([]);
  const [editing, setEditing] = useState<DisciplineDraft | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  // Carga al abrir el panel y tras cada alta o edicion (reloadTick).
  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    listDisciplines(true)
      .then((list) => {
        if (active) setDisciplines(list);
      })
      .catch((error: unknown) => {
        if (active) notifyError(getApiErrorMessage(error, 'No se pudieron cargar las disciplinas.'));
      });
    return () => {
      active = false;
    };
  }, [open, reloadTick]);

  return (
    <>
      <DrawerShell open={open} onClose={onClose} busy={editing !== null} title="Disciplinas o áreas" subtitle="REH-REG-027 · catálogo de la columna Disciplina o área" widthClass="max-w-md">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-[var(--unilabor-neutral)]">Las disciplinas en uso no se borran: se desactivan.</p>
            <button type="button" onClick={() => setEditing({ id: null, name: '', is_active: true })} title="Agregar disciplina" aria-label="Agregar disciplina" className="rounded-lg border border-[rgba(0,65,106,0.14)] bg-white p-1.5 text-[var(--color-brand-700)] hover:bg-[rgba(191,212,230,0.3)]">
              <Plus size={15} />
            </button>
          </div>
          {disciplines.map((discipline) => (
            <div key={discipline.id} className={`flex items-center gap-3 rounded-xl border border-[rgba(0,65,106,0.1)] px-3 py-2 ${discipline.is_active ? 'bg-white' : 'bg-slate-50 opacity-60'}`}>
              <span className="min-w-0 flex-1 text-sm font-semibold text-[var(--unilabor-ink)]">
                {discipline.name} {discipline.is_active ? null : <span className="text-[10px] font-semibold uppercase text-slate-500">· inactiva</span>}
              </span>
              <button type="button" onClick={() => setEditing({ id: discipline.id, name: discipline.name, is_active: discipline.is_active })} title="Editar" aria-label={`Editar ${discipline.name}`} className="rounded-lg p-1.5 text-[var(--unilabor-neutral)] hover:bg-slate-100">
                <Pencil size={14} />
              </button>
            </div>
          ))}
        </div>
      </DrawerShell>
      {open && editing ? (
        <DisciplineModal
          key={editing.id ?? 'new'}
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setReloadTick((tick) => tick + 1);
            onChanged();
          }}
        />
      ) : null}
    </>
  );
};
