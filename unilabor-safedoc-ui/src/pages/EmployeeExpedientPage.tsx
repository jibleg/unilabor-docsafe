import { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, FileStack, Loader2, RefreshCw, ShieldCheck, UserSquare2 } from 'lucide-react';
import { API_BASE_URL } from '../api/axios';
import {
  fetchEmployeeExpedientById,
  getApiErrorMessage,
  listEmployees,
  uploadEmployeeDocumentByEmployeeId,
  type EmployeeDocumentPayload,
} from '../api/service';
import { PdfSafeViewer } from '../components/PdfSafeViewerSafe';
import { EmployeeDocumentUploadModal } from '../components/rh/EmployeeDocumentUploadModal';
import { ExpedientSectionCard } from '../components/rh/ExpedientSectionCard';
import type { Employee, EmployeeExpedient, EmployeeExpedientItem } from '../types/models';
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

export const EmployeeExpedientPage = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [loadingExpedient, setLoadingExpedient] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  const [expedient, setExpedient] = useState<EmployeeExpedient | null>(null);
  const [selectedItem, setSelectedItem] = useState<EmployeeExpedientItem | null>(null);
  const [savingDocument, setSavingDocument] = useState(false);
  const [selectedPdfUrl, setSelectedPdfUrl] = useState<string | null>(null);

  const loadEmployees = useCallback(async () => {
    setLoadingEmployees(true);
    try {
      const data = await listEmployees();
      setEmployees(data);
      setSelectedEmployeeId((current) => current ?? data[0]?.id ?? null);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudieron cargar los colaboradores del expediente.'));
    } finally {
      setLoadingEmployees(false);
    }
  }, []);

  const loadExpedient = useCallback(async (employeeId: number) => {
    setLoadingExpedient(true);
    try {
      const data = await fetchEmployeeExpedientById(employeeId);
      setExpedient(data);
    } catch (error) {
      setExpedient(null);
      notifyError(getApiErrorMessage(error, 'No se pudo cargar el expediente del colaborador.'));
    } finally {
      setLoadingExpedient(false);
    }
  }, []);

  useEffect(() => {
    void loadEmployees();
  }, [loadEmployees]);

  useEffect(() => {
    if (!selectedEmployeeId) {
      setExpedient(null);
      return;
    }

    void loadExpedient(selectedEmployeeId);
  }, [loadExpedient, selectedEmployeeId]);

  const filteredEmployees = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return employees;
    }

    return employees.filter((employee) =>
      [employee.employee_code, employee.full_name, employee.email, employee.area ?? '', employee.position ?? '']
        .some((value) => value.toLowerCase().includes(normalizedQuery)),
    );
  }, [employees, query]);

  const currentEmployee = expedient?.employee ?? employees.find((employee) => employee.id === selectedEmployeeId) ?? null;

  const handleUpload = async (payload: {
    title: string;
    description: string;
    issue_date: string;
    expiry_date: string;
    file: File | null;
  }) => {
    if (!selectedEmployeeId || !selectedItem) {
      return;
    }

    if (!payload.title.trim()) {
      notifyWarning('El titulo del documento es obligatorio.');
      return;
    }

    if (!payload.file) {
      notifyWarning('Debes seleccionar el archivo PDF del expediente.');
      return;
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
      await uploadEmployeeDocumentByEmployeeId(selectedEmployeeId, documentPayload);
      notifySuccess('Documento RH cargado correctamente en el expediente.');
      setSelectedItem(null);
      await loadExpedient(selectedEmployeeId);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo cargar el documento RH.'));
    } finally {
      setSavingDocument(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-3xl border border-[rgba(0,65,106,0.1)] bg-[linear-gradient(135deg,#ffffff_0%,#eef5fa_56%,#dbe8f2_100%)] shadow-xl shadow-[rgba(0,65,106,0.1)]">
        <div className="bg-[radial-gradient(circle_at_top_right,rgba(124,173,211,0.22),transparent_28%)] px-6 py-7">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--color-brand-500)]">
                Recursos Humanos
              </p>
              <h1 className="mt-2 text-3xl font-bold text-[var(--color-brand-700)]">
                Expediente del colaborador
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-[var(--unilabor-neutral)]">
                Conecta la estructura documental RH con cada colaborador, permitiendo carga, reemplazo y consulta segura del PDF.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                void loadEmployees();
                if (selectedEmployeeId) {
                  void loadExpedient(selectedEmployeeId);
                }
              }}
              className="inline-flex items-center gap-2 rounded-2xl border border-[rgba(0,65,106,0.12)] bg-white/90 px-4 py-2.5 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
            >
              <RefreshCw size={16} className={loadingEmployees || loadingExpedient ? 'animate-spin' : ''} />
              Recargar expediente
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(300px,0.85fr)_minmax(0,1.6fr)]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/88 p-4 shadow-xl shadow-[rgba(0,65,106,0.08)] backdrop-blur-xl">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar colaborador por codigo, nombre, correo..."
              className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-4 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
            />
          </div>

          <div className="overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/88 shadow-xl shadow-[rgba(0,65,106,0.08)] backdrop-blur-xl">
            <div className="border-b border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.96)] px-5 py-4">
              <p className="text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                Colaboradores con expediente
              </p>
            </div>

            <div className="divide-y divide-[rgba(0,65,106,0.08)]">
              {loadingEmployees ? (
                <div className="flex items-center gap-3 px-5 py-8 text-sm text-[var(--unilabor-neutral)]">
                  <Loader2 size={16} className="animate-spin" />
                  Cargando colaboradores...
                </div>
              ) : filteredEmployees.length === 0 ? (
                <div className="px-5 py-8 text-sm text-[var(--unilabor-neutral)]">
                  No hay colaboradores para mostrar.
                </div>
              ) : (
                filteredEmployees.map((employee) => {
                  const isSelected = employee.id === selectedEmployeeId;
                  return (
                    <button
                      key={employee.id}
                      type="button"
                      onClick={() => setSelectedEmployeeId(employee.id)}
                      className={`w-full px-5 py-4 text-left transition ${
                        isSelected
                          ? 'bg-[rgba(191,212,230,0.28)]'
                          : 'hover:bg-[rgba(191,212,230,0.18)]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-[var(--color-brand-700)]">{employee.full_name}</p>
                          <p className="text-xs text-[var(--unilabor-neutral)]">{employee.employee_code}</p>
                          <p className="mt-1 text-xs text-[var(--unilabor-neutral)]">{employee.email}</p>
                        </div>
                        {isSelected && (
                          <span className="rounded-full border border-[rgba(0,65,106,0.14)] bg-white/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--color-brand-700)]">
                            Activo
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {loadingExpedient ? (
            <div className="rounded-3xl border border-[rgba(0,65,106,0.08)] bg-white/92 p-10 text-center shadow-xl shadow-[rgba(0,65,106,0.08)]">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[rgba(191,212,230,0.28)] text-[var(--color-brand-700)]">
                <Loader2 size={24} className="animate-spin" />
              </div>
              <p className="mt-4 text-sm text-[var(--unilabor-neutral)]">Cargando estructura del expediente...</p>
            </div>
          ) : expedient && currentEmployee ? (
            <>
              <div className="rounded-3xl border border-[rgba(0,65,106,0.08)] bg-white/92 p-6 shadow-xl shadow-[rgba(0,65,106,0.08)]">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[rgba(191,212,230,0.32)] text-[var(--color-brand-700)]">
                        <UserSquare2 size={22} />
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-500)]">
                          Expediente activo
                        </p>
                        <h2 className="text-2xl font-bold text-[var(--color-brand-700)]">{currentEmployee.full_name}</h2>
                      </div>
                    </div>
                    <p className="mt-3 text-sm text-[var(--unilabor-neutral)]">
                      {currentEmployee.employee_code} · {currentEmployee.area || 'Sin area'} · {currentEmployee.position || 'Sin puesto'}
                    </p>
                    <p className="mt-1 text-sm text-[var(--unilabor-neutral)]">{currentEmployee.email}</p>
                  </div>

                  <div className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.88)] px-4 py-3 text-sm text-[var(--color-brand-700)]">
                    <div className="flex items-center gap-2 font-semibold">
                      <ShieldCheck size={16} />
                      Visor protegido RH
                    </div>
                    <p className="mt-1 text-xs text-[var(--unilabor-neutral)]">
                      Los documentos del expediente usan el mismo esquema de visualizacion segura PDF.
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
                            : 'RH'}
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
                    onView={(documentId) =>
                      setSelectedPdfUrl(`${API_BASE_URL}/rh/documents/${documentId}/view`)
                    }
                  />
                ))}
              </div>
            </>
          ) : (
            <div className="rounded-3xl border border-dashed border-[rgba(0,65,106,0.14)] bg-white/88 p-10 text-center shadow-xl shadow-[rgba(0,65,106,0.08)]">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[rgba(191,212,230,0.28)] text-[var(--color-brand-700)]">
                <FileStack size={24} />
              </div>
              <p className="mt-4 text-base font-semibold text-[var(--color-brand-700)]">
                Selecciona un colaborador para abrir su expediente
              </p>
              <p className="mt-2 text-sm text-[var(--unilabor-neutral)]">
                Aqui podras revisar tipos documentales, cargar PDFs y visualizar la version vigente de cada documento RH.
              </p>
            </div>
          )}
        </div>
      </div>

      <EmployeeDocumentUploadModal
        isOpen={selectedItem !== null && currentEmployee !== null}
        employee={currentEmployee}
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
