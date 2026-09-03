import { useCallback, useEffect, useState } from 'react';
import { CheckSquare, FileText, GraduationCap, ListChecks, Loader2, Phone, Square, Trash2, UserPlus, Users, X } from 'lucide-react';
import { toast } from 'react-toastify';
import { listEmployees } from '../api/service';
import {
  addPhaseChecklistItem,
  addPhaseDocument,
  enablePhaseForPosition,
  enrollAllInPhase,
  enrollEmployeeInPhase,
  getPhaseCertificateReadiness,
  listEnrollmentChecklistProgress,
  listInductionPhases,
  listPhaseChecklistItems,
  listPhaseEnrollments,
  listPhasePositions,
  removeEnrollment,
  removePhaseChecklistItem,
  removePhaseDocument,
  setEnrollmentSupervisor,
  toggleChecklistItem,
  updatePhaseContact,
  updatePhaseDuration,
  updatePhaseReadingLimit,
  type RhInductionBulkEnrollmentResult,
  type RhInductionCertificateReadiness,
} from '../api/service.api-rh-induction';
import { confirmAction } from '../utils/confirm';
import { EnrollmentCertificateDataModal } from '../components/rh/EnrollmentCertificateDataModal';
import { listPositions, lookupDocumentByCode, type DocumentLookupResult } from '../api/service.api-rh-position';
import { getApiErrorMessage } from '../api/service.parsers';
import { SearchableSelect } from '../components/SearchableSelect';
import type {
  Employee,
  RhInductionChecklistItem,
  RhInductionPhasePosition,
  RhPosition,
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

  const [durationHours, setDurationHours] = useState('');
  const [savingDuration, setSavingDuration] = useState(false);
  const [readingLimitHours, setReadingLimitHours] = useState('');
  const [savingReadingLimit, setSavingReadingLimit] = useState(false);
  const [certReadiness, setCertReadiness] = useState<RhInductionCertificateReadiness | null>(null);
  const [certDataTarget, setCertDataTarget] = useState<RhInductionPhaseEnrollmentSummary | null>(null);

  const refreshCertReadiness = useCallback((phaseId: number) => {
    getPhaseCertificateReadiness(phaseId)
      .then(setCertReadiness)
      .catch(() => {
        // Panel informativo: si falla la consulta simplemente no se muestra.
      });
  }, []);

  const [allPositions, setAllPositions] = useState<RhPosition[]>([]);
  const [phasePositions, setPhasePositions] = useState<RhInductionPhasePosition[]>([]);
  const [enablePositionId, setEnablePositionId] = useState('');
  const [enablingPosition, setEnablingPosition] = useState(false);

  const [enrollEmployeeId, setEnrollEmployeeId] = useState('');
  const [enrollSupervisorId, setEnrollSupervisorId] = useState('');
  const [enrolling, setEnrolling] = useState(false);
  const [enrollingAll, setEnrollingAll] = useState(false);
  const [bulkResult, setBulkResult] = useState<RhInductionBulkEnrollmentResult | null>(null);

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
      const [phaseData, employeeData, positionData] = await Promise.all([
        listInductionPhases(),
        listEmployees(),
        listPositions(),
      ]);
      setPhases(phaseData);
      setEmployees(employeeData);
      setAllPositions(positionData);
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
    setDurationHours(phase.duration_hours !== null ? String(phase.duration_hours) : '');
    setReadingLimitHours(phase.reading_time_limit_hours !== null ? String(phase.reading_time_limit_hours) : '');
    setDocumentCode('');
    setDocumentPreview(null);
    setExpandedEnrollmentId(null);
    setBulkResult(null);
    setPhasePositions([]);
    setEnablePositionId('');
    void loadEnrollments(phase.id);
    void loadChecklistItems(phase.id);
    setCertReadiness(null);
    refreshCertReadiness(phase.id);
    if (phase.scope === 'POSITION' && phase.phase_number !== 7) {
      listPhasePositions(phase.id)
        .then(setPhasePositions)
        .catch((error) => toast.error(getApiErrorMessage(error, 'No se pudieron cargar los puestos de la fase.')));
    }
  };

  const handleEnablePosition = async () => {
    if (!selectedPhase || !enablePositionId) {
      toast.warning('Selecciona un puesto.');
      return;
    }
    setEnablingPosition(true);
    try {
      await enablePhaseForPosition(selectedPhase.id, Number(enablePositionId));
      toast.success('Fase habilitada para el puesto; diseña su evaluación en Capacitaciones.');
      setEnablePositionId('');
      setPhasePositions(await listPhasePositions(selectedPhase.id));
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo habilitar la fase para el puesto.'));
    } finally {
      setEnablingPosition(false);
    }
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

  const handleSaveDuration = async () => {
    if (!selectedPhase) return;
    const trimmed = durationHours.trim();
    if (trimmed && (!Number.isFinite(Number(trimmed)) || Number(trimmed) <= 0)) {
      toast.warning('La duración debe ser un número de horas mayor a 0.');
      return;
    }
    setSavingDuration(true);
    try {
      await updatePhaseDuration(selectedPhase.id, trimmed ? Number(trimmed) : null);
      toast.success('Duración de la fase actualizada correctamente.');
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo actualizar la duración.'));
    } finally {
      setSavingDuration(false);
    }
  };

  const handleSaveReadingLimit = async () => {
    if (!selectedPhase) return;
    const trimmed = readingLimitHours.trim();
    if (trimmed && (!Number.isFinite(Number(trimmed)) || Number(trimmed) <= 0)) {
      toast.warning('El límite de lectura debe ser un número de horas mayor a 0.');
      return;
    }
    setSavingReadingLimit(true);
    try {
      await updatePhaseReadingLimit(selectedPhase.id, trimmed ? Number(trimmed) : null);
      toast.success('Límite de lectura actualizado correctamente (aplica a inscripciones nuevas).');
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo actualizar el límite de lectura.'));
    } finally {
      setSavingReadingLimit(false);
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

  const handleEnrollAll = async () => {
    if (!selectedPhase) return;
    const confirmed = await confirmAction(
      'Inscribir a todos',
      `¿Inscribir a todos los colaboradores activos en la fase "${selectedPhase.name}"? Se omitirá automáticamente a quienes ya estén inscritos o aún no aprueben la fase anterior.`,
      'Inscribir a todos',
    );
    if (!confirmed) return;
    setEnrollingAll(true);
    setBulkResult(null);
    try {
      const result = await enrollAllInPhase(selectedPhase.id);
      setBulkResult(result);
      toast.success(`Inscripción masiva: ${result.enrolled} inscrito(s), ${result.skipped.length} omitido(s).`);
      await loadEnrollments(selectedPhase.id);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo completar la inscripción masiva.'));
    } finally {
      setEnrollingAll(false);
    }
  };

  const handleRemoveEnrollment = async (item: RhInductionPhaseEnrollmentSummary) => {
    if (!selectedPhase) return;
    const confirmed = await confirmAction(
      'Eliminar inscripción',
      `¿Eliminar la inscripción de "${item.employee_name}" en esta fase? Se retirarán sus lecturas pendientes sin firmar; los acuses ya firmados se conservan como evidencia.`,
      'Eliminar',
      'danger',
    );
    if (!confirmed) return;
    try {
      await removeEnrollment(item.enrollment_id);
      toast.success('Inscripción eliminada correctamente.');
      await loadEnrollments(selectedPhase.id);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo eliminar la inscripción.'));
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
          ) : selectedPhase.phase_number === 7 ? (
            <p className="rounded-xl border border-dashed border-[rgba(0,65,106,0.14)] p-6 text-center text-sm text-[var(--unilabor-neutral)]">
              La Fase 7 (Evaluación de competencia inicial) se resuelve con el registro REH-REG-003 en la página{' '}
              <strong>Evaluación de competencia</strong>: al cerrar la evaluación tipo "Inicial" del colaborador, su
              resultado se refleja automáticamente en esta fase del Formato de Inducción.
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
                  Duración de la fase (horas)
                </h3>
                <p className="mb-2 text-xs text-[var(--unilabor-neutral)]">
                  Se muestra en la constancia; es la misma para todos los colaboradores de esta fase.
                </p>
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <input
                    type="number"
                    min={0}
                    step="0.5"
                    value={durationHours}
                    onChange={(event) => setDurationHours(event.target.value)}
                    placeholder="Horas (ej. 8)"
                    className={inputClass}
                  />
                  <button type="button" onClick={() => void handleSaveDuration()} disabled={savingDuration} className={buttonClass}>
                    {savingDuration ? <Loader2 size={14} className="animate-spin" /> : 'Guardar'}
                  </button>
                </div>
              </div>

              {selectedPhase.phase_number !== 6 && selectedPhase.phase_number !== 7 ? (
                <div>
                  <h3 className="mb-2 text-sm font-bold text-[var(--color-brand-700)]">
                    Límite de lectura (horas)
                  </h3>
                  <p className="mb-2 text-xs text-[var(--unilabor-neutral)]">
                    Tiempo que tiene el colaborador para leer y firmar los documentos desde que se inscribe. Al
                    vencer (o al terminar antes la lectura) se abre el cuestionario de la fase. Vacío = sin límite.
                    Aplica a inscripciones nuevas.
                  </p>
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                    <input
                      type="number"
                      min={1}
                      value={readingLimitHours}
                      onChange={(event) => setReadingLimitHours(event.target.value)}
                      placeholder="Horas (ej. 24) — vacío: sin límite"
                      className={inputClass}
                    />
                    <button type="button" onClick={() => void handleSaveReadingLimit()} disabled={savingReadingLimit} className={buttonClass}>
                      {savingReadingLimit ? <Loader2 size={14} className="animate-spin" /> : 'Guardar'}
                    </button>
                  </div>
                </div>
              ) : null}

              {certReadiness ? (
                (() => {
                  const missingSignatures = certReadiness.courses.filter((course) => course.signatures_count < 3);
                  const issues: string[] = [];
                  if (!certReadiness.duration_ok) {
                    issues.push('Falta capturar la Duración de la fase: el campo DURACIÓN saldrá vacío ("—").');
                  }
                  missingSignatures.forEach((course) => {
                    issues.push(
                      `${course.label}: solo ${course.signatures_count} de 3 firmas configuradas en la plantilla de constancia (Capacitaciones).`,
                    );
                  });
                  const nameList = (people: Array<{ full_name: string }>) => {
                    const names = people.slice(0, 6).map((person) => person.full_name).join(', ');
                    return people.length > 6 ? `${names} y ${people.length - 6} más` : names;
                  };
                  if (certReadiness.employees_missing_branch.length > 0) {
                    issues.push(
                      `${certReadiness.employees_missing_branch.length} inscrito(s) sin SUCURSAL capturada (RH → Empleados): ${nameList(certReadiness.employees_missing_branch)}.`,
                    );
                  }
                  if (certReadiness.employees_missing_position.length > 0) {
                    issues.push(
                      `${certReadiness.employees_missing_position.length} inscrito(s) sin PUESTO activo asignado: ${nameList(certReadiness.employees_missing_position)}.`,
                    );
                  }
                  return (
                    <div>
                      <h3 className="mb-2 text-sm font-bold text-[var(--color-brand-700)]">
                        Preparación de la constancia
                      </h3>
                      {issues.length === 0 ? (
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-700">
                          ✓ Constancia completa: puesto, sucursal, duración y firmas están capturados para los{' '}
                          {certReadiness.pending_enrollments} inscrito(s) pendientes de aprobar.
                        </div>
                      ) : (
                        <div className="space-y-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                          <p className="font-bold">
                            ⚠ Las constancias de esta fase saldrían incompletas — falta información:
                          </p>
                          {issues.map((issue) => (
                            <p key={issue}>• {issue}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()
              ) : null}

              {selectedPhase.scope === 'POSITION' && (
                <div>
                  <h3 className="mb-2 text-sm font-bold text-[var(--color-brand-700)]">
                    Puestos habilitados ({phasePositions.length})
                  </h3>
                  <p className="mb-2 text-xs text-[var(--unilabor-neutral)]">
                    {selectedPhase.phase_number === 5
                      ? 'Cada puesto lleva su propio curso: el colaborador lee los documentos obligatorios de SU puesto y presenta el cuestionario del curso del puesto.'
                      : 'Cada puesto lleva su propio curso de práctica supervisada: RH captura la calificación (0-10) en "Capacitación práctica".'}
                  </p>
                  <div className="space-y-1.5">
                    {phasePositions.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-center justify-between rounded-lg border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)] px-3 py-1.5 text-sm"
                      >
                        <span className="text-[var(--unilabor-ink)]">
                          {entry.position_name}
                          <span className="ml-2 text-xs text-[var(--unilabor-neutral)]">({entry.course_code})</span>
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            entry.has_published_template
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-amber-50 text-amber-700'
                          }`}
                        >
                          {entry.has_published_template ? 'Evaluación publicada' : 'Falta diseñar evaluación'}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
                    <select
                      value={enablePositionId}
                      onChange={(event) => setEnablePositionId(event.target.value)}
                      className={inputClass}
                    >
                      <option value="">Habilitar un puesto...</option>
                      {allPositions
                        .filter((position) => !phasePositions.some((entry) => entry.position_id === position.id))
                        .map((position) => (
                          <option key={position.id} value={position.id}>
                            {position.name}
                          </option>
                        ))}
                    </select>
                    <button type="button" onClick={() => void handleEnablePosition()} disabled={enablingPosition} className={buttonClass}>
                      {enablingPosition ? <Loader2 size={14} className="animate-spin" /> : 'Habilitar'}
                    </button>
                  </div>
                </div>
              )}

              {selectedPhase.scope === 'POSITION' ? (
                <div className="rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.28)] px-3 py-2 text-xs text-[var(--color-brand-700)]">
                  {selectedPhase.phase_number === 5
                    ? 'Los documentos a leer se toman automáticamente del catálogo del puesto del colaborador (Puestos → Documentos obligatorios).'
                    : 'Esta fase no lleva lectura: al inscribir al colaborador queda lista para que RH capture la calificación práctica.'}
                </div>
              ) : (
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
              )}

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
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--color-brand-700)]">
                    <GraduationCap size={14} />
                    Inscribir colaborador
                  </h3>
                  {selectedPhase.scope === 'INSTITUTIONAL' ? (
                    <button
                      type="button"
                      onClick={() => void handleEnrollAll()}
                      disabled={enrollingAll}
                      className={buttonClass}
                      title="Inscribe a todos los colaboradores activos; omite a los ya inscritos y a quienes no han aprobado la fase anterior"
                    >
                      {enrollingAll ? <Loader2 size={14} className="animate-spin" /> : <Users size={14} />}
                      Inscribir a todos
                    </button>
                  ) : null}
                </div>
                {bulkResult ? (
                  <div className="mb-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(248,251,253,0.96)] p-3 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-[var(--color-brand-700)]">
                        Inscripción masiva: {bulkResult.enrolled} de {bulkResult.total} inscritos
                        {bulkResult.skipped.length > 0 ? ` · ${bulkResult.skipped.length} omitidos` : ''}
                      </p>
                      <button type="button" onClick={() => setBulkResult(null)} className="text-[var(--unilabor-neutral)] hover:text-[var(--color-brand-700)]">
                        <X size={13} />
                      </button>
                    </div>
                    {bulkResult.skipped.length > 0 ? (
                      <div className="mt-1.5 max-h-40 space-y-0.5 overflow-y-auto">
                        {bulkResult.skipped.map((item) => (
                          <p key={item.employee_id} className="text-[var(--unilabor-neutral)]">
                            <span className="font-semibold text-[var(--unilabor-ink)]">{item.full_name}</span> — {item.reason}
                          </p>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
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
                            {item.missing_branch || item.missing_position ? (
                              <button
                                type="button"
                                onClick={() => setCertDataTarget(item)}
                                title="Capturar los datos faltantes de la constancia sin salir de esta pantalla"
                                className="mt-1 inline-flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-amber-700"
                              >
                                <span className="rounded-full bg-amber-50 px-2 py-0.5 ring-1 ring-amber-200">
                                  Constancia: falta{' '}
                                  {[item.missing_branch ? 'sucursal' : null, item.missing_position ? 'puesto' : null]
                                    .filter(Boolean)
                                    .join(' y ')}
                                </span>
                                <span className="underline underline-offset-2">Completar datos</span>
                              </button>
                            ) : null}
                          </div>
                          <div className="text-right text-xs text-[var(--unilabor-neutral)]">
                            <p>
                              Lectura: {item.reading_signed}/{item.reading_total}
                            </p>
                            {item.reading_deadline_at && !item.reading_completed_at ? (
                              <p className={new Date(item.reading_deadline_at) < new Date() ? 'text-rose-500' : ''}>
                                {new Date(item.reading_deadline_at) < new Date() ? 'Lectura vencida: ' : 'Lectura vence: '}
                                {new Date(item.reading_deadline_at).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}
                              </p>
                            ) : null}
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
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => void handleToggleExpandEnrollment(item.enrollment_id)}
                              className="inline-flex items-center gap-1 text-[var(--unilabor-neutral)] hover:text-[var(--color-brand-700)]"
                            >
                              <ListChecks size={12} />
                              Checklist: {item.checklist_completed}/{item.checklist_total}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleRemoveEnrollment(item)}
                              className="text-rose-500 transition hover:text-rose-700"
                              title="Eliminar inscripción (solo si la fase no está aprobada)"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
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

      {certDataTarget && selectedPhase ? (
        <EnrollmentCertificateDataModal
          employeeId={certDataTarget.employee_id}
          employeeName={certDataTarget.employee_name}
          missingBranch={certDataTarget.missing_branch}
          missingPosition={certDataTarget.missing_position}
          onClose={() => setCertDataTarget(null)}
          onSaved={() => {
            void loadEnrollments(selectedPhase.id);
            refreshCertReadiness(selectedPhase.id);
          }}
        />
      ) : null}
    </div>
  );
};
