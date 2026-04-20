import { useCallback, useEffect, useState } from 'react';
import { Eye, Loader2, RefreshCw, ShieldCheck, UserSquare2 } from 'lucide-react';
import { API_BASE_URL } from '../api/axios';
import {
  fetchMyExpedient,
  getApiErrorMessage,
  uploadMyEmployeeDocument,
  type EmployeeDocumentPayload,
} from '../api/service';
import { PdfSafeViewer } from '../components/PdfSafeViewerSafe';
import { EmployeeDocumentUploadModal } from '../components/rh/EmployeeDocumentUploadModal';
import { ExpedientSectionCard } from '../components/rh/ExpedientSectionCard';
import type { EmployeeExpedient, EmployeeExpedientItem } from '../types/models';
import { notifyError, notifySuccess, notifyWarning } from '../utils/notify';

const summaryCards = (
  summary: EmployeeExpedient['summary'],
): Array<{ label: string; value: number; accent: string }> => [
  {
    label: 'Tipos configurados',
    value: summary.total_types,
    accent: 'bg-[rgba(191,212,230,0.32)] text-[var(--color-brand-700)]',
  },
  {
    label: 'Documentos cargados',
    value: summary.uploaded_types,
    accent: 'bg-emerald-50 text-emerald-700',
  },
  {
    label: 'Pendientes',
    value: summary.missing_types,
    accent: 'bg-[rgba(151,163,172,0.12)] text-[var(--color-brand-700)]',
  },
  {
    label: 'Por vencer / vencidos',
    value: summary.expiring_count + summary.expired_count,
    accent: 'bg-amber-50 text-amber-700',
  },
];

export const MyExpedientPage = () => {
  const [loading, setLoading] = useState(false);
  const [expedient, setExpedient] = useState<EmployeeExpedient | null>(null);
  const [selectedItem, setSelectedItem] = useState<EmployeeExpedientItem | null>(null);
  const [savingDocument, setSavingDocument] = useState(false);
  const [selectedPdfUrl, setSelectedPdfUrl] = useState<string | null>(null);
  const [profileMissing, setProfileMissing] = useState(false);

  const loadExpedient = useCallback(async () => {
    setLoading(true);
    setProfileMissing(false);
    try {
      const data = await fetchMyExpedient();
      setExpedient(data);
    } catch (error) {
      const message = getApiErrorMessage(error, 'No se pudo cargar tu expediente.');
      if (message.toLowerCase().includes('aun no esta vinculada')) {
        setProfileMissing(true);
        setExpedient(null);
      } else {
        notifyError(message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadExpedient();
  }, [loadExpedient]);

  const handleUpload = async (payload: {
    title: string;
    description: string;
    issue_date: string;
    expiry_date: string;
    file: File | null;
  }) => {
    if (!selectedItem) {
      return;
    }

    if (!payload.title.trim()) {
      notifyWarning('El titulo del documento es obligatorio.');
      return;
    }

    if (!payload.file) {
      notifyWarning('Debes seleccionar el archivo PDF que deseas cargar.');
      return;
    }

    if (selectedItem.document_type.has_expiry) {
      if (!payload.issue_date || !payload.expiry_date) {
        notifyWarning('Las constancias requieren fecha de emision y fecha de vencimiento.');
        return;
      }

      if (new Date(payload.expiry_date).getTime() <= new Date(payload.issue_date).getTime()) {
        notifyWarning('La fecha de vencimiento debe ser posterior a la fecha de emision.');
        return;
      }
    }

    const documentPayload: EmployeeDocumentPayload = {
      document_type_id: selectedItem.document_type.id,
      title: payload.title,
      description: payload.description,
      issue_date: payload.issue_date || undefined,
      expiry_date: selectedItem.document_type.has_expiry ? payload.expiry_date || undefined : undefined,
      file: payload.file,
    };

    setSavingDocument(true);
    try {
      await uploadMyEmployeeDocument(documentPayload);
      notifySuccess('Tu documento se cargo correctamente en el expediente.');
      setSelectedItem(null);
      await loadExpedient();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo cargar tu documento.'));
    } finally {
      setSavingDocument(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-3xl border border-[rgba(0,65,106,0.08)] bg-white/92 p-10 text-center shadow-xl shadow-[rgba(0,65,106,0.08)]">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[rgba(191,212,230,0.28)] text-[var(--color-brand-700)]">
          <Loader2 size={24} className="animate-spin" />
        </div>
        <p className="mt-4 text-sm text-[var(--unilabor-neutral)]">Cargando tu expediente personal...</p>
      </div>
    );
  }

  if (profileMissing) {
    return (
      <div className="rounded-3xl border border-dashed border-[rgba(0,65,106,0.14)] bg-white/88 p-10 text-center shadow-xl shadow-[rgba(0,65,106,0.08)]">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[rgba(191,212,230,0.28)] text-[var(--color-brand-700)]">
          <UserSquare2 size={24} />
        </div>
        <p className="mt-4 text-base font-semibold text-[var(--color-brand-700)]">
          Tu cuenta aun no esta vinculada a un expediente
        </p>
        <p className="mt-2 text-sm text-[var(--unilabor-neutral)]">
          Solicita a RH que asocie tu usuario con tu ficha de colaborador para consultar y cargar documentos.
        </p>
      </div>
    );
  }

  if (!expedient) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-3xl border border-[rgba(0,65,106,0.1)] bg-[linear-gradient(135deg,#ffffff_0%,#eef5fa_56%,#dbe8f2_100%)] shadow-xl shadow-[rgba(0,65,106,0.1)]">
        <div className="bg-[radial-gradient(circle_at_top_right,rgba(124,173,211,0.22),transparent_28%)] px-6 py-7">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--color-brand-500)]">
                Portal del colaborador
              </p>
              <h1 className="mt-2 text-3xl font-bold text-[var(--color-brand-700)]">Mi expediente</h1>
              <p className="mt-2 max-w-3xl text-sm text-[var(--unilabor-neutral)]">
                Consulta tus documentos, revisa faltantes y carga tus propios archivos al expediente digital.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void loadExpedient()}
              className="inline-flex items-center gap-2 rounded-2xl border border-[rgba(0,65,106,0.12)] bg-white/90 px-4 py-2.5 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
            >
              <RefreshCw size={16} />
              Recargar
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-[rgba(0,65,106,0.08)] bg-white/92 p-6 shadow-xl shadow-[rgba(0,65,106,0.08)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[rgba(191,212,230,0.32)] text-[var(--color-brand-700)]">
                <UserSquare2 size={22} />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-500)]">
                  Mi perfil documental
                </p>
                <h2 className="text-2xl font-bold text-[var(--color-brand-700)]">{expedient.employee.full_name}</h2>
              </div>
            </div>
            <p className="mt-3 text-sm text-[var(--unilabor-neutral)]">
              {expedient.employee.employee_code} | {expedient.employee.area || 'Sin area'} | {expedient.employee.position || 'Sin puesto'}
            </p>
            <p className="mt-1 text-sm text-[var(--unilabor-neutral)]">{expedient.employee.email}</p>
          </div>

          <div className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.88)] px-4 py-3 text-sm text-[var(--color-brand-700)]">
            <div className="flex items-center gap-2 font-semibold">
              <ShieldCheck size={16} />
              Documentos sensibles propios
            </div>
            <p className="mt-1 text-xs text-[var(--unilabor-neutral)]">
              Puedes consultar tus documentos personales y sensibles con el mismo visor seguro del sistema.
            </p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {summaryCards(expedient.summary).map((card) => (
            <div key={card.label} className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.92)] p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">{card.label}</p>
              <div className="mt-3 flex items-end justify-between gap-3">
                <p className="text-3xl font-bold text-[var(--color-brand-700)]">{card.value}</p>
                <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide ${card.accent}`}>
                  {card.label === 'Tipos configurados'
                    ? `${expedient.summary.completion_percent}% avance`
                    : 'Mi expediente'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {expedient.sections.map((section) => (
          <ExpedientSectionCard
            key={section.section.id}
            section={section}
            onUpload={(item) => setSelectedItem(item)}
            onView={(documentId) => setSelectedPdfUrl(`${API_BASE_URL}/rh/documents/${documentId}/view`)}
          />
        ))}
      </div>

      <EmployeeDocumentUploadModal
        isOpen={selectedItem !== null}
        employee={expedient.employee}
        documentType={selectedItem?.document_type ?? null}
        currentDocument={selectedItem?.current_document ?? null}
        saving={savingDocument}
        onClose={() => setSelectedItem(null)}
        onSubmit={handleUpload}
      />

      {selectedPdfUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(11,34,53,0.28)] p-4 backdrop-blur-sm">
          <div className="w-full max-w-5xl overflow-hidden rounded-3xl border border-[rgba(0,65,106,0.08)] bg-white/95 shadow-2xl shadow-[rgba(0,65,106,0.16)]">
            <div className="flex items-center justify-between border-b border-[rgba(0,65,106,0.08)] bg-white/96 px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-bold text-[var(--color-brand-700)]">
                <Eye size={16} />
                VISOR SEGURO RH
              </div>
              <button
                type="button"
                onClick={() => setSelectedPdfUrl(null)}
                className="rounded-full px-3 py-1.5 text-sm text-[var(--unilabor-neutral)] transition hover:bg-[rgba(191,212,230,0.28)] hover:text-[var(--color-brand-700)]"
              >
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
