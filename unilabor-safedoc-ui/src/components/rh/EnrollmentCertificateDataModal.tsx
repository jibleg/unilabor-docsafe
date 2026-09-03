import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { toast } from 'react-toastify';
import { listBranches, updateEmployeeById } from '../../api/service';
import { assignEmployeePosition, listPositions } from '../../api/service.api-rh-position';
import { getApiErrorMessage } from '../../api/service.parsers';
import type { EmployeeBranch, RhPosition } from '../../types/models';
import { SearchableSelect } from '../SearchableSelect';

interface EnrollmentCertificateDataModalProps {
  employeeId: number;
  employeeName: string;
  missingBranch: boolean;
  missingPosition: boolean;
  onClose: () => void;
  /** Se invoca tras guardar, para refrescar la lista y el semáforo de la fase. */
  onSaved: () => void;
}

/**
 * Captura exprés, desde la lista de inscritos de Inducción, de los datos del
 * colaborador que faltan para emitir la constancia completa (sucursal y/o
 * puesto activo), sin salir a RH → Empleados.
 */
export const EnrollmentCertificateDataModal = ({
  employeeId,
  employeeName,
  missingBranch,
  missingPosition,
  onClose,
  onSaved,
}: EnrollmentCertificateDataModalProps) => {
  const [branches, setBranches] = useState<EmployeeBranch[]>([]);
  const [positions, setPositions] = useState<RhPosition[]>([]);
  const [branchId, setBranchId] = useState('');
  const [positionId, setPositionId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        const [branchList, positionList] = await Promise.all([
          missingBranch ? listBranches() : Promise.resolve([]),
          missingPosition ? listPositions(false) : Promise.resolve([]),
        ]);
        if (!active) return;
        setBranches(branchList);
        setPositions([...positionList].sort((a, b) => a.name.localeCompare(b.name, 'es')));
      } catch (error) {
        toast.error(getApiErrorMessage(error, 'No se pudieron cargar los catálogos.'));
      } finally {
        if (active) setLoading(false);
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [missingBranch, missingPosition]);

  const handleSave = async () => {
    if (missingBranch && !branchId) {
      toast.warning('Selecciona la sucursal.');
      return;
    }
    if (missingPosition && !positionId) {
      toast.warning('Selecciona el puesto.');
      return;
    }
    setSaving(true);
    try {
      if (missingBranch && branchId) {
        await updateEmployeeById(employeeId, { branch_id: Number(branchId) });
      }
      if (missingPosition && positionId) {
        await assignEmployeePosition(employeeId, Number(positionId));
      }
      toast.success('Datos de la constancia capturados correctamente.');
      onSaved();
      onClose();
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudieron guardar los datos.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(11,34,53,0.28)] p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/96 shadow-2xl shadow-[rgba(0,65,106,0.18)]">
        <div className="flex items-center justify-between border-b border-[rgba(0,65,106,0.08)] px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-500)]">
              Datos de la constancia
            </p>
            <h2 className="mt-1 text-lg font-bold text-[var(--color-brand-700)]">{employeeName}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[rgba(0,65,106,0.1)] text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="flex items-center gap-2 text-sm text-[var(--unilabor-neutral)]">
              <Loader2 size={15} className="animate-spin" /> Cargando catálogos...
            </p>
          ) : (
            <>
              {missingBranch ? (
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--color-brand-700)]">
                    Sucursal
                  </label>
                  <SearchableSelect
                    value={branchId}
                    onChange={setBranchId}
                    options={branches.map((branch) => ({ value: String(branch.id), label: branch.name }))}
                    placeholder="Seleccionar sucursal..."
                    emptyLabel="Sin seleccionar"
                    searchPlaceholder="Buscar sucursal..."
                  />
                </div>
              ) : null}
              {missingPosition ? (
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--color-brand-700)]">
                    Puesto
                  </label>
                  <SearchableSelect
                    value={positionId}
                    onChange={setPositionId}
                    options={positions.map((position) => ({
                      value: String(position.id),
                      label: position.name,
                      hint: position.code,
                    }))}
                    placeholder="Seleccionar puesto..."
                    emptyLabel="Sin seleccionar"
                    searchPlaceholder="Buscar puesto por nombre o código..."
                  />
                </div>
              ) : null}
              <p className="text-xs text-[var(--unilabor-neutral)]">
                Estos datos se imprimen en la constancia oficial de la fase; quedan guardados en la
                ficha del colaborador.
              </p>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-[rgba(0,65,106,0.08)] px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[rgba(0,65,106,0.14)] px-4 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.2)]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || loading}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-brand-700)] px-4 py-2 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
};
