import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Loader2,
  Move,
  PenSquare,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Tag,
  X,
} from 'lucide-react';
import { SearchableSelect } from '../components/SearchableSelect';
import { Pagination } from '../components/Pagination';
import { SignaturePad } from '../components/helpdesk/SignaturePad';
import { AssetLabelModal } from '../components/helpdesk/AssetLabelModal';
import {
  createHelpdeskAssetMovement,
  fetchHelpdeskAssetById,
  fetchMovementSignatureUrl,
  getApiErrorMessage,
  getHelpdeskOrgStructure,
  listHelpdeskAssetMovements,
  listHelpdeskAssetsPaginated,
  listHelpdeskCatalogs,
} from '../api/service';
import type {
  HelpdeskAsset,
  HelpdeskAssetMovement,
  HelpdeskCatalogItem,
  HelpdeskOrgStructure,
} from '../types/models';
import { useAuthStore } from '../store/useAuthStore';
import { notifyError, notifySuccess } from '../utils/notify';

const EMPTY_STRUCTURE: HelpdeskOrgStructure = { units: [], areas: [], users: [] };
const MOVEMENTS_PAGE_SIZE = 10;

const formatDateTime = (value?: string | null): string => {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
};

// Muestra "antes → después" solo cuando el valor cambió.
const ChangeArrow = ({ from, to }: { from?: string | null; to?: string | null }) => {
  if (!to || from === to) {
    return <span className="text-[var(--unilabor-neutral)]">{from ?? '—'}</span>;
  }
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-[var(--unilabor-neutral)] line-through">{from ?? '—'}</span>
      <ArrowRight size={12} className="text-[var(--color-brand-500)]" />
      <span className="font-semibold text-[var(--color-brand-700)]">{to}</span>
    </span>
  );
};

export const HelpdeskMovementsPage = () => {
  const user = useAuthStore((state) => state.user);
  const currentUserName = user?.full_name ?? user?.name ?? '';

  const [structure, setStructure] = useState<HelpdeskOrgStructure>(EMPTY_STRUCTURE);
  const [categories, setCategories] = useState<HelpdeskCatalogItem[]>([]);
  const [movements, setMovements] = useState<HelpdeskAssetMovement[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [signatureModal, setSignatureModal] = useState<HelpdeskAssetMovement | null>(null);
  const [reprint, setReprint] = useState<{ code: string; name: string; brand?: string | null; model?: string | null } | null>(null);

  // Reimpresión "desde el movimiento al activo": trae el activo real y usa su
  // código vigente + marca/modelo (no el snapshot del movimiento).
  const openReprintForAsset = useCallback(
    async (assetId: number, fallbackCode: string, fallbackName: string) => {
      try {
        const asset = await fetchHelpdeskAssetById(assetId);
        if (asset) {
          setReprint({
            code: asset.asset_code,
            name: asset.name,
            brand: asset.brand_name ?? asset.brand?.name ?? null,
            model: asset.model ?? null,
          });
          return;
        }
      } catch {
        // Si no se puede traer el activo, cae al dato del movimiento.
      }
      setReprint({ code: fallbackCode, name: fallbackName });
    },
    [],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [structureData, catalogs, list] = await Promise.all([
        getHelpdeskOrgStructure(),
        listHelpdeskCatalogs(),
        listHelpdeskAssetMovements(),
      ]);
      setStructure(structureData);
      setCategories(catalogs.categories);
      setMovements(list);
      setPage(1);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudieron cargar los movimientos.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const totalPages = Math.max(1, Math.ceil(movements.length / MOVEMENTS_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedMovements = movements.slice((currentPage - 1) * MOVEMENTS_PAGE_SIZE, currentPage * MOVEMENTS_PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--color-brand-500)]">Trazabilidad ISO 15189</p>
          <h1 className="mt-2 text-3xl font-bold text-[var(--color-brand-700)]">Movimientos de activos</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--unilabor-neutral)]">
            Cambios de unidad, área, categoría o responsable. Al cambiar la clasificación, el código de inventario se
            regenera y puedes reimprimir la etiqueta. Cada movimiento deja evidencia firmada y un registro en el
            expediente del activo.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadData()}
            className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.12)] bg-white/90 px-4 py-2.5 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Recargar
          </button>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-brand-700)] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          >
            <Plus size={16} />
            Nuevo movimiento
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/90 shadow-xl shadow-[rgba(0,65,106,0.08)]">
        {movements.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-12 text-center">
            <Move size={32} className="text-[var(--color-brand-500)]" />
            <p className="text-sm font-semibold text-[var(--color-brand-700)]">Aún no hay movimientos registrados.</p>
            <p className="max-w-md text-sm text-[var(--unilabor-neutral)]">
              Registra un movimiento para cambiar unidad, área, categoría o responsable de un activo.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-[rgba(0,65,106,0.1)] bg-[rgba(248,251,253,0.96)] text-[11px] uppercase tracking-wide text-[var(--unilabor-neutral)]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Folio</th>
                  <th className="px-4 py-3 font-semibold">Activo / Código</th>
                  <th className="px-4 py-3 font-semibold">Cambios</th>
                  <th className="px-4 py-3 font-semibold">Responsable</th>
                  <th className="px-4 py-3 font-semibold">Fecha</th>
                  <th className="px-4 py-3 text-right font-semibold">Evidencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(0,65,106,0.06)]">
                {pagedMovements.map((movement) => (
                  <tr key={movement.id} className="align-top transition hover:bg-[rgba(191,212,230,0.16)]">
                    <td className="px-4 py-3 font-bold text-[var(--color-brand-700)]">{movement.folio}</td>
                    <td className="px-4 py-3">
                      <span className="block font-semibold text-[var(--unilabor-ink)]">{movement.asset_name}</span>
                      <span className="block text-xs">
                        <ChangeArrow from={movement.from_asset_code} to={movement.to_asset_code} />
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="space-y-0.5">
                        <div><span className="text-[var(--unilabor-neutral)]">Unidad: </span><ChangeArrow from={movement.from_unit_name} to={movement.to_unit_name} /></div>
                        <div><span className="text-[var(--unilabor-neutral)]">Área: </span><ChangeArrow from={movement.from_area_name} to={movement.to_area_name} /></div>
                        <div><span className="text-[var(--unilabor-neutral)]">Categoría: </span><ChangeArrow from={movement.from_category_name} to={movement.to_category_name} /></div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[var(--unilabor-ink)]">{movement.responsible_name}</td>
                    <td className="px-4 py-3 text-xs text-[var(--unilabor-neutral)]">{formatDateTime(movement.movement_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSignatureModal(movement)}
                          title="Ver firmas"
                          className="inline-flex items-center gap-1 rounded-lg border border-[rgba(0,65,106,0.12)] px-2.5 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
                        >
                          <PenSquare size={14} /> Firmas
                        </button>
                        {movement.code_changed && movement.to_asset_code ? (
                          <button
                            type="button"
                            onClick={() => void openReprintForAsset(movement.asset_id, movement.to_asset_code as string, movement.asset_name)}
                            title="Reimprimir etiqueta del activo con el nuevo código"
                            className="inline-flex items-center gap-1 rounded-lg border border-[rgba(0,65,106,0.12)] px-2.5 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
                          >
                            <Tag size={14} /> Etiqueta
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t border-[rgba(0,65,106,0.08)]">
              <Pagination page={currentPage} totalPages={totalPages} total={movements.length} pageSize={MOVEMENTS_PAGE_SIZE} onPageChange={setPage} loading={loading} />
            </div>
          </div>
        )}
      </div>

      {showForm ? (
        <MovementFormModal
          structure={structure}
          categories={categories}
          currentUserName={currentUserName}
          onClose={() => setShowForm(false)}
          onCreated={async (movement) => {
            setShowForm(false);
            if (movement.code_changed && movement.to_asset_code) {
              await openReprintForAsset(movement.asset_id, movement.to_asset_code, movement.asset_name);
            }
            await loadData();
          }}
        />
      ) : null}

      {signatureModal ? (
        <SignaturesModal movement={signatureModal} onClose={() => setSignatureModal(null)} />
      ) : null}

      {reprint ? (
        <AssetLabelModal
          assetCode={reprint.code}
          name={reprint.name}
          brand={reprint.brand}
          model={reprint.model}
          onClose={() => setReprint(null)}
        />
      ) : null}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Modal de firmas (evidencia)
// ---------------------------------------------------------------------------

const SignaturesModal = ({ movement, onClose }: { movement: HelpdeskAssetMovement; onClose: () => void }) => {
  const [performedUrl, setPerformedUrl] = useState<string | null>(null);
  const [responsibleUrl, setResponsibleUrl] = useState<string | null>(null);

  useEffect(() => {
    let performed: string | null = null;
    let responsible: string | null = null;
    void (async () => {
      try {
        performed = await fetchMovementSignatureUrl(movement.id, 'performed');
        setPerformedUrl(performed);
      } catch {
        setPerformedUrl(null);
      }
      try {
        responsible = await fetchMovementSignatureUrl(movement.id, 'responsible');
        setResponsibleUrl(responsible);
      } catch {
        setResponsibleUrl(null);
      }
    })();
    return () => {
      if (performed) URL.revokeObjectURL(performed);
      if (responsible) URL.revokeObjectURL(responsible);
    };
  }, [movement.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(11,34,53,0.28)] p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-[rgba(0,65,106,0.08)] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[rgba(0,65,106,0.08)] px-5 py-3">
          <div className="text-sm font-bold text-[var(--color-brand-700)]">Firmas del movimiento {movement.folio}</div>
          <button type="button" onClick={onClose} className="rounded-full p-1 text-[var(--unilabor-neutral)] transition hover:bg-[rgba(191,212,230,0.28)]">
            <X size={18} />
          </button>
        </div>
        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
          {[
            { label: 'Realiza el movimiento', name: movement.performed_by_name, url: performedUrl },
            { label: 'Responsable', name: movement.responsible_name, url: responsibleUrl },
          ].map((item) => (
            <div key={item.label} className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">{item.label}</p>
              <div className="flex h-28 items-center justify-center rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.96)]">
                {item.url ? (
                  <img src={item.url} alt={`Firma ${item.label}`} className="max-h-24 max-w-full" />
                ) : (
                  <Loader2 size={16} className="animate-spin text-[var(--unilabor-neutral)]" />
                )}
              </div>
              <p className="text-center text-sm font-semibold text-[var(--unilabor-ink)]">{item.name}</p>
            </div>
          ))}
        </div>
        {movement.reason ? (
          <div className="border-t border-[rgba(0,65,106,0.08)] px-5 py-3 text-sm">
            <span className="text-[var(--unilabor-neutral)]">Motivo: </span>
            <span className="text-[var(--unilabor-ink)]">{movement.reason}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Modal de alta de movimiento
// ---------------------------------------------------------------------------

interface MovementFormModalProps {
  structure: HelpdeskOrgStructure;
  categories: HelpdeskCatalogItem[];
  currentUserName: string;
  onClose: () => void;
  onCreated: (movement: HelpdeskAssetMovement) => Promise<void>;
}

const MovementFormModal = ({ structure, categories, currentUserName, onClose, onCreated }: MovementFormModalProps) => {
  const [assetQuery, setAssetQuery] = useState('');
  const [assetResults, setAssetResults] = useState<HelpdeskAsset[]>([]);
  const [searching, setSearching] = useState(false);
  const [asset, setAsset] = useState<HelpdeskAsset | null>(null);

  const [toUnitId, setToUnitId] = useState('');
  const [toAreaId, setToAreaId] = useState('');
  const [toCategoryId, setToCategoryId] = useState('');
  const [responsibleId, setResponsibleId] = useState('');
  const [responsibleName, setResponsibleName] = useState('');

  const [performedName, setPerformedName] = useState(currentUserName);
  const [reason, setReason] = useState('');
  const [performedSignature, setPerformedSignature] = useState<string | null>(null);
  const [responsibleSignature, setResponsibleSignature] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Búsqueda de activos con debounce.
  useEffect(() => {
    const term = assetQuery.trim();
    if (asset || term.length < 2) {
      setAssetResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const handle = setTimeout(async () => {
      try {
        const result = await listHelpdeskAssetsPaginated({ search: term, page: 1, limit: 8 });
        if (!cancelled) {
          setAssetResults(result.data);
        }
      } catch {
        if (!cancelled) setAssetResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [assetQuery, asset]);

  const handlePickAsset = (picked: HelpdeskAsset) => {
    setAsset(picked);
    setAssetResults([]);
    setAssetQuery('');
    setToUnitId(picked.unit_id ? String(picked.unit_id) : '');
    setToAreaId(picked.area_id ? String(picked.area_id) : '');
    setToCategoryId(picked.category_id ? String(picked.category_id) : '');
    setResponsibleId('');
    setResponsibleName('');
  };

  const unitOptions = useMemo(
    () => structure.units.map((unit) => ({ value: String(unit.id), label: unit.name, hint: unit.code ?? undefined })),
    [structure.units],
  );
  const areaOptions = useMemo(() => {
    const unitId = Number(toUnitId);
    if (!unitId) return [];
    return structure.areas
      .filter((area) => area.unit_ids.includes(unitId))
      .map((area) => ({ value: String(area.id), label: area.name, hint: area.code ?? undefined }));
  }, [structure.areas, toUnitId]);
  const categoryOptions = useMemo(
    () => categories.map((category) => ({ value: String(category.id), label: category.name, hint: category.code ?? undefined })),
    [categories],
  );
  const responsibleOptions = useMemo(() => {
    const areaId = Number(toAreaId);
    const area = structure.areas.find((item) => item.id === areaId);
    if (!area) return [];
    return structure.users
      .filter((candidate) => area.responsible_user_ids.includes(candidate.id))
      .map((candidate) => ({ value: candidate.id, label: candidate.full_name, hint: candidate.email }));
  }, [structure.areas, structure.users, toAreaId]);

  const handleSelectUnit = (value: string) => {
    setToUnitId(value);
    // Si el área actual no pertenece a la nueva unidad, se limpia (y su responsable).
    const unitId = Number(value);
    const areaStillValid = structure.areas.some((area) => area.id === Number(toAreaId) && area.unit_ids.includes(unitId));
    if (!areaStillValid) {
      setToAreaId('');
      setResponsibleId('');
      setResponsibleName('');
    }
  };
  const handleSelectArea = (value: string) => {
    setToAreaId(value);
    setResponsibleId('');
    setResponsibleName('');
  };
  const handleSelectResponsible = (value: string) => {
    setResponsibleId(value);
    setResponsibleName(structure.users.find((item) => item.id === value)?.full_name ?? '');
  };

  const orgChanged = Boolean(
    asset &&
      (Number(toUnitId) !== (asset.unit_id ?? 0) ||
        Number(toAreaId) !== (asset.area_id ?? 0) ||
        Number(toCategoryId) !== (asset.category_id ?? 0)),
  );

  const canSubmit = Boolean(
    asset &&
      reason.trim() &&
      performedName.trim() &&
      performedSignature &&
      responsibleName.trim() &&
      responsibleSignature &&
      (orgChanged || responsibleId),
  );

  const handleSubmit = async () => {
    if (!asset || !performedSignature || !responsibleSignature) {
      return;
    }
    setSubmitting(true);
    try {
      const movement = await createHelpdeskAssetMovement({
        asset_id: asset.id,
        to_unit_id: toUnitId ? Number(toUnitId) : null,
        to_area_id: toAreaId ? Number(toAreaId) : null,
        to_category_id: toCategoryId ? Number(toCategoryId) : null,
        reason: reason.trim(),
        performed_by_name: performedName.trim(),
        performed_by_signature: performedSignature,
        responsible_user_id: responsibleId || null,
        responsible_name: responsibleName.trim(),
        responsible_signature: responsibleSignature,
      });
      notifySuccess(`Movimiento ${movement.folio} registrado${movement.code_changed ? ` · nuevo código ${movement.to_asset_code}` : ''}.`);
      await onCreated(movement);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo registrar el movimiento.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[rgba(11,34,53,0.28)] p-4 backdrop-blur-sm">
      <div className="my-6 w-full max-w-2xl overflow-hidden rounded-3xl border border-[rgba(0,65,106,0.08)] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[rgba(0,65,106,0.08)] px-5 py-3">
          <div className="text-sm font-bold text-[var(--color-brand-700)]">Nuevo movimiento de activo</div>
          <button type="button" onClick={onClose} className="rounded-full p-1 text-[var(--unilabor-neutral)] transition hover:bg-[rgba(191,212,230,0.28)]">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {/* Selección de activo */}
          {!asset ? (
            <div>
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Activo</span>
              <div className="flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-white px-3 py-2">
                <Search size={16} className="text-[var(--color-brand-700)]" />
                <input
                  value={assetQuery}
                  onChange={(event) => setAssetQuery(event.target.value)}
                  placeholder="Buscar por código, nombre o serie…"
                  className="w-full bg-transparent text-sm outline-none"
                  autoFocus
                />
                {searching ? <Loader2 size={14} className="animate-spin text-[var(--unilabor-neutral)]" /> : null}
              </div>
              {assetResults.length > 0 ? (
                <div className="mt-1 max-h-56 overflow-y-auto rounded-xl border border-[rgba(0,65,106,0.1)] bg-white">
                  {assetResults.map((result) => (
                    <button
                      key={result.id}
                      type="button"
                      onClick={() => handlePickAsset(result)}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition hover:bg-[rgba(191,212,230,0.28)]"
                    >
                      <span className="min-w-0">
                        <span className="block font-semibold text-[var(--color-brand-700)]">{result.asset_code}</span>
                        <span className="block truncate text-xs text-[var(--unilabor-neutral)]">{result.name}</span>
                      </span>
                      <span className="shrink-0 text-xs text-[var(--unilabor-neutral)]">{result.area?.name ?? ''}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.96)] px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-bold text-[var(--color-brand-700)]">{asset.asset_code}</p>
                <p className="truncate text-xs text-[var(--unilabor-neutral)]">
                  {asset.name} · {asset.unit?.name ?? '—'} / {asset.area?.name ?? '—'} / {asset.category?.name ?? '—'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAsset(null)}
                className="shrink-0 rounded-lg border border-[rgba(0,65,106,0.12)] px-2.5 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
              >
                Cambiar
              </button>
            </div>
          )}

          {asset ? (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Unidad destino</span>
                  <SearchableSelect value={toUnitId} onChange={handleSelectUnit} options={unitOptions} placeholder="Unidad" searchPlaceholder="Buscar unidad..." />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Área destino</span>
                  <SearchableSelect value={toAreaId} onChange={handleSelectArea} options={areaOptions} placeholder={toUnitId ? 'Área' : 'Elige unidad'} searchPlaceholder="Buscar área..." disabled={!toUnitId} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Categoría destino</span>
                  <SearchableSelect value={toCategoryId} onChange={setToCategoryId} options={categoryOptions} placeholder="Categoría" searchPlaceholder="Buscar categoría..." />
                </label>
              </div>

              {orgChanged ? (
                <p className="rounded-xl border border-[rgba(0,65,106,0.1)] bg-[rgba(248,251,253,0.96)] px-3 py-2 text-xs text-[var(--unilabor-ink)]">
                  El código de inventario se <strong className="text-[var(--color-brand-700)]">regenerará</strong> (UNIDAD-ÁREA-CATEGORÍA-NNN) con el consecutivo del área destino. Podrás reimprimir la etiqueta al terminar.
                </p>
              ) : null}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Responsable destino</span>
                  <SearchableSelect value={responsibleId} onChange={handleSelectResponsible} options={responsibleOptions} placeholder={toAreaId ? 'Responsable del área' : 'Elige área'} searchPlaceholder="Buscar responsable..." disabled={!toAreaId} />
                  {toAreaId && responsibleOptions.length === 0 ? (
                    <span className="mt-1 block text-xs text-[#b02a2a]">El área destino no tiene responsables. Configúralos en Estructura o escribe el nombre abajo.</span>
                  ) : null}
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Nombre del responsable</span>
                  <input value={responsibleName} onChange={(event) => setResponsibleName(event.target.value)} placeholder="Nombre de quien recibe" className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] px-3 py-2 text-sm outline-none" />
                </label>
              </div>

              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Motivo del movimiento</span>
                <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} placeholder="Describe el motivo…" className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] px-3 py-2 text-sm outline-none" />
              </label>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Nombre de quien realiza</span>
                    <input value={performedName} onChange={(event) => setPerformedName(event.target.value)} className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] px-3 py-2 text-sm outline-none" />
                  </label>
                  <SignaturePad label="Firma de quien realiza" onChange={setPerformedSignature} />
                </div>
                <div className="space-y-2 sm:pt-[26px]">
                  <SignaturePad label="Firma del responsable" onChange={setResponsibleSignature} />
                </div>
              </div>
            </>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-[rgba(0,65,106,0.08)] px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-xl border border-[rgba(0,65,106,0.12)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]">
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit || submitting}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-brand-700)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
            Registrar movimiento
          </button>
        </div>
      </div>
    </div>
  );
};
