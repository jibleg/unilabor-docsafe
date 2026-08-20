import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Clock3,
  Eye,
  FileWarning,
  Plus,
  PowerOff,
  RefreshCw,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { getApiErrorMessage } from '../api/service';
import {
  deactivateProviderDocument,
  deleteProviderDocument,
  getProviderDocument,
  getProviderDocumentBlobUrl,
  listProviderDocumentCategories,
  listProviderDocuments,
  replaceProviderDocument,
  uploadProviderDocument,
} from '../api/service.api-providers';
import type { ProviderDocument, ProviderDocumentCategory, ProviderSummary } from '../types/models';
import { notifyError, notifySuccess } from '../utils/notify';
import { confirmAction } from '../utils/confirm';
import { useHasPermission } from '../utils/permissions';
import { PdfSafeViewer } from '../components/PdfSafeViewerSafe';
import {
  ProviderDocumentUploadModal,
  type ProviderDocumentUploadSubmitPayload,
} from '../components/providers/ProviderDocumentUploadModal';
import { ProviderDocumentHistoryModal } from '../components/providers/ProviderDocumentHistoryModal';

const REMINDER_WINDOW_DAYS = 30;

const STATUS_LABEL: Record<string, string> = {
  active: 'Vigente',
  superseded: 'Derogado',
  inactive: 'Inactivo',
};

const STATUS_CLASS: Record<string, string> = {
  active: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  superseded: 'border-[rgba(151,163,172,0.28)] bg-[rgba(151,163,172,0.12)] text-[var(--color-brand-700)]',
  inactive: 'border-rose-200 bg-rose-50 text-rose-700',
};

const formatDisplayDate = (value?: string | null): string => {
  if (!value) {
    return 'Sin fecha';
  }
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleDateString('es-MX');
};

const daysUntil = (value: string | null): number | null => {
  if (!value) {
    return null;
  }
  const target = new Date(`${value.slice(0, 10)}T00:00:00`).getTime();
  if (Number.isNaN(target)) {
    return null;
  }
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.round((target - todayStart) / 86_400_000);
};

export const ProviderDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const providerId = Number(id);
  const canWrite = useHasPermission('PROVIDERS.DOCUMENTS.WRITE');

  const [provider, setProvider] = useState<ProviderSummary | null>(null);
  const [documents, setDocuments] = useState<ProviderDocument[]>([]);
  const [categories, setCategories] = useState<ProviderDocumentCategory[]>([]);
  const [loading, setLoading] = useState(false);

  const [categoryFilter, setCategoryFilter] = useState<number | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'superseded' | 'inactive'>('all');

  const [uploadState, setUploadState] = useState<{
    open: boolean;
    currentDocument: ProviderDocument | null;
  }>({ open: false, currentDocument: null });
  const [saving, setSaving] = useState(false);

  const [historyState, setHistoryState] = useState<{
    open: boolean;
    category: ProviderDocumentCategory | null;
    documents: ProviderDocument[];
    loading: boolean;
  }>({ open: false, category: null, documents: [], loading: false });

  const [selectedPdfUrl, setSelectedPdfUrl] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!providerId) {
      return;
    }
    setLoading(true);
    try {
      const [documentsResponse, categoriesResponse] = await Promise.all([
        listProviderDocuments(providerId, { all: true }),
        listProviderDocumentCategories(),
      ]);
      setProvider(documentsResponse.provider);
      setDocuments(documentsResponse.documents);
      setCategories(categoriesResponse);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo cargar la ficha del proveedor.'));
    } finally {
      setLoading(false);
    }
  }, [providerId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredDocuments = useMemo(() => {
    return documents
      .filter((document) => categoryFilter === 'all' || document.category_id === categoryFilter)
      .filter((document) => statusFilter === 'all' || document.status === statusFilter)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [documents, categoryFilter, statusFilter]);

  const openUpload = (currentDocument: ProviderDocument | null) => {
    setUploadState({ open: true, currentDocument });
  };

  const closeUpload = () => {
    if (saving) {
      return;
    }
    setUploadState({ open: false, currentDocument: null });
  };

  const handleUploadSubmit = async (payload: ProviderDocumentUploadSubmitPayload) => {
    const { currentDocument } = uploadState;
    if (!payload.file && !currentDocument) {
      notifyError('Debes seleccionar un archivo PDF.');
      return;
    }

    setSaving(true);
    try {
      if (currentDocument) {
        if (!payload.file) {
          notifyError('Debes seleccionar el nuevo archivo PDF para reemplazar el documento.');
          return;
        }
        await replaceProviderDocument(currentDocument.id, {
          category_id: payload.category_id,
          title: payload.title,
          description: payload.description,
          document_date: payload.document_date || null,
          effective_from: payload.effective_from || null,
          expiry_date: payload.expiry_date || null,
          file: payload.file,
        });
        notifySuccess('Documento reemplazado. La versión anterior quedó derogada.');
      } else {
        await uploadProviderDocument(providerId, {
          category_id: payload.category_id,
          title: payload.title,
          description: payload.description,
          document_date: payload.document_date || null,
          effective_from: payload.effective_from || null,
          expiry_date: payload.expiry_date || null,
          file: payload.file as File,
        });
        notifySuccess('Documento cargado correctamente.');
      }
      setUploadState({ open: false, currentDocument: null });
      await loadData();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo guardar el documento.'));
    } finally {
      setSaving(false);
    }
  };

  const openHistory = async (document: ProviderDocument) => {
    const category = categories.find((item) => item.id === document.category_id) ?? null;
    setHistoryState({ open: true, category, documents: [], loading: true });
    try {
      const { history } = await getProviderDocument(document.id);
      setHistoryState({ open: true, category, documents: history, loading: false });
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo cargar la trazabilidad del documento.'));
      setHistoryState({ open: false, category: null, documents: [], loading: false });
    }
  };

  const closeHistory = () => {
    setHistoryState({ open: false, category: null, documents: [], loading: false });
  };

  const handleView = async (document: ProviderDocument) => {
    try {
      const url = await getProviderDocumentBlobUrl(document.id);
      setSelectedPdfUrl(url);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo abrir el documento.'));
    }
  };

  const handleDeactivate = async (document: ProviderDocument) => {
    const confirmed = await confirmAction(
      `Desactivar: ${document.title}`,
      'El documento dejará de figurar como vigente. Podrás seguir consultándolo en el histórico.',
      'Desactivar',
      'primary',
    );
    if (!confirmed) {
      return;
    }

    try {
      await deactivateProviderDocument(document.id);
      notifySuccess('Documento desactivado correctamente.');
      await loadData();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo desactivar el documento.'));
    }
  };

  const handleDelete = async (document: ProviderDocument) => {
    const confirmed = await confirmAction(
      `Eliminar: ${document.title}`,
      'Esta acción borra el documento y su archivo de forma definitiva. No se puede deshacer.',
      'Eliminar',
      'danger',
    );
    if (!confirmed) {
      return;
    }

    try {
      await deleteProviderDocument(document.id);
      notifySuccess('Documento eliminado definitivamente.');
      await loadData();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo eliminar el documento.'));
    }
  };

  if (!providerId) {
    return <div className="text-sm text-[var(--unilabor-neutral)]">Proveedor inválido.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <Link
            to="/providers"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-brand-700)] hover:underline"
          >
            <ArrowLeft size={14} />
            Volver a proveedores
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-[var(--color-brand-700)]">
            {provider?.name ?? 'Proveedor'}
          </h1>
          <p className="text-sm text-[var(--unilabor-neutral)]">
            {provider?.rfc ? `RFC: ${provider.rfc}` : 'Sin RFC registrado'}
            {provider?.contact ? ` · Contacto: ${provider.contact}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void loadData()}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-[rgba(0,65,106,0.12)] bg-white/90 px-4 py-2.5 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Recargar
          </button>
          {canWrite ? (
            <button
              type="button"
              onClick={() => openUpload(null)}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-4 py-2.5 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)]"
            >
              <Plus size={16} />
              Agregar documento
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/88 px-5 py-3 shadow-sm shadow-[rgba(0,65,106,0.06)]">
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
            Categoría
          </label>
          <select
            value={categoryFilter}
            onChange={(event) =>
              setCategoryFilter(event.target.value === 'all' ? 'all' : Number(event.target.value))
            }
            className="rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-1.5 text-sm text-[var(--unilabor-ink)] outline-none"
          >
            <option value="all">Todas</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
            Estado
          </label>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
            className="rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-1.5 text-sm text-[var(--unilabor-ink)] outline-none"
          >
            <option value="all">Todos</option>
            <option value="active">Vigente</option>
            <option value="superseded">Derogado</option>
            <option value="inactive">Inactivo</option>
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/88 shadow-xl shadow-[rgba(0,65,106,0.08)] backdrop-blur-xl">
        {loading ? (
          <div className="p-10 text-center text-sm text-[var(--unilabor-neutral)]">Cargando documentos...</div>
        ) : filteredDocuments.length === 0 ? (
          <div className="p-10 text-center text-sm text-[var(--unilabor-neutral)]">
            {documents.length === 0
              ? 'No hay documentos cargados para este proveedor.'
              : 'No hay documentos que coincidan con los filtros seleccionados.'}
          </div>
        ) : (
          <div className="divide-y divide-[rgba(0,65,106,0.08)]">
            {filteredDocuments.map((document) => {
              const remaining = document.status === 'active' ? daysUntil(document.expiry_date) : null;
              const isExpired = remaining !== null && remaining < 0;
              const isExpiringSoon = remaining !== null && remaining >= 0 && remaining <= REMINDER_WINDOW_DAYS;

              return (
                <div
                  key={document.id}
                  className="flex flex-col gap-3 px-6 py-4 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${STATUS_CLASS[document.status] ?? STATUS_CLASS.inactive}`}
                      >
                        {STATUS_LABEL[document.status] ?? document.status}
                      </span>
                      <span className="rounded-full border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.28)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--color-brand-700)]">
                        {document.category_name ?? 'Sin categoría'}
                      </span>
                      {isExpired ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-rose-700">
                          <FileWarning size={12} /> Vencido
                        </span>
                      ) : isExpiringSoon ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                          <Clock3 size={12} /> Por vencer
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 truncate text-sm font-bold text-[var(--color-brand-700)]">{document.title}</p>
                    {document.description ? (
                      <p className="mt-1 truncate text-sm text-[var(--unilabor-ink)]">{document.description}</p>
                    ) : null}
                    <p className="mt-1 text-xs text-[var(--unilabor-neutral)]">
                      Documento: {formatDisplayDate(document.document_date)} · Vigencia desde{' '}
                      {formatDisplayDate(document.effective_from)} · Vence {formatDisplayDate(document.expiry_date)}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleView(document)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[rgba(0,65,106,0.12)] bg-white/90 px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
                    >
                      <Eye size={14} />
                      Ver
                    </button>
                    <button
                      type="button"
                      onClick={() => void openHistory(document)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[rgba(0,65,106,0.12)] bg-white/90 px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
                    >
                      <Clock3 size={14} />
                      Histórico
                    </button>
                    {canWrite && document.status === 'active' ? (
                      <>
                        <button
                          type="button"
                          onClick={() => openUpload(document)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.36)] px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)]"
                        >
                          <UploadCloud size={14} />
                          Reemplazar
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeactivate(document)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100"
                        >
                          <PowerOff size={14} />
                          Desactivar
                        </button>
                      </>
                    ) : null}
                    {canWrite ? (
                      <button
                        type="button"
                        onClick={() => void handleDelete(document)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                      >
                        <Trash2 size={14} />
                        Eliminar
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ProviderDocumentUploadModal
        isOpen={uploadState.open}
        provider={provider}
        categories={categories}
        currentDocument={uploadState.currentDocument}
        saving={saving}
        onClose={closeUpload}
        onSubmit={handleUploadSubmit}
      />

      <ProviderDocumentHistoryModal
        isOpen={historyState.open}
        category={historyState.category}
        documents={historyState.documents}
        loading={historyState.loading}
        onClose={closeHistory}
        onView={(document) => void handleView(document)}
      />

      {selectedPdfUrl && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[rgba(11,34,53,0.28)] p-4 backdrop-blur-sm">
          <div className="w-full max-w-4xl">
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedPdfUrl(null)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/40 bg-white/90 px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-white"
              >
                <X size={14} />
                Cerrar
              </button>
            </div>
            <PdfSafeViewer key={selectedPdfUrl} fileUrl={selectedPdfUrl} />
          </div>
        </div>
      )}
    </div>
  );
};
