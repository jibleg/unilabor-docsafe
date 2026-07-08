import { useEffect, useMemo, useState } from 'react';
import { Boxes, Link2, Loader2 } from 'lucide-react';
import { SearchableSelect } from '../SearchableSelect';
import {
  attachAssetComponent,
  createAssetComponent,
  getApiErrorMessage,
  listHelpdeskAssets,
  type HelpdeskAssetPayload,
} from '../../api/service';
import type { HelpdeskAsset } from '../../types/models';
import { notifyError, notifySuccess, notifyWarning } from '../../utils/notify';

const FIELD_CLASS =
  'w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]';
const LABEL_CLASS =
  'mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]';

const ModalShell = ({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(11,34,53,0.28)] p-4 backdrop-blur-sm">
    <div className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/96 shadow-2xl shadow-[rgba(0,65,106,0.18)]">
      <div className="border-b border-[rgba(0,65,106,0.08)] px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-500)]">
          {eyebrow}
        </p>
        <h2 className="mt-1 text-lg font-bold text-[var(--color-brand-700)]">{title}</h2>
      </div>
      {children}
    </div>
  </div>
);

interface AddComponentModalProps {
  parent: HelpdeskAsset;
  onClose: () => void;
  onCreated: (updatedParent: HelpdeskAsset) => void;
}

/**
 * Alta de un componente bajo un activo "todo". Solo captura los datos propios del
 * componente; unidad/area/ubicacion/responsable se heredan del padre y el codigo
 * se autogenera como {codigo_padre}-NNN en el backend.
 */
export const AddComponentModal = ({ parent, onClose, onCreated }: AddComponentModalProps) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [brandName, setBrandName] = useState('');
  const [model, setModel] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) {
      notifyWarning('El nombre del componente es obligatorio.');
      return;
    }
    setSaving(true);
    try {
      const payload: HelpdeskAssetPayload = {
        asset_code: '',
        name: name.trim(),
        description: description.trim() || null,
        brand_name: brandName.trim() || null,
        model: model.trim() || null,
        serial_number: serialNumber.trim() || null,
      };
      const updatedParent = await createAssetComponent(parent.id, payload);
      if (!updatedParent) {
        throw new Error('No se pudo interpretar la respuesta del servidor.');
      }
      notifySuccess('Componente agregado correctamente.');
      onCreated(updatedParent);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo agregar el componente.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell eyebrow="Activo compuesto" title="Agregar componente">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
        <div className="rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.8)] px-3 py-2.5 text-xs leading-5 text-[var(--unilabor-neutral)]">
          El componente se registra bajo{' '}
          <span className="font-semibold text-[var(--color-brand-700)]">{parent.asset_code}</span>. La
          unidad, area, ubicacion y responsable se heredan del activo padre y el codigo se genera
          como <span className="font-semibold text-[var(--color-brand-700)]">{parent.asset_code}-NNN</span>.
        </div>

        <label className="block">
          <span className={LABEL_CLASS}>
            Nombre del componente <span className="text-[#b02a2a]">*</span>
          </span>
          <input value={name} onChange={(event) => setName(event.target.value)} className={FIELD_CLASS} />
        </label>

        <label className="block">
          <span className={LABEL_CLASS}>Marca</span>
          <input value={brandName} onChange={(event) => setBrandName(event.target.value)} className={FIELD_CLASS} />
        </label>

        <label className="block">
          <span className={LABEL_CLASS}>Modelo</span>
          <input value={model} onChange={(event) => setModel(event.target.value)} className={FIELD_CLASS} />
        </label>

        <label className="block">
          <span className={LABEL_CLASS}>Numero de serie</span>
          <input
            value={serialNumber}
            onChange={(event) => setSerialNumber(event.target.value)}
            className={FIELD_CLASS}
          />
        </label>

        <label className="block">
          <span className={LABEL_CLASS}>Descripcion</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            className={FIELD_CLASS}
          />
        </label>
      </div>

      <div className="flex justify-end gap-2 border-t border-[rgba(0,65,106,0.08)] px-5 py-4">
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="rounded-xl border border-[rgba(0,65,106,0.12)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)] disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={saving || !name.trim()}
          className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:opacity-50"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Boxes size={14} />}
          Agregar componente
        </button>
      </div>
    </ModalShell>
  );
};

interface AttachComponentModalProps {
  parent: HelpdeskAsset;
  onClose: () => void;
  onAttached: (updatedParent: HelpdeskAsset) => void;
}

/**
 * Vincula un activo existente como componente del padre. Solo se ofrecen activos
 * independientes (sin padre) y que no tengan a su vez componentes (no se permite
 * anidar mas de dos niveles).
 */
export const AttachComponentModal = ({ parent, onClose, onAttached }: AttachComponentModalProps) => {
  const [candidates, setCandidates] = useState<HelpdeskAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const all = await listHelpdeskAssets();
        if (!active) {
          return;
        }
        const eligible = all.filter(
          (asset) =>
            asset.id !== parent.id &&
            (asset.parent_asset_id ?? null) === null &&
            (asset.component_count ?? 0) === 0,
        );
        setCandidates(eligible);
      } catch (error) {
        if (active) {
          notifyError(getApiErrorMessage(error, 'No se pudieron cargar los activos disponibles.'));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [parent.id]);

  const options = useMemo(
    () =>
      candidates.map((asset) => ({
        value: String(asset.id),
        label: `${asset.asset_code} - ${asset.name}`,
        hint: [asset.brand?.name ?? asset.brand_name, asset.model, asset.serial_number]
          .filter(Boolean)
          .join(' | ') || undefined,
      })),
    [candidates],
  );

  const handleSubmit = async () => {
    const componentId = Number(selectedId);
    if (!Number.isFinite(componentId) || componentId <= 0) {
      notifyWarning('Selecciona el activo que deseas vincular.');
      return;
    }
    setSaving(true);
    try {
      const updatedParent = await attachAssetComponent(parent.id, componentId);
      if (!updatedParent) {
        throw new Error('No se pudo interpretar la respuesta del servidor.');
      }
      notifySuccess('Activo vinculado como componente.');
      onAttached(updatedParent);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo vincular el activo.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell eyebrow="Activo compuesto" title="Vincular activo existente">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
        <div className="rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.8)] px-3 py-2.5 text-xs leading-5 text-[var(--unilabor-neutral)]">
          El activo seleccionado pasara a ser componente de{' '}
          <span className="font-semibold text-[var(--color-brand-700)]">{parent.asset_code}</span>. Solo
          se muestran activos independientes sin componentes propios.
        </div>

        <label className="block">
          <span className={LABEL_CLASS}>Activo a vincular</span>
          {loading ? (
            <div className="flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-neutral)]">
              <Loader2 size={14} className="animate-spin" /> Cargando activos disponibles...
            </div>
          ) : (
            <SearchableSelect
              value={selectedId}
              onChange={setSelectedId}
              options={options}
              placeholder="Selecciona un activo"
              emptyLabel="Sin seleccionar"
              searchPlaceholder="Buscar por codigo, nombre, marca o serie..."
            />
          )}
          {!loading && options.length === 0 ? (
            <span className="mt-1 block text-xs text-[var(--unilabor-neutral)]">
              No hay activos disponibles para vincular.
            </span>
          ) : null}
        </label>
      </div>

      <div className="flex justify-end gap-2 border-t border-[rgba(0,65,106,0.08)] px-5 py-4">
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="rounded-xl border border-[rgba(0,65,106,0.12)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)] disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={saving || loading || !selectedId}
          className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:opacity-50"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
          Vincular componente
        </button>
      </div>
    </ModalShell>
  );
};
