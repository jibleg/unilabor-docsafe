import { useEffect, useMemo, useState } from 'react';
import {
  fetchDocumentCategories,
  getApiErrorMessage,
  updateDocumentById,
} from '../../api/service';
import {
  DocumentEditorModal,
  type DocumentEditorFormData,
} from './DocumentEditorModal';
import { useNativeFormValidation } from '../../hooks/useNativeFormValidation';
import type { Category, Document } from '../../types/models';

interface EditDocumentModalProps {
  document: Document | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateSuccess: (options: { replacedFile: boolean }) => Promise<void> | void;
  token?: string;
}

const normalizeDateInputValue = (value?: string): string => {
  if (!value) {
    return '';
  }

  const trimmedValue = value.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmedValue)) {
    return trimmedValue.slice(0, 10);
  }

  const parsedDate = new Date(trimmedValue);
  if (Number.isNaN(parsedDate.getTime())) {
    return '';
  }

  return parsedDate.toISOString().slice(0, 10);
};

const createInitialFormData = (document: Document | null): DocumentEditorFormData => ({
  title: document?.title ?? '',
  category_id: document?.category_id ? String(document.category_id) : '',
  description: document?.description ?? '',
  publish_date: normalizeDateInputValue(document?.publish_date ?? document?.created_at),
  expiry_date: normalizeDateInputValue(document?.expiry_date),
  file: null,
});

export const EditDocumentModal = ({
  document,
  isOpen,
  onClose,
  onUpdateSuccess,
  token,
}: EditDocumentModalProps) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<DocumentEditorFormData>(createInitialFormData(document));
  const { clearErrors, getFieldError, getFieldProps, handleChange, handleInvalid } =
    useNativeFormValidation();

  const titleError = getFieldError('title');
  const categoryError = getFieldError('category_id');
  const canReplaceDocument = document?.status === 'active';

  const matchedCategoryId = useMemo(() => {
    if (!document?.category_name) {
      return '';
    }

    const match = categories.find(
      (category) => category.name.trim().toLowerCase() === document.category_name?.trim().toLowerCase(),
    );

    return match ? String(match.id) : '';
  }, [categories, document?.category_name]);

  useEffect(() => {
    if (!isOpen || !document) {
      return;
    }

    setError(null);
    clearErrors();
    setFormData(createInitialFormData(document));
    setLoadingCategories(true);

    fetchDocumentCategories(token)
      .then((nextCategories) => {
        setCategories(nextCategories);
      })
      .catch((requestError) => {
        setCategories([]);
        setError(getApiErrorMessage(requestError, 'No se pudieron cargar las categorias'));
      })
      .finally(() => {
        setLoadingCategories(false);
      });
  }, [clearErrors, document, isOpen, token]);

  useEffect(() => {
    if (!matchedCategoryId) {
      return;
    }

    setFormData((currentForm) =>
      currentForm.category_id
        ? currentForm
        : {
            ...currentForm,
            category_id: matchedCategoryId,
          },
    );
  }, [matchedCategoryId]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!document) {
      return;
    }

    if (formData.file && !canReplaceDocument) {
      setError('Solo los documentos vigentes pueden reemplazarse por una nueva version.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await updateDocumentById(document.id, formData);
      await onUpdateSuccess({ replacedFile: Boolean(formData.file) });
      clearErrors();
      onClose();
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No se pudo actualizar el documento'));
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen || !document) {
    return null;
  }

  return (
    <DocumentEditorModal
      isOpen={isOpen}
      title={canReplaceDocument ? 'Editar documento vigente' : 'Editar documento'}
      subtitle={
        canReplaceDocument
          ? 'Actualiza propiedades del documento y, si corresponde, reemplaza el PDF vigente con una nueva version.'
          : 'Actualiza las propiedades del documento. El reemplazo del archivo solo esta disponible cuando el documento esta vigente.'
      }
      error={error}
      categories={categories}
      loadingCategories={loadingCategories}
      submitting={saving}
      submitLabel="Guardar cambios"
      submittingLabel="Guardando cambios..."
      formData={formData}
      setFormData={setFormData}
      titleError={titleError}
      categoryError={categoryError}
      getFieldProps={getFieldProps}
      onChangeCapture={handleChange}
      onInvalidCapture={handleInvalid}
      onClose={onClose}
      onSubmit={handleSubmit}
      fileSectionTitle="Documento vinculado"
      fileSectionDescription={
        canReplaceDocument
          ? 'Si adjuntas un nuevo PDF, el sistema publicara la nueva version y mantendra la anterior en historial.'
          : 'Este documento no esta vigente. Puedes editar sus propiedades, pero no reemplazar el archivo desde este flujo.'
      }
      existingFileName={document.filename}
      fileInputPlaceholder="Haz clic para seleccionar el nuevo PDF"
      fileHint={
        canReplaceDocument
          ? 'Arrastre y suelte el documento PDF o haz clic para seleccionarlo. Opcional. Solo PDF.'
          : 'Reactiva el documento desde la pagina principal si necesitas devolverlo a estado vigente antes de reemplazarlo.'
      }
      allowFileSelection={canReplaceDocument}
      allowRemoveSelectedFile={canReplaceDocument}
    />
  );
};
