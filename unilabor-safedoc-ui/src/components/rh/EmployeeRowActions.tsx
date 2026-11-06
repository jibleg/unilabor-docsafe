import { Edit3, Eye, FileCog, Loader2, UserX } from 'lucide-react';

interface EmployeeRowActionsProps {
  onView: () => void;
  onEdit: () => void;
  onPermissions: () => void;
  onDeactivate: () => void;
  deactivating: boolean;
}

const baseClass =
  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-[var(--color-brand-700)] transition disabled:opacity-60';

// Acciones de una fila del listado de colaboradores. Solo ícono con tooltip: con
// etiqueta, los cuatro botones ocupan demasiado y pueden desbordarse.
export const EmployeeRowActions = ({ onView, onEdit, onPermissions, onDeactivate, deactivating }: EmployeeRowActionsProps) => (
  <div className="flex justify-end gap-1.5">
    <button type="button" onClick={onView} title="Ver ficha" className={`${baseClass} border-[rgba(0,65,106,0.12)] bg-white/90 hover:bg-[rgba(191,212,230,0.28)]`}>
      <Eye size={15} />
    </button>
    <button type="button" onClick={onEdit} title="Editar" className={`${baseClass} border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.36)] hover:bg-[rgba(124,173,211,0.3)]`}>
      <Edit3 size={15} />
    </button>
    <button
      type="button"
      onClick={onPermissions}
      title="Permisos de documentos"
      className={`${baseClass} border-[rgba(0,65,106,0.14)] bg-[rgba(239,245,250,0.95)] hover:bg-[rgba(191,212,230,0.32)]`}
    >
      <FileCog size={15} />
    </button>
    <button
      type="button"
      onClick={onDeactivate}
      disabled={deactivating}
      title={deactivating ? 'Inactivando...' : 'Inactivar colaborador'}
      className={`${baseClass} border-[rgba(190,40,40,0.2)] bg-[rgba(190,40,40,0.06)] !text-[#b02a2a] hover:bg-[rgba(190,40,40,0.12)]`}
    >
      {deactivating ? <Loader2 size={15} className="animate-spin" /> : <UserX size={15} />}
    </button>
  </div>
);
