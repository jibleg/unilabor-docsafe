import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Ban,
  Check,
  ClipboardCheck,
  FileText,
  Loader2,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { SearchableSelect } from '../components/SearchableSelect';
import { SignaturePad } from '../components/helpdesk/SignaturePad';
import { BarcodeScanner } from '../components/helpdesk/BarcodeScanner';
import { AssetLabelsPrintModal } from '../components/helpdesk/AssetLabelsPrintModal';
import { Pagination } from '../components/Pagination';
import {
  createHelpdeskHandover,
  deleteHelpdeskHandover,
  fetchHelpdeskHandoverActaUrl,
  getApiErrorMessage,
  getHelpdeskOrgStructure,
  listHandoverPendingAssets,
  listHelpdeskCatalogs,
  listHelpdeskHandovers,
  signHelpdeskHandover,
  voidHelpdeskHandover,
} from '../api/service';
import type {
  HelpdeskAsset,
  HelpdeskCatalogItem,
  HelpdeskHandover,
  HelpdeskOrgStructure,
} from '../types/models';
import { useAuthStore } from '../store/useAuthStore';
import { confirmAction } from '../utils/confirm';
import { notifyError, notifySuccess, notifyWarning } from '../utils/notify';

const EMPTY_STRUCTURE: HelpdeskOrgStructure = { units: [], areas: [], users: [] };
const HANDOVERS_PAGE_SIZE = 10;

interface AssetMeta {
  receipt_condition_id: number | null;
  observations: string;
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  DRAFT: { label: 'Borrador', className: 'bg-[rgba(82,96,109,0.12)] text-[#52606d]' },
  SIGNED: { label: 'Firmada', className: 'bg-[rgba(22,128,74,0.12)] text-[#16804a]' },
  VOID: { label: 'Anulada', className: 'bg-[rgba(176,42,42,0.12)] text-[#b02a2a]' },
};

const formatDateTime = (value?: string | null): string => {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
};

export const HelpdeskHandoversPage = () => {
  const user = useAuthStore((state) => state.user);
  const currentUserName = user?.full_name ?? user?.name ?? '';

  const [structure, setStructure] = useState<HelpdeskOrgStructure>(EMPTY_STRUCTURE);
  const [receiptConditions, setReceiptConditions] = useState<HelpdeskCatalogItem[]>([]);
  const [handovers, setHandovers] = useState<HelpdeskHandover[]>([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'list' | 'wizard'>('list');
  const [voidTarget, setVoidTarget] = useState<HelpdeskHandover | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voiding, setVoiding] = useState(false);
  const [page, setPage] = useState(1);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const [structureData, catalogs, list] = await Promise.all([
        getHelpdeskOrgStructure(),
        listHelpdeskCatalogs(),
        listHelpdeskHandovers(),
      ]);
      setStructure(structureData);
      setReceiptConditions(catalogs.receipt_conditions);
      setHandovers(list);
      setPage(1);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudieron cargar las actas de entrega-recepción.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const handleView = async (handover: HelpdeskHandover) => {
    try {
      const url = await fetchHelpdeskHandoverActaUrl(handover.id);
      window.open(url, '_blank', 'noopener');
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo abrir el acta.'));
    }
  };

  const confirmVoid = async () => {
    if (!voidTarget) {
      return;
    }
    const reason = voidReason.trim();
    if (!reason) {
      notifyWarning('La anulación requiere un motivo.');
      return;
    }
    setVoiding(true);
    try {
      await voidHelpdeskHandover(voidTarget.id, reason);
      notifySuccess('Acta anulada correctamente.');
      setVoidTarget(null);
      setVoidReason('');
      await loadList();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo anular el acta.'));
    } finally {
      setVoiding(false);
    }
  };

  const handleDeleteDraft = async (handover: HelpdeskHandover) => {
    const confirmed = await confirmAction(
      'Eliminar borrador',
      `¿Eliminar el borrador ${handover.folio}?`,
      'Eliminar',
      'danger',
    );
    if (!confirmed) {
      return;
    }
    try {
      await deleteHelpdeskHandover(handover.id);
      notifySuccess('Borrador eliminado.');
      await loadList();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo eliminar el borrador.'));
    }
  };

  const totalHandovers = handovers.length;
  const totalPages = Math.max(1, Math.ceil(totalHandovers / HANDOVERS_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedHandovers = handovers.slice(
    (currentPage - 1) * HANDOVERS_PAGE_SIZE,
    currentPage * HANDOVERS_PAGE_SIZE,
  );

  if (view === 'wizard') {
    return (
      <HandoverWizard
        structure={structure}
        receiptConditions={receiptConditions}
        currentUserName={currentUserName}
        onCancel={() => setView('list')}
        onDone={async () => {
          setView('list');
          await loadList();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--color-brand-500)]">
            Trazabilidad ISO 15189
          </p>
          <h1 className="mt-2 text-3xl font-bold text-[var(--color-brand-700)]">Entrega-Recepción</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--unilabor-neutral)]">
            Actas de entrega-recepción de activos con firma electrónica del entrega y del responsable que recibe.
            Cada activo entregado queda trazado en su expediente y no vuelve a estar disponible salvo que el acta se
            anule.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadList()}
            className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.12)] bg-white/90 px-4 py-2.5 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Recargar
          </button>
          <button
            type="button"
            onClick={() => setView('wizard')}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-brand-700)] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          >
            <Plus size={16} />
            Nueva acta
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/90 shadow-xl shadow-[rgba(0,65,106,0.08)]">
        {handovers.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-12 text-center">
            <ClipboardCheck size={32} className="text-[var(--color-brand-500)]" />
            <p className="text-sm font-semibold text-[var(--color-brand-700)]">Aún no hay actas de entrega-recepción.</p>
            <p className="max-w-md text-sm text-[var(--unilabor-neutral)]">
              Crea una nueva acta para entregar los activos de un área a su responsable.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b border-[rgba(0,65,106,0.1)] bg-[rgba(248,251,253,0.96)] text-[11px] uppercase tracking-wide text-[var(--unilabor-neutral)]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Folio</th>
                  <th className="px-4 py-3 font-semibold">Unidad / Área</th>
                  <th className="px-4 py-3 font-semibold">Recibe</th>
                  <th className="px-4 py-3 font-semibold">Activos</th>
                  <th className="px-4 py-3 font-semibold">Fecha</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3 text-right font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(0,65,106,0.06)]">
                {pagedHandovers.map((handover) => {
                  const badge = STATUS_BADGE[handover.status] ?? STATUS_BADGE.DRAFT;
                  return (
                    <tr key={handover.id} className="transition hover:bg-[rgba(191,212,230,0.16)]">
                      <td className="px-4 py-3 font-bold text-[var(--color-brand-700)]">{handover.folio}</td>
                      <td className="px-4 py-3">
                        <span className="block font-semibold text-[var(--unilabor-ink)]">{handover.area_name ?? '—'}</span>
                        <span className="block text-xs text-[var(--unilabor-neutral)]">{handover.unit_name ?? '—'}</span>
                      </td>
                      <td className="px-4 py-3 text-[var(--unilabor-ink)]">{handover.received_by_name}</td>
                      <td className="px-4 py-3 text-[var(--unilabor-ink)]">{handover.item_count}</td>
                      <td className="px-4 py-3 text-xs text-[var(--unilabor-neutral)]">{formatDateTime(handover.handover_at ?? handover.created_at)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${badge.className}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          {handover.status === 'SIGNED' && handover.has_document ? (
                            <button
                              type="button"
                              onClick={() => void handleView(handover)}
                              title="Ver acta PDF"
                              className="inline-flex items-center gap-1 rounded-lg border border-[rgba(0,65,106,0.12)] px-2.5 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
                            >
                              <FileText size={14} /> Acta
                            </button>
                          ) : null}
                          {handover.status === 'SIGNED' ? (
                            <button
                              type="button"
                              onClick={() => {
                                setVoidReason('');
                                setVoidTarget(handover);
                              }}
                              title="Anular acta"
                              className="inline-flex items-center gap-1 rounded-lg border border-[rgba(176,42,42,0.2)] px-2.5 py-1.5 text-xs font-semibold text-[#b02a2a] transition hover:bg-[rgba(176,42,42,0.08)]"
                            >
                              <Ban size={14} /> Anular
                            </button>
                          ) : null}
                          {handover.status === 'DRAFT' ? (
                            <button
                              type="button"
                              onClick={() => void handleDeleteDraft(handover)}
                              title="Eliminar borrador"
                              className="inline-flex items-center gap-1 rounded-lg border border-[rgba(176,42,42,0.2)] px-2.5 py-1.5 text-xs font-semibold text-[#b02a2a] transition hover:bg-[rgba(176,42,42,0.08)]"
                            >
                              <Trash2 size={14} /> Eliminar
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="border-t border-[rgba(0,65,106,0.08)]">
              <Pagination
                page={currentPage}
                totalPages={totalPages}
                total={totalHandovers}
                pageSize={HANDOVERS_PAGE_SIZE}
                onPageChange={setPage}
                loading={loading}
              />
            </div>
          </div>
        )}
      </div>

      {voidTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(11,34,53,0.28)] p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-3xl border border-[rgba(0,65,106,0.08)] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[rgba(0,65,106,0.08)] px-5 py-3">
              <div className="text-sm font-bold text-[#b02a2a]">Anular acta {voidTarget.folio}</div>
              <button
                type="button"
                onClick={() => setVoidTarget(null)}
                className="rounded-full p-1 text-[var(--unilabor-neutral)] transition hover:bg-[rgba(191,212,230,0.28)]"
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3 p-5">
              <p className="text-sm text-[var(--unilabor-ink)]">
                Los <strong>{voidTarget.item_count}</strong> activo(s) volverán a estar disponibles para una nueva entrega.
                Esta acción queda registrada y no se puede deshacer.
              </p>
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                  Motivo de la anulación
                </span>
                <textarea
                  value={voidReason}
                  onChange={(event) => setVoidReason(event.target.value)}
                  rows={3}
                  autoFocus
                  placeholder="Describe el motivo…"
                  className="w-full rounded-xl border border-[rgba(0,65,106,0.14)] px-3 py-2 text-sm outline-none"
                />
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-[rgba(0,65,106,0.08)] px-5 py-4">
              <button
                type="button"
                onClick={() => setVoidTarget(null)}
                className="rounded-xl border border-[rgba(0,65,106,0.12)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void confirmVoid()}
                disabled={voiding || !voidReason.trim()}
                className="inline-flex items-center gap-2 rounded-xl bg-[#b02a2a] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {voiding ? <Loader2 size={16} className="animate-spin" /> : <Ban size={16} />}
                Anular acta
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Wizard de creación de acta
// ---------------------------------------------------------------------------

interface HandoverWizardProps {
  structure: HelpdeskOrgStructure;
  receiptConditions: HelpdeskCatalogItem[];
  currentUserName: string;
  onCancel: () => void;
  onDone: () => Promise<void>;
}

const STEPS = ['Alcance', 'Cotejo', 'Etiquetas', 'Firmas', 'Confirmar'];

const normalizeText = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const HandoverWizard = ({
  structure,
  receiptConditions,
  currentUserName,
  onCancel,
  onDone,
}: HandoverWizardProps) => {
  const [step, setStep] = useState(0);

  const [unitId, setUnitId] = useState('');
  const [areaId, setAreaId] = useState('');
  const [responsibleId, setResponsibleId] = useState('');

  const [pendingAssets, setPendingAssets] = useState<HelpdeskAsset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [meta, setMeta] = useState<Record<number, AssetMeta>>({});
  const [assetSearch, setAssetSearch] = useState('');

  const [delivererName, setDelivererName] = useState(currentUserName);
  const [receiverName, setReceiverName] = useState('');
  const [delivererSignature, setDelivererSignature] = useState<string | null>(null);
  const [receiverSignature, setReceiverSignature] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showLabels, setShowLabels] = useState(false);

  const unitOptions = useMemo(
    () => structure.units.map((unit) => ({ value: String(unit.id), label: unit.name, hint: unit.code ?? undefined })),
    [structure.units],
  );

  const areaOptions = useMemo(() => {
    const numericUnit = Number(unitId);
    if (!numericUnit) {
      return [];
    }
    return structure.areas
      .filter((area) => area.unit_ids.includes(numericUnit))
      .map((area) => ({ value: String(area.id), label: area.name, hint: area.code ?? undefined }));
  }, [structure.areas, unitId]);

  const responsibleOptions = useMemo(() => {
    const numericArea = Number(areaId);
    if (!numericArea) {
      return [];
    }
    const area = structure.areas.find((item) => item.id === numericArea);
    if (!area) {
      return [];
    }
    return structure.users
      .filter((candidate) => area.responsible_user_ids.includes(candidate.id))
      .map((candidate) => ({ value: candidate.id, label: candidate.full_name, hint: candidate.email }));
  }, [structure.areas, structure.users, areaId]);

  const loadPending = useCallback(async (numericArea: number, responsibleUserId?: string | null) => {
    setLoadingAssets(true);
    try {
      setPendingAssets(await listHandoverPendingAssets(numericArea, responsibleUserId));
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudieron cargar los activos pendientes.'));
    } finally {
      setLoadingAssets(false);
    }
  }, []);

  const handleSelectUnit = (value: string) => {
    setUnitId(value);
    setAreaId('');
    setResponsibleId('');
    setReceiverName('');
    setPendingAssets([]);
    setSelected(new Set());
    setMeta({});
  };

  const handleSelectArea = (value: string) => {
    setAreaId(value);
    setResponsibleId('');
    setReceiverName('');
    setSelected(new Set());
    setMeta({});
    const numericArea = Number(value);
    if (numericArea) {
      void loadPending(numericArea);
    } else {
      setPendingAssets([]);
    }
  };

  const handleSelectResponsible = (value: string) => {
    setResponsibleId(value);
    const candidate = structure.users.find((item) => item.id === value);
    setReceiverName(candidate?.full_name ?? '');
    setSelected(new Set());
    setMeta({});
    const numericArea = Number(areaId);
    if (numericArea) {
      void loadPending(numericArea, value || null);
    }
  };

  const toggleAsset = (assetId: number) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(assetId)) {
        next.delete(assetId);
      } else {
        next.add(assetId);
      }
      return next;
    });
  };

  const handleScan = (code: string) => {
    const match = pendingAssets.find(
      (asset) => asset.asset_code.toLowerCase() === code.toLowerCase(),
    );
    if (!match) {
      notifyWarning(`El código "${code}" no está entre los pendientes de esta área.`);
      return;
    }
    setSelected((current) => {
      if (current.has(match.id)) {
        notifyWarning(`${match.asset_code} ya estaba cotejado.`);
        return current;
      }
      const next = new Set(current);
      next.add(match.id);
      notifySuccess(`Cotejado: ${match.asset_code}`);
      return next;
    });
  };

  const filteredAssets = useMemo(() => {
    const term = normalizeText(assetSearch.trim());
    if (!term) {
      return pendingAssets;
    }
    return pendingAssets.filter((asset) =>
      normalizeText(`${asset.asset_code} ${asset.name} ${asset.serial_number ?? ''}`).includes(term),
    );
  }, [pendingAssets, assetSearch]);

  const selectedAssets = useMemo(
    () => pendingAssets.filter((asset) => selected.has(asset.id)),
    [pendingAssets, selected],
  );

  const updateMeta = (assetId: number, patch: Partial<AssetMeta>) => {
    setMeta((current) => ({
      ...current,
      [assetId]: {
        receipt_condition_id: current[assetId]?.receipt_condition_id ?? null,
        observations: current[assetId]?.observations ?? '',
        ...patch,
      },
    }));
  };

  const canNext = useMemo(() => {
    if (step === 0) {
      return Boolean(unitId && areaId && responsibleId);
    }
    if (step === 1) {
      return selected.size > 0;
    }
    if (step === 3) {
      return Boolean(delivererName.trim() && receiverName.trim() && delivererSignature && receiverSignature);
    }
    // Paso 2 (Etiquetas) y paso 4 (Confirmar) no bloquean el avance.
    return true;
  }, [step, unitId, areaId, responsibleId, selected.size, delivererName, receiverName, delivererSignature, receiverSignature]);

  const handleSubmit = async () => {
    if (!delivererSignature || !receiverSignature) {
      return;
    }
    setSubmitting(true);
    let draftId: number | null = null;
    try {
      const draft = await createHelpdeskHandover({
        unit_id: Number(unitId),
        area_id: Number(areaId),
        received_by_user_id: responsibleId,
        received_by_name: receiverName.trim(),
        delivered_by_name: delivererName.trim(),
        notes: notes.trim() || null,
        items: selectedAssets.map((asset) => ({
          asset_id: asset.id,
          receipt_condition_id: meta[asset.id]?.receipt_condition_id ?? null,
          observations: meta[asset.id]?.observations?.trim() || null,
        })),
      });
      draftId = draft.id;

      const signed = await signHelpdeskHandover(draft.id, {
        deliverer_signature: delivererSignature,
        receiver_signature: receiverSignature,
        delivered_by_name: delivererName.trim(),
        received_by_name: receiverName.trim(),
        notes: notes.trim() || null,
      });

      notifySuccess(`Acta ${signed?.folio ?? ''} firmada correctamente.`);
      if (signed) {
        try {
          const url = await fetchHelpdeskHandoverActaUrl(signed.id);
          window.open(url, '_blank', 'noopener');
        } catch {
          // El acta ya quedo firmada; abrir el PDF es secundario.
        }
      }
      await onDone();
    } catch (error) {
      // Si el borrador se creó pero la firma falló, se elimina para no dejar basura.
      if (draftId) {
        try {
          await deleteHelpdeskHandover(draftId);
        } catch {
          // best-effort
        }
      }
      notifyError(getApiErrorMessage(error, 'No se pudo generar el acta.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-brand-700)]">Nueva acta de entrega-recepción</h1>
          <p className="text-sm text-[var(--unilabor-neutral)]">Cotejo en sitio y firma electrónica de ambas partes.</p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-2 self-start rounded-xl border border-[rgba(0,65,106,0.12)] px-4 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
        >
          <X size={16} /> Cancelar
        </button>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2">
        {STEPS.map((label, index) => (
          <div key={label} className="flex flex-1 items-center gap-2">
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                index < step
                  ? 'bg-[var(--color-brand-500)] text-white'
                  : index === step
                    ? 'bg-[var(--color-brand-700)] text-white'
                    : 'bg-[rgba(0,65,106,0.1)] text-[var(--unilabor-neutral)]'
              }`}
            >
              {index < step ? <Check size={14} /> : index + 1}
            </div>
            <span className={`text-xs font-semibold ${index === step ? 'text-[var(--color-brand-700)]' : 'text-[var(--unilabor-neutral)]'}`}>
              {label}
            </span>
            {index < STEPS.length - 1 ? <div className="h-px flex-1 bg-[rgba(0,65,106,0.12)]" /> : null}
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/90 p-5 shadow-xl shadow-[rgba(0,65,106,0.08)]">
        {step === 0 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Unidad</span>
              <SearchableSelect value={unitId} onChange={handleSelectUnit} options={unitOptions} placeholder="Selecciona una unidad" searchPlaceholder="Buscar unidad..." />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Área</span>
              <SearchableSelect value={areaId} onChange={handleSelectArea} options={areaOptions} placeholder={unitId ? 'Selecciona un área' : 'Selecciona primero una unidad'} searchPlaceholder="Buscar área..." disabled={!unitId} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Responsable que recibe</span>
              <SearchableSelect value={responsibleId} onChange={handleSelectResponsible} options={responsibleOptions} placeholder={areaId ? 'Selecciona un responsable' : 'Selecciona primero un área'} searchPlaceholder="Buscar responsable..." disabled={!areaId} />
              {areaId && responsibleOptions.length === 0 ? (
                <span className="mt-1 block text-xs text-[#b02a2a]">Esta área no tiene responsables asignados. Configúralos en Estructura.</span>
              ) : null}
            </label>
            {areaId ? (
              <div className="md:col-span-3">
                <p className="rounded-xl border border-[rgba(0,65,106,0.1)] bg-[rgba(248,251,253,0.96)] px-4 py-3 text-sm text-[var(--unilabor-ink)]">
                  {loadingAssets ? (
                    <span className="inline-flex items-center gap-2 text-[var(--unilabor-neutral)]"><Loader2 size={14} className="animate-spin" /> Cargando pendientes…</span>
                  ) : (
                    <>
                      <strong className="text-[var(--color-brand-700)]">{pendingAssets.length}</strong> activo(s) pendiente(s) de entrega
                      {responsibleId ? ' de este responsable' : ' en esta área'}.
                    </>
                  )}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-4">
            <BarcodeScanner onScan={handleScan} />
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.12)] bg-white px-3 py-2 sm:w-72">
                <Search size={16} className="text-[var(--color-brand-700)]" />
                <input value={assetSearch} onChange={(event) => setAssetSearch(event.target.value)} placeholder="Buscar por código, nombre o serie…" className="w-full bg-transparent text-sm outline-none" />
              </div>
              <span className="text-sm font-semibold text-[var(--color-brand-700)]">
                {selected.size} de {pendingAssets.length} cotejado(s)
              </span>
            </div>

            <div className="max-h-80 space-y-1 overflow-y-auto rounded-xl border border-[rgba(0,65,106,0.1)] bg-[rgba(248,251,253,0.96)] p-2">
              {filteredAssets.length === 0 ? (
                <p className="p-4 text-sm text-[var(--unilabor-neutral)]">No hay activos pendientes que coincidan.</p>
              ) : (
                filteredAssets.map((asset) => {
                  const active = selected.has(asset.id);
                  return (
                    <button
                      key={asset.id}
                      type="button"
                      role="switch"
                      aria-checked={active}
                      onClick={() => toggleAsset(asset.id)}
                      className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-[rgba(191,212,230,0.28)]"
                    >
                      <span
                        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition ${
                          active ? 'bg-[var(--color-brand-500)]' : 'bg-[rgba(0,65,106,0.18)]'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
                            active ? 'translate-x-4' : 'translate-x-0.5'
                          }`}
                        />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-[var(--color-brand-700)]">{asset.asset_code}</span>
                        <span className="block truncate text-xs text-[var(--unilabor-neutral)]">
                          {asset.name}
                          {asset.serial_number ? ` · S/N ${asset.serial_number}` : ''}
                        </span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            {selectedAssets.length > 0 ? (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Detalle de los seleccionados (opcional)</p>
                <div className="max-h-64 space-y-2 overflow-y-auto">
                  {selectedAssets.map((asset) => (
                    <div key={asset.id} className="grid grid-cols-1 gap-2 rounded-xl border border-[rgba(0,65,106,0.1)] bg-white p-3 sm:grid-cols-[1fr_170px]">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[var(--color-brand-700)]">{asset.asset_code}</p>
                        <input
                          value={meta[asset.id]?.observations ?? ''}
                          onChange={(event) => updateMeta(asset.id, { observations: event.target.value })}
                          placeholder="Observaciones del equipo…"
                          className="mt-1 w-full rounded-lg border border-[rgba(0,65,106,0.12)] px-2 py-1 text-xs outline-none"
                        />
                      </div>
                      <select
                        value={meta[asset.id]?.receipt_condition_id ?? ''}
                        onChange={(event) => updateMeta(asset.id, { receipt_condition_id: event.target.value ? Number(event.target.value) : null })}
                        className="h-9 self-end rounded-lg border border-[rgba(0,65,106,0.12)] px-2 text-xs outline-none"
                      >
                        <option value="">Condición…</option>
                        {receiptConditions.map((condition) => (
                          <option key={condition.id} value={condition.id}>{condition.name}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-[rgba(0,65,106,0.1)] bg-[rgba(248,251,253,0.96)] p-4">
              <p className="text-sm text-[var(--unilabor-ink)]">
                Imprime las etiquetas Code128 de los{' '}
                <strong className="text-[var(--color-brand-700)]">{selectedAssets.length}</strong> activo(s) a entregar para
                pegarlas/verificarlas durante la entrega (una etiqueta de 50 × 25 mm por activo, en una sola corrida).
              </p>
              <button
                type="button"
                onClick={() => setShowLabels(true)}
                disabled={selectedAssets.length === 0}
                className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[var(--color-brand-700)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
              >
                <Printer size={16} /> Imprimir etiquetas ({selectedAssets.length})
              </button>
            </div>
            <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-[rgba(0,65,106,0.1)] bg-white p-2">
              {selectedAssets.map((asset) => (
                <div key={asset.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="shrink-0 font-semibold text-[var(--color-brand-700)]">{asset.asset_code}</span>
                  <span className="truncate text-xs text-[var(--unilabor-neutral)]">{asset.name}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-[var(--unilabor-neutral)]">Este paso es opcional; puedes continuar sin imprimir.</p>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Nombre de quien entrega</span>
                  <input value={delivererName} onChange={(event) => setDelivererName(event.target.value)} className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] px-3 py-2 text-sm outline-none" />
                </label>
                <SignaturePad label="Firma de quien entrega" onChange={setDelivererSignature} />
              </div>
              <div className="space-y-2">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Nombre de quien recibe (responsable)</span>
                  <input value={receiverName} onChange={(event) => setReceiverName(event.target.value)} className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] px-3 py-2 text-sm outline-none" />
                </label>
                <SignaturePad label="Firma de quien recibe" onChange={setReceiverSignature} />
              </div>
            </div>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Observaciones generales (opcional)</span>
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] px-3 py-2 text-sm outline-none" />
            </label>
            <p className="text-xs text-[var(--unilabor-neutral)]">La fecha y hora se registran automáticamente al firmar.</p>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <SummaryTile label="Unidad" value={structure.units.find((unit) => String(unit.id) === unitId)?.name ?? '—'} />
              <SummaryTile label="Área" value={structure.areas.find((area) => String(area.id) === areaId)?.name ?? '—'} />
              <SummaryTile label="Entrega" value={delivererName} />
              <SummaryTile label="Recibe" value={receiverName} />
            </div>
            <div className="rounded-xl border border-[rgba(0,65,106,0.1)] bg-[rgba(248,251,253,0.96)] p-4">
              <p className="text-sm">
                Se firmará el acta con <strong className="text-[var(--color-brand-700)]">{selectedAssets.length}</strong> activo(s).
                Al confirmar se genera el PDF, se registra en el expediente de cada equipo y quedan bloqueados para futuras entregas.
              </p>
            </div>
          </div>
        ) : null}
      </div>

      {/* Navegación */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => (step === 0 ? onCancel() : setStep((value) => value - 1))}
          className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.12)] px-4 py-2.5 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
        >
          <ArrowLeft size={16} /> {step === 0 ? 'Cancelar' : 'Atrás'}
        </button>
        {step < STEPS.length - 1 ? (
          <button
            type="button"
            onClick={() => setStep((value) => value + 1)}
            disabled={!canNext}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-brand-700)] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            Siguiente <ArrowRight size={16} />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting || selectedAssets.length === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-brand-700)] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
            Firmar y generar acta
          </button>
        )}
      </div>

      {showLabels ? (
        <AssetLabelsPrintModal
          assets={selectedAssets.map((asset) => ({
            assetCode: asset.asset_code,
            name: asset.name,
            brand: asset.brand_name ?? asset.brand?.name ?? null,
            model: asset.model ?? null,
          }))}
          onClose={() => setShowLabels(false)}
        />
      ) : null}
    </div>
  );
};

const SummaryTile = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-xl border border-[rgba(0,65,106,0.1)] bg-white p-3">
    <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">{label}</p>
    <p className="mt-1 truncate text-sm font-semibold text-[var(--unilabor-ink)]">{value}</p>
  </div>
);
