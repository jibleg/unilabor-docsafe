import { useCallback, useEffect, useMemo, useState } from 'react';
import { FilePlus2, FileText, RefreshCw, Signature, Trash2, UploadCloud, Users } from 'lucide-react';
import { toast } from 'react-toastify';
import { listDocumentTypes } from '../api/service';
import {
  createInstitutionalDocument,
  deactivateInstitutionalDocument,
  listInstitutionalDocuments,
} from '../api/service.api-rh-acknowledgement';
import { getApiErrorMessage } from '../api/service.parsers';
import { confirmAction } from '../utils/confirm';
import { RequestAcknowledgementModal } from '../components/rh/RequestAcknowledgementModal';
import type { DocumentType, InstitutionalDocument } from '../types/models';

export const RhInstitutionalDocumentsPage = () => {
  const [documents, setDocuments] = useState<InstitutionalDocument[]>([]);
  const [types, setTypes] = useState<DocumentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [assignTarget, setAssignTarget] = useState<InstitutionalDocument | null>(null);

  // Formulario de carga
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [typeId, setTypeId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [docs, docTypes] = await Promise.all([
        listInstitutionalDocuments(),
        listDocumentTypes({ is_active: true }),
      ]);
      setDocuments(docs);
      setTypes(docTypes);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudieron cargar los documentos institucionales.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setTypeId('');
    setFile(null);
    setShowUpload(false);
  };

  const handleUpload = async () => {
    if (!title.trim() || !typeId || !file) {
      toast.warning('Completa el título, el tipo destino y el archivo PDF.');
      return;
    }
    setUploading(true);
    try {
      await createInstitutionalDocument({
        title: title.trim(),
        description: description.trim() || undefined,
        target_document_type_id: Number(typeId),
        file,
      });
      toast.success('Documento institucional cargado.');
      resetForm();
      void load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo cargar el documento.'));
    } finally {
      setUploading(false);
    }
  };

  const handleDeactivate = async (document: InstitutionalDocument) => {
    const confirmed = await confirmAction(
      'Inactivar documento',
      `¿Inactivar "${document.title}"? Los acuses pendientes se cancelarán. Los ya firmados se conservan como evidencia.`,
      'Inactivar',
    );
    if (!confirmed) {
      return;
    }
    try {
      await deactivateInstitutionalDocument(document.id);
      toast.success('Documento inactivado.');
      void load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo inactivar el documento.'));
    }
  };

  const typeName = useMemo(() => {
    const byId = new Map(types.map((type) => [type.id, type.name]));
    return (id: number) => byId.get(id) ?? `Tipo #${id}`;
  }, [types]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--color-brand-700)]">
            <FileText size={22} />
            Documentos institucionales
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--unilabor-neutral)]">
            Reglamentos, políticas y códigos que el personal debe leer y firmar. Se cargan
            una sola vez; cada colaborador que firma recibe su copia en su expediente.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[rgba(0,65,106,0.12)] bg-white/92 px-3 py-2 text-sm text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
          >
            <RefreshCw size={15} />
            Actualizar
          </button>
          <button
            type="button"
            onClick={() => setShowUpload((current) => !current)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-brand-700)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-brand-600)]"
          >
            <FilePlus2 size={15} />
            Cargar documento
          </button>
        </div>
      </header>

      {showUpload && (
        <div className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/95 p-5 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-semibold text-[var(--unilabor-neutral)]">
              Título
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Reglamento interno de trabajo"
                className="mt-1 w-full rounded-lg border border-[rgba(0,65,106,0.12)] px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs font-semibold text-[var(--unilabor-neutral)]">
              Tipo documental destino
              <select
                value={typeId}
                onChange={(event) => setTypeId(event.target.value)}
                className="mt-1 w-full rounded-lg border border-[rgba(0,65,106,0.12)] px-3 py-2 text-sm"
              >
                <option value="">Selecciona…</option>
                {types.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.section?.name ? `${type.section.name} · ${type.name}` : type.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-[var(--unilabor-neutral)] sm:col-span-2">
              Descripción (opcional)
              <input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="mt-1 w-full rounded-lg border border-[rgba(0,65,106,0.12)] px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs font-semibold text-[var(--unilabor-neutral)] sm:col-span-2">
              Archivo PDF
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-[var(--unilabor-neutral)] file:mr-3 file:rounded-lg file:border-0 file:bg-[rgba(191,212,230,0.4)] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-[var(--color-brand-700)]"
                />
              </div>
            </label>
          </div>
          <p className="mt-2 text-xs text-[var(--unilabor-neutral)]">
            El tipo destino es la carpeta del expediente donde aterrizará la copia firmada de
            cada lector.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={resetForm}
              disabled={uploading}
              className="rounded-lg border border-[rgba(0,65,106,0.12)] px-4 py-2 text-sm text-[var(--unilabor-neutral)] transition hover:bg-[rgba(191,212,230,0.28)] disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void handleUpload()}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-brand-700)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-brand-600)] disabled:opacity-50"
            >
              <UploadCloud size={15} />
              {uploading ? 'Cargando…' : 'Cargar'}
            </button>
          </div>
        </div>
      )}

      {loading && <p className="text-sm text-[var(--unilabor-neutral)]">Cargando…</p>}

      {!loading && documents.length === 0 && (
        <div className="rounded-2xl border border-dashed border-[rgba(0,65,106,0.14)] bg-white/88 px-5 py-10 text-center">
          <FileText className="mx-auto text-[var(--color-brand-500)]" size={28} />
          <p className="mt-2 text-sm text-[var(--unilabor-neutral)]">
            Aún no hay documentos institucionales. Carga el primero para solicitar acuses.
          </p>
        </div>
      )}

      <div className="grid gap-3">
        {documents.map((document) => (
          <article
            key={document.id}
            className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/92 px-5 py-4 shadow-sm"
          >
            <div className="min-w-0 flex-1">
              <h2 className="truncate font-semibold text-[var(--color-brand-700)]">
                {document.title}
              </h2>
              <p className="mt-1 text-xs text-[var(--unilabor-neutral)]">
                {document.pages_total} pág. · destino: {typeName(document.target_document_type_id)}
                {typeof document.signed_count === 'number' && (
                  <>
                    {' · '}
                    <span className="inline-flex items-center gap-1">
                      <Users size={11} />
                      {document.signed_count}/{document.acknowledgement_count ?? 0} firmados
                    </span>
                  </>
                )}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAssignTarget(document)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[rgba(0,65,106,0.12)] bg-white/90 px-3 py-2 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
              >
                <Signature size={14} />
                Solicitar acuse
              </button>
              <button
                type="button"
                onClick={() => void handleDeactivate(document)}
                title="Inactivar documento"
                className="rounded-lg p-2 text-[var(--unilabor-neutral)] transition hover:bg-rose-50 hover:text-rose-600"
              >
                <Trash2 size={15} />
              </button>
            </div>
          </article>
        ))}
      </div>

      {assignTarget && (
        <RequestAcknowledgementModal
          documentId={assignTarget.id}
          documentTitle={assignTarget.title}
          onClose={() => setAssignTarget(null)}
          onAssigned={load}
        />
      )}
    </div>
  );
};
