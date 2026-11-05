import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Info, Loader2 } from 'lucide-react';
import { fetchAssetProgram, getApiErrorMessage, listHelpdeskAssets, listMaintenanceCatalogs, saveAssetProgramVersion } from '../../../api/service';
import { SearchableSelect } from '../../SearchableSelect';
import type { AssetProgramOverview, ProgramPayload } from '../../../types/helpdesk-program';
import type { Employee, HelpdeskAsset, HelpdeskCatalogItem, HelpdeskMaintenanceFrequency } from '../../../types/models';
import { notifyError, notifySuccess } from '../../../utils/notify';
import { ProgramVersionModal } from './ProgramVersionModal';

interface CreateProgramFlowProps {
  suppliers: HelpdeskCatalogItem[];
  employees: Employee[];
  onClose: () => void;
  onCreated: () => void;
}

// Crear el programa de un activo sin salir del calendario: es el mismo formulario de la
// ficha del activo, con el selector de activo integrado arriba. Si el activo ya tiene
// programa vigente no se crea otro aqui: se manda a su ficha, donde se versiona.
// Se monta solo mientras esta abierto, asi cada apertura arranca limpia.
export const CreateProgramFlow = ({ suppliers, employees, onClose, onCreated }: CreateProgramFlowProps) => {
  const navigate = useNavigate();
  const [assets, setAssets] = useState<HelpdeskAsset[] | null>(null);
  const [frequencies, setFrequencies] = useState<HelpdeskMaintenanceFrequency[]>([]);
  const [assetId, setAssetId] = useState('');
  const [overview, setOverview] = useState<AssetProgramOverview | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [saving, setSaving] = useState(false);
  const latestRequest = useRef(0);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([listHelpdeskAssets(), listMaintenanceCatalogs()]).then(([assetResult, catalogResult]) => {
      if (cancelled) return;
      if (assetResult.status === 'fulfilled') {
        setAssets(assetResult.value);
      } else {
        setAssets([]);
        notifyError(getApiErrorMessage(assetResult.reason, 'No se pudieron cargar los activos.'));
      }
      if (catalogResult.status === 'fulfilled') setFrequencies(catalogResult.value.frequencies);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const assetOptions = useMemo(
    () => (assets ?? []).map((asset) => ({ value: String(asset.id), label: `${asset.asset_code} - ${asset.name}` })),
    [assets],
  );

  const pickAsset = async (value: string) => {
    const requestId = ++latestRequest.current;
    setAssetId(value);
    setOverview(null);
    if (!value) {
      setLoadingOverview(false);
      return;
    }
    setLoadingOverview(true);
    try {
      const result = await fetchAssetProgram(Number(value));
      if (latestRequest.current === requestId) setOverview(result);
    } catch (error) {
      if (latestRequest.current === requestId) notifyError(getApiErrorMessage(error, 'No se pudo consultar el programa del activo.'));
    } finally {
      if (latestRequest.current === requestId) setLoadingOverview(false);
    }
  };

  const hasProgram = Boolean(overview?.program);
  // El formulario solo se habilita para un activo sin programa vigente.
  const formOverview = overview && !hasProgram ? overview : null;

  const submit = async (payload: ProgramPayload) => {
    if (!formOverview) return;
    setSaving(true);
    try {
      const result = await saveAssetProgramVersion(formOverview.asset.id, payload);
      notifySuccess(result.message || 'Programa guardado.');
      onCreated();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo guardar el programa.'));
    } finally {
      setSaving(false);
    }
  };

  const assetDetails = overview
    ? [overview.asset.category_name, overview.asset.unit_name, overview.asset.area_name, overview.asset.criticality_name ?? 'Sin criticidad'].filter(Boolean).join(' · ')
    : '';

  const assetPicker = (
    <section className="mb-4 rounded-2xl border border-[rgba(0,105,166,0.18)] bg-[rgba(191,212,230,0.16)] p-3">
      <p className="mb-1 text-xs font-semibold text-[var(--unilabor-ink)]">Activo</p>
      <SearchableSelect
        value={assetId}
        options={assetOptions}
        onChange={(value) => void pickAsset(value)}
        placeholder={assets === null ? 'Cargando activos...' : 'Selecciona activo'}
        emptyLabel="Sin activo"
        searchPlaceholder="Buscar activo por código o nombre..."
        disabled={assets === null || saving}
      />
      {loadingOverview ? (
        <p className="mt-2 flex items-center gap-2 text-xs text-[var(--unilabor-neutral)]">
          <Loader2 size={14} className="animate-spin" /> Consultando el programa del activo...
        </p>
      ) : overview ? (
        <p className="mt-2 text-xs text-[var(--unilabor-neutral)]">{assetDetails}</p>
      ) : (
        <p className="mt-2 text-xs text-[var(--unilabor-neutral)]">Elige el activo para habilitar el formulario.</p>
      )}
      {hasProgram && overview ? (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[rgba(0,105,166,0.18)] bg-white px-3 py-2 text-xs text-[var(--color-brand-700)]">
          <span className="flex min-w-0 flex-1 items-start gap-2">
            <Info size={14} className="mt-0.5 shrink-0" />
            <span>
              Este activo ya tiene un programa vigente (versión {overview.program?.version}, {overview.routines.length} {overview.routines.length === 1 ? 'rutina' : 'rutinas'}). Para cambiarlo, crea una nueva versión desde su ficha.
            </span>
          </span>
          <button
            type="button"
            onClick={() => navigate(`/helpdesk/assets/${overview.asset.id}/program`)}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[var(--color-brand-700)] px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-[var(--color-brand-600)]"
          >
            Abrir programa <ArrowRight size={13} />
          </button>
        </div>
      ) : null}
    </section>
  );

  return (
    <ProgramVersionModal
      // key por activo: el formulario se reinicia al cambiar de activo.
      key={formOverview?.asset.id ?? 'sin-activo'}
      open
      overview={formOverview}
      assetPicker={assetPicker}
      frequencies={frequencies}
      suppliers={suppliers}
      employees={employees}
      saving={saving}
      onClose={onClose}
      onSubmit={(payload) => void submit(payload)}
    />
  );
};
