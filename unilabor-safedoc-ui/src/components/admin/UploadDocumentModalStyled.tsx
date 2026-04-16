import { useEffect, useState } from 'react';
import {
  fetchDocumentCategories,
  getApiErrorMessage,
  uploadDocumentWithMetadata,
} from '../../api/service';
import {
  DocumentEditorModal,
  type DocumentEditorFormData,
} from './DocumentEditorModal';
import { useNativeFormValidation } from '../../hooks/useNativeFormValidation';
import type { Category } from '../../types/models';

interface UploadDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess: () => void;
  token?: string;
}

const createInitialFormData = (): DocumentEditorFormData => ({
  title: '',
  category_id: '',
  description: '',
  publish_date: new Date().toISOString().split('T')[0],
  expiry_date: '',
  file: null as File | null,
});

export const UploadDocumentModal = ({
  isOpen,
  onClose,
  onUploadSuccess,
  token,
}: UploadDocumentModalProps) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState(createInitialFormData);
  const { clearErrors, getFieldError, getFieldProps, handleChange, handleInvalid } =
    useNativeFormValidation();

  const titleError = getFieldError('title');
  const categoryError = getFieldError('category_id');
  const fileError = getFieldError('file');
  const [loadingCategories, setLoadingCategories] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setError(null);
    clearErrors();
    setFormData(createInitialFormData());
    setLoadingCategories(true);

    fetchDocumentCategories(token)
      .then(setCategories)
      .catch((requestError) => {
        setCategories([]);
        setError(getApiErrorMessage(requestError, 'No se pudieron cargar las categorias'));
      })
      .finally(() => {
        setLoadingCategories(false);
      });
  }, [clearErrors, isOpen, token]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!formData.file || !formData.category_id) {
      setError('Archivo y categoria son obligatorios');
      return;
    }

    setLoading(true);
    setError(null);

    const data = new FormData();
    data.append('file', formData.file);
    data.append('title', formData.title || formData.file.name);
    data.append('category_id', formData.category_id);

    const normalizedDescription = formData.description.trim();
    const normalizedPublishDate = formData.publish_date.trim();
    const normalizedExpiryDate = formData.expiry_date.trim();

    if (normalizedDescription) {
      data.append('description', normalizedDescription);
    }

    if (normalizedPublishDate) {
      data.append('publish_date', normalizedPublishDate);
    }

    if (normalizedExpiryDate) {
      data.append('expiry_date', normalizedExpiryDate);
    }

    try {
      await uploadDocumentWithMetadata(data, token);
      clearErrors();
      setFormData(createInitialFormData());
      onUploadSuccess();
      onClose();
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Error al subir el documento'));
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <DocumentEditorModal
      isOpen={isOpen}
      title="Publicar nuevo documento controlado"
      subtitle="Registra el documento, sus propiedades y el PDF correspondiente para dejarlo disponible en el sistema."
      error={error}
      categories={categories}
      loadingCategories={loadingCategories}
      submitting={loading}
      submitLabel="Publicar documento"
      submittingLabel="Publicando documento..."
      formData={formData}
      setFormData={setFormData}
      titleError={titleError}
      categoryError={categoryError}
      fileError={fileError}
      getFieldProps={getFieldProps}
      onChangeCapture={handleChange}
      onInvalidCapture={handleInvalid}
      onClose={onClose}
      onSubmit={handleSubmit}
      fileSectionTitle="Documento a publicar"
      fileSectionDescription="Adjunta el PDF oficial que se registrara con esta version del documento."
      emptyFileStateLabel="Pendiente de adjuntar PDF"
      fileInputPlaceholder="Haz clic para seleccionar el PDF"
      fileHint="Arrastre y suelte el documento PDF o haz clic para seleccionarlo. Obligatorio. Solo PDF."
      fileRequired
    />
  );
};
