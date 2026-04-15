import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Edit3, Eye, FilterX, History, Plus, Power, RotateCcw, Search } from 'lucide-react';
import { toast } from 'react-toastify';
import { EditDocumentModal } from '../components/admin/EditDocumentModal';
import { UploadDocumentModal } from '../components/admin/UploadDocumentModalStyled';
import { useDocumentStore } from '../store/useDocumentStore';
import { API_BASE_URL } from '../api/axios';
import { useAuthStore } from '../store/useAuthStore';
import { PdfSafeViewer } from '../components/PdfSafeViewerSafe';
import { hasAnyRole } from '../utils/roles';
import type { Category, Document, DocumentStatus } from '../types/models';
import type { ListDocumentsOptions } from '../api/service';
import { fetchDocumentCategories, getApiErrorMessage, updateDocumentStatusById } from '../api/service';
import { notifyError, notifySuccess } from '../utils/notify';

const getStatusLabel = (status: DocumentStatus): string => {
  switch (status) {
    case 'inactive':
      return 'Inactivo';
    case 'superseded':
      return 'Derogado';
    case 'active':
    default:
      return 'Vigente';
  }
};

const getStatusBadgeClassName = (status: DocumentStatus): string => {
  switch (status) {
    case 'inactive':
      return 'border-slate-500/30 bg-slate-500/10 text-slate-200';
    case 'superseded':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
    case 'active':
    default:
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
  }
};

interface DocumentFilterFormState {
  category_id: string;
  description: string;
  title: string;
  publish_date: string;
}

const createInitialFilterForm = (): DocumentFilterFormState => ({
  category_id: '',
  description: '',
  title: '',
  publish_date: '',
});

export const DocumentsPage = () => {
  const [selectedPdfUrl, setSelectedPdfUrl] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDocument, setEditingDocument] = useState<Document | null>(null);
  const [showAllStatuses, setShowAllStatuses] = useState(false);
  const [filterCategories, setFilterCategories] = useState<Category[]>([]);
  const [filterForm, setFilterForm] = useState<DocumentFilterFormState>(createInitialFilterForm);
  const [appliedFilters, setAppliedFilters] = useState<
    Pick<ListDocumentsOptions, 'category_id' | 'description' | 'title' | 'publish_date'>
  >({});
  const [statusUpdatingDocumentId, setStatusUpdatingDocumentId] = useState<string | number | null>(
    null,
  );
  const token = useAuthStore((state) => state.token);
  const userRole = useAuthStore((state) => state.user?.role);
  const { documents, fetchDocuments, loading, error } = useDocumentStore();
  const canManageDocuments = hasAnyRole(userRole, ['ADMIN', 'EDITOR']);
  const isViewer = hasAnyRole(userRole, ['VIEWER']);

  const loadDocuments = useCallback(async () => {
    await fetchDocuments({
      ...(canManageDocuments && showAllStatuses ? { includeInactive: true } : {}),
      ...appliedFilters,
    });
  }, [appliedFilters, canManageDocuments, fetchDocuments, showAllStatuses]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  useEffect(() => {
    let isMounted = true;

    fetchDocumentCategories(token ?? undefined)
      .then((categories) => {
        if (!isMounted) {
          return;
        }

        setFilterCategories(categories);
      })
      .catch((requestError) => {
        if (!isMounted) {
          return;
        }

        setFilterCategories([]);
        notifyError(getApiErrorMessage(requestError, 'No se pudieron cargar las categorias de filtro'));
      });

    return () => {
      isMounted = false;
    };
  }, [token]);

  const sortedDocuments = useMemo(
    () =>
      [...documents].sort(
        (a, b) =>
          new Date(b.updated_at ?? b.created_at).getTime() -
          new Date(a.updated_at ?? a.created_at).getTime(),
      ),
    [documents],
  );

  const documentSummary = useMemo(
    () => ({
      active: documents.filter((doc) => doc.status === 'active').length,
      inactive: documents.filter((doc) => doc.status === 'inactive').length,
      superseded: documents.filter((doc) => doc.status === 'superseded').length,
    }),
    [documents],
  );

  const appliedFiltersCount = useMemo(
    () =>
      [appliedFilters.category_id, appliedFilters.description, appliedFilters.title, appliedFilters.publish_date]
        .filter((value) => value !== undefined && value !== null && String(value).trim().length > 0)
        .length,
    [appliedFilters],
  );

  const hasAppliedFilters = appliedFiltersCount > 0;

  const handleView = (filename: string) => {
    const safeFileName = filename.split(/[\\/]/).pop();
    if (!safeFileName) {
      return;
    }

    setSelectedPdfUrl(`${API_BASE_URL}/documents/view/${encodeURIComponent(safeFileName)}`);
  };

  const formatDisplayDate = (value?: string): string => {
    if (!value) {
      return 'Sin fecha';
    }

    const parsedDate = new Date(value);
    if (Number.isNaN(parsedDate.getTime())) {
      return value;
    }

    return parsedDate.toLocaleDateString();
  };

  const isExpired = (document: Document): boolean =>
    Boolean(document.expiry_date && new Date(document.expiry_date).getTime() < Date.now());

  const applyFilters = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedCategoryId = Number(filterForm.category_id);
    const nextFilters: Pick<
      ListDocumentsOptions,
      'category_id' | 'description' | 'title' | 'publish_date'
    > = {};

    if (Number.isFinite(normalizedCategoryId) && normalizedCategoryId > 0) {
      nextFilters.category_id = normalizedCategoryId;
    }

    const normalizedDescription = filterForm.description.trim();
    if (normalizedDescription) {
      nextFilters.description = normalizedDescription;
    }

    const normalizedTitle = filterForm.title.trim();
    if (normalizedTitle) {
      nextFilters.title = normalizedTitle;
    }

    const normalizedPublishDate = filterForm.publish_date.trim();
    if (normalizedPublishDate) {
      nextFilters.publish_date = normalizedPublishDate;
    }

    setAppliedFilters(nextFilters);
  };

  const clearFilters = () => {
    setFilterForm(createInitialFilterForm());
    setAppliedFilters({});
  };

  const confirmDocumentAction = ({
    title,
    description,
    confirmLabel,
    tone = 'cyan',
  }: {
    title: string;
    description: string;
    confirmLabel: string;
    tone?: 'cyan' | 'rose';
  }): Promise<boolean> =>
    new Promise((resolve) => {
      let settled = false;

      const settle = (value: boolean) => {
        if (settled) {
          return;
        }
        settled = true;
        resolve(value);
      };

      const confirmClassName =
        tone === 'rose'
          ? 'rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/20'
          : 'rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-500/20';

      toast.warning(
        ({ closeToast }) => (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-slate-100">{title}</p>
            <p className="text-xs leading-5 text-slate-300">{description}</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-800"
                onClick={() => {
                  settle(false);
                  closeToast();
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={confirmClassName}
                onClick={() => {
                  settle(true);
                  closeToast();
                }}
              >
                {confirmLabel}
              </button>
            </div>
          </div>
        ),
        {
          autoClose: false,
          closeOnClick: false,
          closeButton: false,
          draggable: false,
          onClose: () => settle(false),
        },
      );
    });

  const handleDocumentUpdated = async ({ replacedFile }: { replacedFile: boolean }) => {
    if (replacedFile) {
      setSelectedPdfUrl(null);
    }

    setEditingDocument(null);
    await loadDocuments();
    notifySuccess(
      replacedFile
        ? 'Documento vigente publicado correctamente. La version anterior quedo derogada.'
        : 'Metadata del documento actualizada correctamente.',
    );
  };

  const toggleDocumentStatus = async (document: Document) => {
    if (!canManageDocuments || document.status === 'superseded') {
      return;
    }

    const nextStatus: Exclude<DocumentStatus, 'superseded'> =
      document.status === 'inactive' ? 'active' : 'inactive';

    const shouldContinue = await confirmDocumentAction({
      title:
        nextStatus === 'inactive'
          ? `Inactivar "${document.title}"`
          : `Reactivar "${document.title}"`,
      description:
        nextStatus === 'inactive'
          ? 'El documento dejara de estar vigente para los usuarios finales, pero se conservara en el historial.'
          : 'El documento volvera a mostrarse como vigente si las reglas del backend lo permiten.',
      confirmLabel: nextStatus === 'inactive' ? 'Inactivar' : 'Reactivar',
    });

    if (!shouldContinue) {
      return;
    }

    setStatusUpdatingDocumentId(document.id);

    try {
      await updateDocumentStatusById(document.id, nextStatus);
      await loadDocuments();
      notifySuccess(
        nextStatus === 'inactive'
          ? 'Documento inactivado correctamente.'
          : 'Documento reactivado correctamente.',
      );
    } catch (requestError) {
      notifyError(getApiErrorMessage(requestError, 'No se pudo actualizar el estado del documento'));
    } finally {
      setStatusUpdatingDocumentId(null);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">
            {isViewer ? 'Consulta documental SGC ISO 15189' : 'Gestor de documentos'}
          </h1>
          <p className="text-sm text-slate-400">
            {isViewer
              ? 'Acceso de solo lectura a documentos vigentes autorizados del sistema de gestion de calidad.'
              : 'Administra documentos vigentes, historial derogado y estados operativos.'}
          </p>
          {canManageDocuments && (
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-wide">
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-emerald-200">
                Vigentes: {documentSummary.active}
              </span>
              <span className="rounded-full border border-slate-500/30 bg-slate-500/10 px-3 py-1 text-slate-200">
                Inactivos: {documentSummary.inactive}
              </span>
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-amber-200">
                Derogados: {documentSummary.superseded}
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {canManageDocuments && (
            <button
              type="button"
              onClick={() => setShowAllStatuses((current) => !current)}
              className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-semibold transition ${
                showAllStatuses
                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20'
                  : 'border-slate-700 bg-slate-900/80 text-slate-200 hover:bg-slate-800'
              }`}
            >
              <History size={18} />
              {showAllStatuses ? 'Solo vigentes' : 'Ver historial completo'}
            </button>
          )}

          {canManageDocuments ? (
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="unilabor-button-primary inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm shadow-lg shadow-cyan-900/30"
            >
              <Plus size={18} />
              PUBLICAR DOCUMENTO
            </button>
          ) : (
            <span className="inline-flex items-center rounded-2xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
              Modo lectura SGC ISO 15189
            </span>
          )}
        </div>
      </div>

      <form
        onSubmit={applyFilters}
        className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5 shadow-xl shadow-slate-950/30"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-slate-300">
              Filtros de busqueda
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Filtra por categoria, nombre o descripcion, titulo y fecha de publicacion.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {hasAppliedFilters && (
              <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-cyan-100">
                {appliedFiltersCount} filtro{appliedFiltersCount === 1 ? '' : 's'} activo
                {appliedFiltersCount === 1 ? '' : 's'}
              </span>
            )}
            {canManageDocuments && showAllStatuses && (
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-100">
                Incluyendo historial
              </span>
            )}
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
              Categoria
            </label>
            <select
              value={filterForm.category_id}
              onChange={(event) =>
                setFilterForm((current) => ({
                  ...current,
                  category_id: event.target.value,
                }))
              }
              className="w-full appearance-none rounded-2xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-slate-100 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20"
            >
              <option value="">Todas las categorias</option>
              {filterCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
              Nombre / descripcion
            </label>
            <input
              type="text"
              value={filterForm.description}
              onChange={(event) =>
                setFilterForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              placeholder="Ej: procedimiento vigente"
              className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
              Titulo
            </label>
            <input
              type="text"
              value={filterForm.title}
              onChange={(event) =>
                setFilterForm((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
              placeholder="Ej: bloqueo y etiquetado"
              className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
              Fecha de publicacion
            </label>
            <input
              type="date"
              value={filterForm.publish_date}
              onChange={(event) =>
                setFilterForm((current) => ({
                  ...current,
                  publish_date: event.target.value,
                }))
              }
              className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-slate-100 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20"
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-slate-800"
          >
            <FilterX size={16} />
            Limpiar filtros
          </button>
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-2xl border border-cyan-500/40 bg-cyan-500/10 px-4 py-2.5 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/20"
          >
            <Search size={16} />
            Buscar documentos
          </button>
        </div>
      </form>

      {selectedPdfUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-5xl overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 shadow-2xl shadow-black/50">
            <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/80 px-4 py-3">
              <span className="text-sm font-bold text-cyan-100">VISOR SEGURO SAFEDOC</span>
              <button
                type="button"
                onClick={() => setSelectedPdfUrl(null)}
                className="rounded-full px-3 py-1.5 text-sm text-slate-300 transition hover:bg-slate-800 hover:text-white"
              >
                Cerrar
              </button>
            </div>
            <PdfSafeViewer key={selectedPdfUrl} fileUrl={selectedPdfUrl} />
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-cyan-400"></div>
        </div>
      ) : sortedDocuments.length === 0 ? (
        <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-10 text-center shadow-xl shadow-slate-950/30">
          <p className="text-base font-semibold text-slate-100">
            {hasAppliedFilters
              ? 'No hay documentos que coincidan con los filtros aplicados.'
              : showAllStatuses
                ? 'No hay documentos en el historial.'
                : 'No hay documentos vigentes para mostrar.'}
          </p>
          <p className="mt-2 text-sm text-slate-400">
            {hasAppliedFilters
              ? 'Prueba ajustando la categoria, el texto de busqueda o la fecha de publicacion.'
              : canManageDocuments
                ? 'Publica un nuevo documento o cambia el filtro para revisar documentos inactivos y derogados.'
                : 'Consulta mas tarde o verifica que tengas categorias asignadas.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {sortedDocuments.map((doc) => {
            const statusLabel = getStatusLabel(doc.status);
            const allowStatusToggle = canManageDocuments && doc.status !== 'superseded';
            const allowEdit = canManageDocuments && doc.status !== 'superseded';

            return (
              <div
                key={doc.id}
                className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-xl shadow-slate-950/40 transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-500/40"
              >
                <div className="mb-4 flex flex-wrap items-start gap-2">
                  <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-cyan-200">
                    {doc.category_name || 'Sin area'}
                  </span>
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${getStatusBadgeClassName(doc.status)}`}
                  >
                    {statusLabel}
                  </span>
                  {isExpired(doc) && (
                    <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-rose-200">
                      Vencido
                    </span>
                  )}
                </div>

                <h3 className="truncate text-base font-bold text-slate-100">{doc.title}</h3>
                <p className="mt-2 line-clamp-2 text-sm text-slate-400">
                  {doc.description || 'Sin descripcion'}
                </p>

                {(doc.replaced_by_document_id || doc.replaces_document_id) && (
                  <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-300">
                    {doc.status === 'superseded' && doc.replaced_by_document_id
                      ? `Derogado por la version ${doc.replaced_by_document_id}.`
                      : doc.replaces_document_id
                        ? `Esta version sustituye al documento ${doc.replaces_document_id}.`
                        : ''}
                  </div>
                )}

                <div className="mt-4 grid gap-2 rounded-2xl border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-400">
                  <p className="inline-flex items-center gap-2">
                    <CalendarDays size={14} className="text-cyan-300" />
                    Publicado:{' '}
                    <span className="font-semibold text-slate-200">
                      {formatDisplayDate(doc.publish_date ?? doc.created_at)}
                    </span>
                  </p>
                  <p className="inline-flex items-center gap-2">
                    <CalendarDays size={14} className="text-amber-300" />
                    Expira:{' '}
                    <span className="font-semibold text-slate-200">
                      {doc.expiry_date ? formatDisplayDate(doc.expiry_date) : 'Sin vencimiento'}
                    </span>
                  </p>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-slate-800 pt-3">
                  <span className="text-[11px] text-slate-500">
                    Actualizado: {formatDisplayDate(doc.updated_at ?? doc.created_at)}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleView(doc.filename)}
                      className="rounded-lg p-2 text-cyan-300 transition hover:bg-cyan-500/10 hover:text-cyan-100"
                      title={isViewer ? 'Visualizar documento protegido' : 'Ver documento'}
                    >
                      <Eye size={18} />
                    </button>
                    {allowEdit && (
                      <button
                        type="button"
                        onClick={() => setEditingDocument(doc)}
                        className="rounded-lg p-2 text-amber-300 transition hover:bg-amber-500/10 hover:text-amber-200"
                        title="Editar metadata o reemplazar documento vigente"
                      >
                        <Edit3 size={18} />
                      </button>
                    )}
                    {allowStatusToggle && (
                      <button
                        type="button"
                        onClick={() => void toggleDocumentStatus(doc)}
                        disabled={statusUpdatingDocumentId === doc.id}
                        className={`rounded-lg p-2 transition disabled:cursor-not-allowed disabled:opacity-60 ${
                          doc.status === 'inactive'
                            ? 'text-emerald-300 hover:bg-emerald-500/10 hover:text-emerald-200'
                            : 'text-rose-300 hover:bg-rose-500/10 hover:text-rose-200'
                        }`}
                        title={doc.status === 'inactive' ? 'Reactivar documento' : 'Inactivar documento'}
                      >
                        {doc.status === 'inactive' ? <RotateCcw size={18} /> : <Power size={18} />}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {canManageDocuments && (
        <UploadDocumentModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onUploadSuccess={() => {
            void loadDocuments();
          }}
          token={token ?? undefined}
        />
      )}

      {canManageDocuments && (
        <EditDocumentModal
          document={editingDocument}
          isOpen={editingDocument !== null}
          onClose={() => setEditingDocument(null)}
          onUpdateSuccess={handleDocumentUpdated}
          token={token ?? undefined}
        />
      )}
    </div>
  );
};
