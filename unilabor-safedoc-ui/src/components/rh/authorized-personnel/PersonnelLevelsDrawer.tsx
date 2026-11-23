import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { listAuthorizationLevels, listOrganizationalLevels } from '../../../api/service.api-rh-authorized-personnel';
import { getApiErrorMessage } from '../../../api/service.parsers';
import type { RhAuthorizationLevel, RhOrganizationalLevel } from '../../../types/models';
import { notifyError } from '../../../utils/notify';
import { DrawerShell } from '../../attendance/schedule/DrawerShell';
import { PersonnelLevelModal, type PersonnelLevelDraft, type PersonnelLevelKind } from './PersonnelLevelModal';

interface PersonnelLevelsDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Se llama al guardar, para refrescar el listado. */
  onChanged: () => void;
}

interface LevelItem {
  id: number;
  key: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

/**
 * Catálogos del REH-REG-026: niveles de autorización y niveles organizacionales.
 * El panel solo lista; el alta y la edición se hacen en un modal.
 */
export const PersonnelLevelsDrawer = ({ open, onClose, onChanged }: PersonnelLevelsDrawerProps) => {
  const [authorization, setAuthorization] = useState<RhAuthorizationLevel[]>([]);
  const [organizational, setOrganizational] = useState<RhOrganizationalLevel[]>([]);
  const [editing, setEditing] = useState<PersonnelLevelDraft | null>(null);

  const load = useCallback(async () => {
    try {
      const [auth, org] = await Promise.all([listAuthorizationLevels(true), listOrganizationalLevels(true)]);
      setAuthorization(auth);
      setOrganizational(org);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudieron cargar los catálogos.'));
    }
  }, []);

  useEffect(() => {
    if (open) {
      setEditing(null);
      void load();
    }
  }, [open, load]);

  const section = (kind: PersonnelLevelKind, title: string, hint: string, items: LevelItem[]) => (
    <section className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-[var(--color-brand-700)]">{title}</h3>
          <p className="text-[11px] text-[var(--unilabor-neutral)]">{hint}</p>
        </div>
        <button
          type="button"
          onClick={() => setEditing({ kind, id: null, key: '', name: '', description: '', is_active: true })}
          title="Agregar nivel"
          aria-label={`Agregar a ${title}`}
          className="rounded-lg border border-[rgba(0,65,106,0.14)] bg-white p-1.5 text-[var(--color-brand-700)] hover:bg-[rgba(191,212,230,0.3)]"
        >
          <Plus size={15} />
        </button>
      </div>
      {items.map((item) => (
        <div key={item.id} className={`flex items-start gap-3 rounded-xl border border-[rgba(0,65,106,0.1)] px-3 py-2 ${item.is_active ? 'bg-white' : 'bg-slate-50 opacity-60'}`}>
          <span className="mt-0.5 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-[var(--color-brand-700)] px-1.5 text-xs font-bold text-white">{item.key}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-[var(--unilabor-ink)]">
              {item.name} {item.is_active ? null : <span className="text-[10px] font-semibold uppercase text-slate-500">· inactivo</span>}
            </span>
            <span className="block text-[11px] leading-4 text-[var(--unilabor-neutral)]">{item.description}</span>
          </span>
          <button
            type="button"
            onClick={() => setEditing({ kind, id: item.id, key: item.key, name: item.name, description: item.description ?? '', is_active: item.is_active })}
            title="Editar"
            aria-label={`Editar ${item.name}`}
            className="rounded-lg p-1.5 text-[var(--unilabor-neutral)] hover:bg-slate-100"
          >
            <Pencil size={14} />
          </button>
        </div>
      ))}
    </section>
  );

  return (
    <>
      <DrawerShell open={open} onClose={onClose} busy={editing !== null} title="Catálogos del listado" subtitle="REH-REG-026 · niveles de autorización y niveles organizacionales">
        <div className="space-y-6">
          {section(
            'authorization',
            'Niveles de autorización',
            'Se eligen al autorizar el REH-REG-003 de cada puesto (cierre de la Fase 7).',
            authorization.map((level) => ({ id: level.id, key: String(level.level_no), name: level.name, description: level.description, is_active: level.is_active })),
          )}
          {section(
            'organizational',
            'Niveles organizacionales',
            'Los rige el puesto; se asignan en el catálogo de Puestos.',
            organizational.map((level) => ({ id: level.id, key: level.code, name: level.name, description: level.description, is_active: level.is_active })),
          )}
        </div>
      </DrawerShell>
      {open && editing ? (
        <PersonnelLevelModal
          key={`${editing.kind}-${editing.id ?? 'new'}`}
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            void load();
            onChanged();
          }}
        />
      ) : null}
    </>
  );
};
