import { useCallback, useEffect, useState } from 'react';
import { CheckSquare, FileText, GraduationCap, ListChecks, Loader2, Phone, Square, Trash2, UserPlus } from 'lucide-react';
import { toast } from 'react-toastify';
import { listEmployees } from '../api/service';
import {
  addPhaseChecklistItem,
  addPhaseDocument,
  enrollEmployeeInPhase,
  listEnrollmentChecklistProgress,
  listInductionPhases,
  listPhaseChecklistItems,
  listPhaseEnrollments,
  removePhaseChecklistItem,
  removePhaseDocument,
  setEnrollmentSupervisor,
  toggleChecklistItem,
  updatePhaseContact,
} from '../api/service.api-rh-induction';
import { lookupDocumentByCode, type DocumentLookupResult } from '../api/service.api-rh-position';
import { getApiErrorMessage } from '../api/service.parsers';
import { SearchableSelect } from '../components/SearchableSelect';
import type {
  Employee,
  RhInductionChecklistItem,
  RhInductionChecklistProgressItem,
  RhInductionPhase,
  RhInductionPhaseEnrollmentSummary,
} from '../types/models';

const cardClass = 'rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/90 p-5 shadow-xl shadow-[rgba(0,65,106,0.08)]';
const inputClass =
  'w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2 text-sm text-[var(--unilabor-ink)] outline-none focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]';
const buttonClass =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:cursor-not-allowed disabled:opacity-50';

const formatPercentage = (item: RhInductionPhaseEnrollmentSummary): string => {
  if (item.evaluation_percentage === null) return 'Sin evaluación';
  return `${item.evaluation_percentage}%`;
};

export const RhInductionPage = () => {
  const [phases, setPhases] = useState<RhInductionPhase[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPhaseId, setSelectedPhaseId] = useState<number | null>(null);
  const [enrollments, setEnrollments] = useState<RhInductionPhaseEnrollmentSummary[]>([]);
  const [loadingEnrollments, setLoadingEnrollments] = useState(false);

  const [documentCode, setDocumentCode] = useState('');
  const [documentPreview, setDocumentPreview] = useState<DocumentLookupResult | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [savingDocument, setSavingDocument] = useState(false);

  const [responsibleName, setResponsibleName] = useState('');
  const [responsiblePhone, setResponsiblePhone] = useState('');
  const [savingContact, setSavingContact] = useState(false);

  const [enrollEmployeeId, setEnrollEmployeeId] = useState('');
  const [enrollSupervisorId, setEnrollSupervisorId] = useState('');
  const [enrolling, setEnrolling] = useState(false);

  const [checklistItems, setChecklistItems] = useState<RhInductionChecklistItem[]>([]);
  const [newChecklistText, setNewChecklistText] = useState('');
  const [savingChecklistItem, setSavingChecklistItem] = useState(false);

  const [expandedEnrollmentId, setExpandedEnrollmentId] = useState<number | null>(null);
  const [checklistProgress, setChecklistProgress] = useState<RhInductionChecklistProgressItem[]>([]);
  const [loadingChecklistProgress, setLoadingChecklistProgress] = useState(false);
  const [editingSupervisorId, setEditingSupervisorId] = useState<number | null>(null);
  const [supervisorSelection, setSupervisorSelection] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [phaseData, employeeData] = await Promise.all([listInductionPhases(), listEmployees()]);
      setPhases(phaseData);
      setEmployees(employeeData);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudieron cargar las fases de inducción.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedPhase = phases.find((phase) => phase.id === selectedPhaseId) ?? null;

  const loadEnrollments = useCallback(async (phaseId: number) => {
    setLoadingEnrollments(true);
    try {
      setEnrollments(await listPhaseEnrollments(phaseId));
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudieron cargar las inscripciones.'));
    } finally {
      setLoadingEnrollments(false);
    }
  }, []);

  const loadChecklistItems = useCallback(async (phaseId: number) => {
    try {
      setChecklistItems(await listPhaseChecklistItems(phaseId));
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo cargar el checklist de contenidos.'));
    }
  }, []);

  const selectPhase = (phase: RhInductionPhase) => {
    setSelectedPhaseId(phase.id);
    setResponsibleName(phase.responsible_name ?? '');
    setResponsiblePhone(phase.responsible_phone ?? '');
    setDocumentCode('');
    setDocumentPreview(null);
    setExpandedEnrollmentId(null);
    void loadEnrollments(phase.id);
    void loadChecklistItems(phase.id);
  };

  const handleLookupDocument = async () => {
    if (!documentCode.trim()) return;
    setLookingUp(true);
    setDocumentPreview(null);
    try {
      const found = await lookupDocumentByCode(documentCode.trim());
      if (!found) {
        toast.warning('No existe un documento vigente con ese código.');
      }
      setDocumentPreview(found);
    } finally {
      setLookingUp(false);
    }
  };

  const handleAddDocument = async () => {
    if (!selectedPhase || !documentPreview) return;
    setSavingDocument(true);
    try {
      await addPhaseDocument(selectedPhase.id, documentPreview.id);
      setDocumentCode('');
      setDocumentPreview(null);
      toast.success('Documento agregado a la fase correctamente.');
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo agregar el documento.'));
    } finally {
      setSavingDocument(false);
    }
  };

  const handleRemoveDocument = async (phaseDocumentId: number) => {
    try {
      await removePhaseDocument(phaseDocumentId);
      toast.success('Documento quitado de la fase correctamente.');
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo quitar el documento.'));
    }
  };

  const handleSaveContact = async () => {
    if (!selectedPhase) return;
    setSavingContact(true);
    try {
      await updatePhaseContact(selectedPhase.id, responsibleName.trim() || null, responsiblePhone.trim() || null);
      toast.success('Contacto del responsable actualizado correctamente.');
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo actualizar el contacto.'));
    } finally {
      setSavingContact(false);
    }
  };

  const handleEnroll = async () => {
    if (!selectedPhase || !enrollEmployeeId) {
      toast.warning('Selecciona un colaborador.');
      return;
    }
    setEnrolling(true);
    try {
      await enrollEmployeeInPhase(
        selectedPhase.id,
        Number(enrollEmployeeId),
        enrollSupervisorId ? Number(enrollSupervisorId) : null,
      );
      setEnrollEmployeeId('');
      setEnrollSupervisorId('');
      toast.success('Colaborador inscrito correctamente.');
      await loadEnrollments(selectedPhase.id);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo inscribir al colaborador.'));
    } finally {
      setEnrolling(false);
    }
  };

  const handleAddChecklistItem = async () => {
    if (!selectedPhase || !newChecklistText.trim()) return;
    setSavingChecklistItem(true);
    try {
      await addPhaseChecklistItem(selectedPhase.id, newChecklistText.trim());
      setNewChecklistText('');
      toast.success('Contenido agregado al checklist correctamente.');
      await loadChecklistItems(selectedPhase.id);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo agregar el contenido.'));
    } finally {
      setSavingChecklistItem(false);
    }
  };

  const handleRemoveChecklistItem = async (checklistItemId: number) => {
    if (!selectedPhase) return;
    try {
      await removePhaseChecklistItem(checklistItemId);
      toast.success('Contenido quitado del checklist correctamente.');
      await loadChecklistItems(selectedPhase.id);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo quitar el contenido.'));
    }
  };

  const handleToggleExpandEnrollment = async (enrollmentId: number) => {
    if (expandedEnrollmentId === enrollmentId) {
      setExpandedEnrollmentId(null);
      return;
    }
    setExpandedEnrollmentId(enrollmentId);
    setLoadingChecklistProgress(true);
    try {
      setChecklistProgress(await listEnrollmentChecklistProgress(enrollmentId));
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo cargar el progreso del checklist.'));
    } finally {
      setLoadingChecklistProgress(false);
    }
  };

  const handleToggleChecklistProgressItem = async (enrollmentId: number, checklistItemId: number, completed: boolean) => {
    try {
      await toggleChecklistItem(enrollmentId, checklistItemId, completed);
      setChecklistProgress(await listEnrollmentChecklistProgress(enrollmentId));
      if (selectedPhase) {
        await loadEnrollments(selectedPhase.id);
      }
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo actualizar el checklist.'));
    }
  };

  const handleSaveSupervisor = async (enrollmentId: number) => {
    if (!selectedPhase) return;
    try {
      await setEnrollmentSupervisor(enrollmentId, supervisorSelection ? Number(supervisorSelection) : null);
      toast.success('Supervisor actualizado correctamente.');
      setEditingSupervisorId(null);
      await loadEnrollments(selectedPhase.id);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo actualizar el supervisor.'));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--color-brand-500)]">
          Inducción por puesto
        </p>
        <h1 className="mt-2 text-3xl font-bold text-[var(--color-brand-700)]">Fases de inducción</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--unilabor-neutral)]">
          Fases 1-4 (institucionales, iguales para todo colaborador). Cada fase reutiliza el motor de
          Evaluaciones y Sala de Lectura ya existentes: configura aquí los documentos obligatorios y
          el contacto del responsable; el cuestionario y las 3 firmas de la constancia se configuran
          desde Capacitaciones (RH → Evaluaciones), sobre la capacitación con el mismo nombre.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(260px,0.35fr)_minmax(0,1fr)]">
        <section className={cardClass}>
          {loading ? (
            <p className="text-sm text-[var(--unilabor-neutral)]">Cargando...</p>
          ) : (
            <div className="space-y-2">
              {phases.map((phase) => (
                <button
                  type="button"
                  key={phase.id}
                  onClick={() => selectPhase(phase)}
                  className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                    selectedPhaseId === phase.id
                      ? 'border-[rgba(0,65,106,0.16)] bg-[rgba(191,212,230,0.34)]'
                      : 'border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)] hover:bg-[rgba(191,212,230,0.2)]'
                  }`}
                >
                  <p className="text-sm font-bold text-[var(--color-brand-700)]">
                    Fase {phase.phase_number}: {phase.name}
                  </p>
                  <p className="text-xs text-[var(--unilabor-neutral)]">
                    {phase.scope === 'INSTITUTIONAL' ? `${phase.documents.length} documentos` : 'Por puesto (próximamente)'}
                  </p>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className={cardClass}>
          {!selectedPhase ? (
            <p className="rounded-xl border border-dashed border-[rgba(0,65,106,0.14)] p-6 text-center text-sm text-[var(--unilabor-neutral)]">
              Selecciona una fase para configurarla.
            </p>
          ) : selectedPhase.scope !== 'INSTITUTIONAL' ? (
            <p className="rounded-xl border border-dashed border-[rgba(0,65,106,0.14)] p-6 text-center text-sm text-[var(--unilabor-neutral)]">
              Esta fase es específica por puesto; la configuración por puesto llega en una siguiente entrega.
            </p>
          ) : (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-bold text-[var(--color-brand-700)]">
                  Fase {selectedPhase.phase_number}: {selectedPhase.name}
                </h2>
                <p className="text-xs text-[var(--unilabor-neutral)]">{selectedPhase.responsible_label}</p>
              </div>

              <div>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-[var(--color-brand-700)]">
                  <Phone size={14} />
                  Contacto del responsable (para el aviso por WhatsApp)
                </h3>
                <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <input
                    value={responsibleName}
                    onChange={(event) => setResponsibleName(event.target.value)}
                    placeholder="Nombre del responsable"
                    className={inputClass}
                  />
                  <input
                    value={responsiblePhone}
                    onChange={(event) => setResponsiblePhone(event.target.value)}
                    placeholder="Teléfono (10 dígitos)"
                    className={inputClass}
                  />
                  <button type="button" onClick={() => void handleSaveContact()} disabled={savingContact} className={buttonClass}>
                    {savingContact ? <Loader2 size={14} className="animate-spin" /> : 'Guardar'}
                  </button>
                </div>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-bold text-[var(--color-brand-700)]">
                  Documentos obligatorios ({selectedPhase.documents.length})
                </h3>
                <div className="space-y-1.5">
                  {selectedPhase.documents.map((document) => (
                    <div
                      key={document.id}
                      className="flex items-center justify-between rounded-lg border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)] px-3 py-1.5 text-sm"
                    >
                      <span className="inline-flex items-center gap-2 text-[var(--unilabor-ink)]">
                        <FileText size={14} className="text-[var(--color-brand-500)]" />
                        {document.code ? `${document.code} — ` : ''}
                        {document.title}
                      </span>
                      <button type="button" onClick={() => void handleRemoveDocument(document.id)} className="text-rose-500 hover:text-rose-700">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <input
                    value={documentCode}
                    onChange={(event) => {
                      setDocumentCode(event.target.value);
                      setDocumentPreview(null);
                    }}
                    placeholder="Código del documento (ej. REH-INS-001)"
                    className={inputClass}
                  />
                  <button type="button" onClick={() => void handleLookupDocument()} disabled={lookingUp} className={buttonClass}>
                    {lookingUp ? <Loader2 size={14} className="animate-spin" /> : 'Buscar'}
                  </button>
                </div>
                {documentPreview ? (
                  <div className="mt-2 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    <span>
                      Encontrado: <strong>{documentPreview.title}</strong>
                    </span>
                    <button type="button" onClick={() => void handleAddDocument()} disabled={savingDocument} className="font-semibold underline">
                      {savingDocument ? 'Agregando...' : 'Agregar a la fase'}
                    </button>
                  </div>
                ) : null}
              </div>

              <div>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-[var(--color-brand-700)]">
                  <ListChecks size={14} />
                  Checklist de contenidos ({checklistItems.length})
                </h3>
                <div className="space-y-1.5">
                  {checklistItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-lg border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)] px-3 py-1.5 text-sm"
                    >
                      <span className="text-[var(--unilabor-ink)]">{item.item_text}</span>
                      <button type="button" onClick={() => void handleRemoveChecklistItem(item.id)} className="text-rose-500 hover:text-rose-700">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <input
                    value={newChecklistText}
                    onChange={(event) => setNewChecklistText(event.target.value)}
                    placeholder="Nuevo contenido del checklist"
                    className={inputClass}
                  />
                  <button type="button" onClick={() => void handleAddChecklistItem()} disabled={savingChecklistItem} className={buttonClass}>
                    {savingChecklistItem ? <Loader2 size={14} className="animate-spin" /> : 'Agregar'}
                  </button>
                </div>
              </div>

              <div>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-[var(--color-brand-700)]">
                  <GraduationCap size={14} />
                  Inscribir colaborador
                </h3>
                <div className="space-y-2">
                  <SearchableSelect
                    value={enrollEmployeeId}
                    onChange={setEnrollEmployeeId}
                    options={employees.map((employee) => ({
                      value: String(employee.id),
                      label: employee.full_name,
                      hint: employee.employee_code,
                    }))}
                    placeholder="Buscar colaborador..."
                    emptyLabel="Sin seleccionar"
                    searchPlaceholder="Buscar por nombre o código..."
                  />
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <SearchableSelect
                        value={enrollSupervisorId}
                        onChange={setEnrollSupervisorId}
                        options={employees.map((employee) => ({
                          value: String(employee.id),
                          label: employee.full_name,
                          hint: employee.employee_code,
                        }))}
                        placeholder="Supervisor (opcional)..."
                        emptyLabel="Sin supervisor"
                        searchPlaceholder="Buscar por nombre o código..."
                      />
                    </div>
                    <button type="button" onClick={() => void handleEnroll()} disabled={enrolling} className={buttonClass}>
                      {enrolling ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-bold text-[var(--color-brand-700)]">
                  Inscripciones ({enrollments.length})
                </h3>
                {loadingEnrollments ? (
                  <p className="text-sm text-[var(--unilabor-neutral)]">Cargando...</p>
                ) : enrollments.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-[rgba(0,65,106,0.14)] p-4 text-sm text-[var(--unilabor-neutral)]">
                    Sin colaboradores inscritos todavía.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {enrollments.map((item) => (
                      <div
                        key={item.enrollment_id}
                        className="rounded-lg border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)] px-3 py-2 text-sm"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-bold text-[var(--color-brand-700)]">{item.employee_name}</p>
                            <p className="text-xs text-[var(--unilabor-neutral)]">{item.employee_code}</p>
                          </div>
                          <div className="text-right text-xs text-[var(--unilabor-neutral)]">
                            <p>
                              Lectura: {item.reading_signed}/{item.reading_total}
                            </p>
                            <p>
                              Evaluación: {item.evaluation_status ?? 'Pendiente'} ({formatPercentage(item)})
                            </p>
                          </div>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-[rgba(0,65,106,0.08)] pt-2 text-xs">
                          {editingSupervisorId === item.enrollment_id ? (
                            <div className="flex flex-1 items-center gap-2">
                              <div className="flex-1">
                                <SearchableSelect
                                  value={supervisorSelection}
                                  onChange={setSupervisorSelection}
                                  options={employees.map((employee) => ({
                                    value: String(employee.id),
                                    label: employee.full_name,
                                    hint: employee.employee_code,
                                  }))}
                                  placeholder="Supervisor..."
                                  emptyLabel="Sin supervisor"
                                  searchPlaceholder="Buscar por nombre o código..."
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() => void handleSaveSupervisor(item.enrollment_id)}
                                className="font-semibold text-[var(--color-brand-700)] underline"
                              >
                                Guardar
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingSupervisorId(item.enrollment_id);
                                setSupervisorSelection(item.supervisor_employee_id ? String(item.supervisor_employee_id) : '');
                              }}
                              className="text-[var(--unilabor-neutral)] hover:text-[var(--color-brand-700)]"
                            >
                              Supervisor: <span className="font-semibold">{item.supervisor_name ?? 'No asignado'}</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => void handleToggleExpandEnrollment(item.enrollment_id)}
                            className="inline-flex items-center gap-1 text-[var(--unilabor-neutral)] hover:text-[var(--color-brand-700)]"
                          >
                            <ListChecks size={12} />
                            Checklist: {item.checklist_completed}/{item.checklist_total}
                          </button>
                        </div>

                        {expandedEnrollmentId === item.enrollment_id ? (
                          <div className="mt-2 space-y-1 rounded-lg bg-white/80 p-2">
                            {loadingChecklistProgress ? (
                              <p className="text-xs text-[var(--unilabor-neutral)]">Cargando...</p>
                            ) : (
                              checklistProgress.map((progressItem) => (
                                <button
                                  type="button"
                                  key={progressItem.checklist_item_id}
                                  onClick={() =>
                                    void handleToggleChecklistProgressItem(
                                      item.enrollment_id,
                                      progressItem.checklist_item_id,
                                      !progressItem.completed_at,
                                    )
                                  }
                                  className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-xs text-[var(--unilabor-ink)] hover:bg-[rgba(191,212,230,0.2)]"
                                >
                                  {progressItem.completed_at ? (
                                    <CheckSquare size={13} className="text-emerald-600" />
                                  ) : (
                                    <Square size={13} className="text-[var(--unilabor-neutral)]" />
                                  )}
                                  {progressItem.item_text}
                                </button>
                              ))
                            )}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
