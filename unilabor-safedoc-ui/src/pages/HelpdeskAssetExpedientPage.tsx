import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronRight,
  Eye,
  LifeBuoy,
  Loader2,
  PackagePlus,
  Wrench,
  ShieldCheck,
  AlertTriangle,
  MapPin,
  Trash2,
  Boxes,
  FileSignature,
  Move,
  Printer,
  Plus,
  X,
} from 'lucide-react';
import {
  fetchAssetExpedient,
  createLifecycleEvent,
  uploadAssetDocument,
  getAssetDocumentBlobUrl,
  listHelpdeskCatalogs,
  getApiErrorMessage,
} from '../api/service';
import type {
  HelpdeskAssetExpedient,
  HelpdeskCatalogs,
  HelpdeskLifecycleEvent,
  HelpdeskLifecycleEventPayload,
} from '../types/models';
import { notifyError, notifySuccess } from '../utils/notify';
import { PdfSafeViewer } from '../components/PdfSafeViewerSafe';
import { LifecycleEventForm } from '../components/helpdesk/LifecycleEventForm';
import { AssetEvidencePanel } from '../components/helpdesk/AssetEvidencePanel';
import { AssetLabelModal } from '../components/helpdesk/AssetLabelModal';

const EVENT_ICONS: Record<string, typeof PackagePlus> = {
  ACQUISITION: PackagePlus,
  HANDOVER: FileSignature,
  COMMISSIONING: Boxes,
  MAINTENANCE: Wrench,
  CALIBRATION: ShieldCheck,
  INCIDENT: AlertTriangle,
  RELOCATION: MapPin,
  MOVEMENT: Move,
  DECOMMISSION: Trash2,
};

const dash = (value: unknown) => (value === null || value === undefined || value === '' ? '—' : String(value));

const IdentityRow = ({ label, value }: { label: string; value: unknown }) => (
  <div className="flex flex-col">
    <span className="text-xs text-[var(--unilabor-neutral)]">{label}</span>
    <span className="text-sm font-semibold text-[var(--unilabor-ink)]">{dash(value)}</span>
  </div>
);

export const HelpdeskAssetExpedientPage = () => {
  const { id } = useParams();
  const assetId = Number(id);
  const navigate = useNavigate();

  const [expedient, setExpedient] = useState<HelpdeskAssetExpedient | null>(null);
  const [catalogs, setCatalogs] = useState<HelpdeskCatalogs | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingEvent, setSavingEvent] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedPdfUrl, setSelectedPdfUrl] = useState<string | null>(null);
  const [showLabel, setShowLabel] = useState(false);
  const [showEventForm, setShowEventForm] = useState(false);

  const loadData = useCallback(async () => {
    if (!assetId) {
      return;
    }
    setLoading(true);
    try {
      const [exp, cat] = await Promise.all([fetchAssetExpedient(assetId), listHelpdeskCatalogs()]);
      setExpedient(exp);
      setCatalogs(cat);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo cargar el expediente del equipo.'));
    } finally {
      setLoading(false);
    }
  }, [assetId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleCreateEvent = async (payload: HelpdeskLifecycleEventPayload) => {
    setSavingEvent(true);
    try {
      await createLifecycleEvent(assetId, payload);
      notifySuccess('Evento registrado en el expediente.');
      setShowEventForm(false);
      await loadData();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo registrar el evento.'));
    } finally {
      setSavingEvent(false);
    }
  };

  const handleUpload = async (
    file: File,
    fields: { title: string; document_kind_id?: number | null; lifecycle_event_id?: number | null },
  ) => {
    setUploading(true);
    try {
      await uploadAssetDocument(assetId, file, fields);
      notifySuccess('Evidencia cargada correctamente.');
      await loadData();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo cargar la evidencia.'));
    } finally {
      setUploading(false);
    }
  };

  const handleView = async (documentId: number) => {
    try {
      const url = await getAssetDocumentBlobUrl(documentId);
      setSelectedPdfUrl(url);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo abrir la evidencia.'));
    }
  };

  const asset = expedient?.asset ?? null;
  const events = useMemo(() => expedient?.events ?? [], [expedient]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-[var(--color-brand-700)]">
        <Loader2 className="animate-spin" /> <span className="ml-2">Cargando expediente...</span>
      </div>
    );
  }

  if (!asset || !catalogs) {
    return (
      <div className="p-6">
        <button onClick={() => navigate('/helpdesk/assets')} className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-brand-700)]">
          <ArrowLeft size={16} /> Volver a activos
        </button>
        <p className="text-sm text-[var(--unilabor-neutral)]">No se encontro el equipo.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 p-1">
      <button onClick={() => navigate('/helpdesk/assets')} className="inline-flex items-center gap-1 text-sm text-[var(--color-brand-700)]">
        <ArrowLeft size={16} /> Volver a activos
      </button>

      {/* Identidad ISO */}
      <div className="rounded-3xl border border-[rgba(0,65,106,0.1)] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Expediente del equipo</p>
            <h1 className="text-2xl font-bold text-[var(--color-brand-700)]">{asset.asset_code}</h1>
            <p className="text-sm text-[var(--unilabor-ink)]">{asset.name}</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowLabel(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.3)]"
            >
              <Printer size={16} /> Imprimir etiqueta
            </button>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${asset.is_active ? 'bg-[rgba(34,139,84,0.12)] text-[#1c7a4a]' : 'bg-[rgba(190,40,40,0.12)] text-[#b02a2a]'}`}>
              {asset.is_active ? 'Activo' : 'Dado de baja'}
            </span>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
          <IdentityRow label="Marca" value={asset.brand?.name} />
          <IdentityRow label="Modelo" value={asset.model} />
          <IdentityRow label="No. de serie" value={asset.serial_number} />
          <IdentityRow label="Proveedor" value={asset.supplier?.name} />
          <IdentityRow label="Unidad" value={asset.unit?.name} />
          <IdentityRow label="Area" value={asset.area?.name} />
          <IdentityRow label="Ubicacion" value={asset.location?.name} />
          <IdentityRow label="Estado operativo" value={asset.operational_status?.name} />
          <IdentityRow label="Fecha de recepcion" value={asset.received_on} />
          <IdentityRow label="Puesta en servicio" value={asset.placed_in_service_on} />
          <IdentityRow label="Condicion al recibir" value={asset.receipt_condition?.name} />
          <IdentityRow label="Responsable" value={asset.responsible_employee?.full_name} />
          {asset.decommissioned_on ? <IdentityRow label="Fecha de baja" value={asset.decommissioned_on} /> : null}
          {asset.disposal_reason ? <IdentityRow label="Motivo de baja" value={asset.disposal_reason.name} /> : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Linea de tiempo */}
        <div className="rounded-3xl border border-[rgba(0,65,106,0.1)] bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-[var(--color-brand-700)]">Linea de tiempo</h2>
            <button
              type="button"
              onClick={() => setShowEventForm(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-brand-700)] px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90"
            >
              <Plus size={16} /> Registrar evento
            </button>
          </div>
          {events.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[rgba(0,65,106,0.14)] p-4 text-sm text-[var(--unilabor-neutral)]">
              Aun no hay eventos registrados.
            </p>
          ) : (
            <ol className="relative space-y-4 border-l-2 border-[rgba(0,65,106,0.12)] pl-5">
              {events.map((ev: HelpdeskLifecycleEvent) => {
                const Icon = EVENT_ICONS[ev.event_type?.code ?? ''] ?? PackagePlus;
                return (
                  <li key={ev.id} className="relative">
                    <span className="absolute -left-[27px] flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-brand-700)] text-white">
                      <Icon size={12} />
                    </span>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate(`/helpdesk/assets/${assetId}/events/${ev.id}`)}
                      onKeyDown={(keyEvent) => {
                        if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
                          keyEvent.preventDefault();
                          navigate(`/helpdesk/assets/${assetId}/events/${ev.id}`);
                        }
                      }}
                      className="-mx-2 cursor-pointer rounded-xl px-2 py-1.5 transition hover:bg-[rgba(191,212,230,0.24)]"
                      title="Ver detalle del evento"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-bold text-[var(--unilabor-ink)]">{ev.title}</p>
                        <span className="text-xs text-[var(--unilabor-neutral)]">{dash(ev.event_date)}</span>
                      </div>
                      <p className="text-xs font-semibold text-[var(--color-brand-700)]">
                        {ev.event_type?.name ?? ''} · {ev.event_code}
                      </p>
                      {ev.description ? <p className="mt-1 text-sm text-[var(--unilabor-neutral)]">{ev.description}</p> : null}
                      {ev.disposal_reason ? <p className="mt-1 text-xs text-[#b02a2a]">Motivo: {ev.disposal_reason.name}</p> : null}
                      <div className="mt-1 flex items-center gap-3">
                        {ev.generated_act_document_id ? (
                          <button
                            type="button"
                            onClick={(clickEvent) => {
                              clickEvent.stopPropagation();
                              handleView(ev.generated_act_document_id as number);
                            }}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-brand-700)] hover:underline"
                          >
                            <Eye size={12} /> Ver acta/reporte
                          </button>
                        ) : null}
                        {ev.ticket_id ? (
                          <button
                            type="button"
                            onClick={(clickEvent) => {
                              clickEvent.stopPropagation();
                              navigate(`/helpdesk/tickets/${ev.ticket_id}`);
                            }}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-brand-700)] hover:underline"
                          >
                            <LifeBuoy size={12} /> Ver solicitud de soporte
                          </button>
                        ) : null}
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-brand-500)]">
                          Ver detalle <ChevronRight size={12} />
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

        </div>

        {/* Evidencias */}
        <div className="rounded-3xl border border-[rgba(0,65,106,0.1)] bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-lg font-bold text-[var(--color-brand-700)]">Evidencias documentales</h2>
          <AssetEvidencePanel
            documents={expedient?.documents ?? []}
            catalogs={catalogs}
            events={events}
            uploading={uploading}
            onUpload={handleUpload}
            onView={handleView}
          />
        </div>
      </div>

      {selectedPdfUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(11,34,53,0.28)] p-4 backdrop-blur-sm">
          <div className="w-full max-w-5xl overflow-hidden rounded-3xl border border-[rgba(0,65,106,0.08)] bg-white/95 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[rgba(0,65,106,0.08)] px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-bold text-[var(--color-brand-700)]">
                <Eye size={16} /> VISOR SEGURO — EVIDENCIA
              </div>
              <button
                type="button"
                onClick={() => setSelectedPdfUrl(null)}
                className="rounded-full px-3 py-1.5 text-sm text-[var(--unilabor-neutral)] transition hover:bg-[rgba(191,212,230,0.28)]"
              >
                Cerrar
              </button>
            </div>
            <PdfSafeViewer key={selectedPdfUrl} fileUrl={selectedPdfUrl} />
          </div>
        </div>
      )}

      {showLabel && (
        <AssetLabelModal
          assetCode={asset.asset_code}
          name={asset.name}
          brand={asset.brand?.name ?? asset.brand_name ?? null}
          model={asset.model ?? null}
          onClose={() => setShowLabel(false)}
        />
      )}

      {showEventForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[rgba(11,34,53,0.28)] p-4 backdrop-blur-sm">
          <div className="my-6 w-full max-w-xl overflow-hidden rounded-3xl border border-[rgba(0,65,106,0.08)] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[rgba(0,65,106,0.08)] px-5 py-3">
              <div className="text-sm font-bold text-[var(--color-brand-700)]">Registrar nuevo evento</div>
              <button
                type="button"
                onClick={() => setShowEventForm(false)}
                className="rounded-full p-1 text-[var(--unilabor-neutral)] transition hover:bg-[rgba(191,212,230,0.28)]"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-5">
              <LifecycleEventForm catalogs={catalogs} saving={savingEvent} onSubmit={handleCreateEvent} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
