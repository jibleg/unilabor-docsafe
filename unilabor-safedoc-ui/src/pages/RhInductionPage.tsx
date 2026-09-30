import { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, FileText, GraduationCap, Info, ListChecks, Loader2, Phone, UserPlus, Users, X } from 'lucide-react';
import { toast } from 'react-toastify';
import { listEmployees } from '../api/service';
import {
  addPhaseChecklistItem,
  addPhaseDocument,
  publishInductionPhase,
  unpublishInductionPhase,
  updatePhaseAutoChecklist,
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
import { InductionRetryModal } from '../components/rh/InductionRetryModal';
import { InductionReopenReadingModal } from '../components/rh/InductionReopenReadingModal';
import { listPositions, type DocumentSearchResult } from '../api/service.api-rh-position';
import { CompactListPager } from '../components/CompactListPager';
import { ExpedientTabs } from '../components/rh/ExpedientTabs';
import { InductionCertReadinessNotice } from '../components/rh/induction-phase/InductionCertReadinessNotice';
import { InductionEnrollmentCard } from '../components/rh/induction-phase/InductionEnrollmentCard';
import { InductionPhaseChecklistTab } from '../components/rh/induction-phase/InductionPhaseChecklistTab';
import { InductionPhaseDocumentsTab } from '../components/rh/induction-phase/InductionPhaseDocumentsTab';
import { buttonClass, inputClass, sectionTitleClass } from '../components/rh/induction-phase/styles';
import { certReadinessIssues } from '../utils/inductionCertReadiness';
import type { ExpedientTab } from '../utils/expedientTabs';
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
/** Tamaños de página del listado de inscritos. */
const ENROLLMENT_PAGE_SIZES = [10, 20, 30];

type PhaseTabKey = 'info' | 'documents' | 'checklist' | 'enrollment';

export const RhInductionPage = () => {
  const [phases, setPhases] = useState<RhInductionPhase[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPhaseId, setSelectedPhaseId] = useState<number | null>(null);
  const [enrollments, setEnrollments] = useState<RhInductionPhaseEnrollmentSummary[]>([]);
  const [loadingEnrollments, setLoadingEnrollments] = useState(false);

  const [savingDocument, setSavingDocument] = useState(false);
  const [togglingPublish, setTogglingPublish] = useState(false);
  const [togglingAutoChecklist, setTogglingAutoChecklist] = useState(false);

  const [responsibleName, setResponsibleName] = useState('');
  const [responsiblePhone, setResponsiblePhone] = useState('');
  const [savingContact, setSavingContact] = useState(false);

  const [durationHours, setDurationHours] = useState('');
  const [savingDuration, setSavingDuration] = useState(false);
  const [readingLimitHours, setReadingLimitHours] = useState('');
  // Fase publicada: al guardar el limite, ¿recalcular tambien a los inscritos que aun leen?
  const [applyLimitToEnrolled, setApplyLimitToEnrolled] = useState(true);
  const [savingReadingLimit, setSavingReadingLimit] = useState(false);
  const [certReadiness, setCertReadiness] = useState<RhInductionCertificateReadiness | null>(null);
  const [certDataTarget, setCertDataTarget] = useState<RhInductionPhaseEnrollmentSummary | null>(null);
  const [retryEnrollment, setRetryEnrollment] = useState<RhInductionPhaseEnrollmentSummary | null>(null);
  const [reopenEnrollment, setReopenEnrollment] = useState<RhInductionPhaseEnrollmentSummary | null>(null);

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

  // Columna derecha en pestañas + listado de inscritos paginado (10/20/30).
  const [activeTab, setActiveTab] = useState<PhaseTabKey>('info');
  const [enrollPage, setEnrollPage] = useState(1);
  const [enrollPageSize, setEnrollPageSize] = useState(ENROLLMENT_PAGE_SIZES[0]);

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
  // Inscritos que aun no terminan la lectura ni tienen examen abierto: son a
  // quienes les afecta la fecha limite (al publicar o al cambiar las horas).
  const pendingReaders = enrollments.filter((item) => !item.evaluation_status && !item.reading_completed_at);
  const formatDeadline = (value: Date): string =>
    value.toLocaleString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' });

  const employeeOptions = useMemo(
    () => employees.map((employee) => ({ value: String(employee.id), label: employee.full_name, hint: employee.employee_code })),
    [employees],
  );

  const enrollTotalPages = Math.max(1, Math.ceil(enrollments.length / enrollPageSize));
  const currentEnrollPage = Math.min(enrollPage, enrollTotalPages);
  const pagedEnrollments = enrollments.slice((currentEnrollPage - 1) * enrollPageSize, currentEnrollPage * enrollPageSize);

  const phaseTabs = useMemo<ExpedientTab[]>(() => {
    if (!selectedPhase) return [];
    const readinessIssues = certReadiness ? certReadinessIssues(certReadiness).length : 0;
    const institutional = selectedPhase.scope === 'INSTITUTIONAL';
    return [
      {
        key: 'info',
        label: 'Información de la fase',
        icon: <Info size={14} />,
        attention: readinessIssues > 0 ? 'warning' : null,
      },
      {
        key: 'documents',
        label: 'Documentos obligatorios',
        icon: <FileText size={14} />,
        badge: institutional ? String(selectedPhase.documents.length) : undefined,
        attention: institutional && selectedPhase.documents.length === 0 ? 'warning' : null,
      },
      {
        key: 'checklist',
        label: 'Checklist',
        icon: <ListChecks size={14} />,
        badge: String(checklistItems.length),
      },
      {
        key: 'enrollment',
        label: 'Inscripción de colaboradores',
        icon: <GraduationCap size={14} />,
        badge: String(enrollments.length),
      },
    ];
  }, [certReadiness, checklistItems.length, enrollments.length, selectedPhase]);

  const loadEnrollments = useCallback(
    async (phaseId: number) => {
      setLoadingEnrollments(true);
      try {
        setEnrollments(await listPhaseEnrollments(phaseId));
        // Inscribir, dar de baja o capturar sucursal/puesto cambia la radiografia de la constancia.
        refreshCertReadiness(phaseId);
      } catch (error) {
        toast.error(getApiErrorMessage(error, 'No se pudieron cargar las inscripciones.'));
      } finally {
        setLoadingEnrollments(false);
      }
    },
    [refreshCertReadiness],
  );

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
    setExpandedEnrollmentId(null);
    setEnrollPage(1);
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

  const handleAddDocument = async (document: DocumentSearchResult) => {
    if (!selectedPhase) return;
    setSavingDocument(true);
    try {
      await addPhaseDocument(selectedPhase.id, document.id);
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

  const handleToggleAutoChecklist = async () => {
    if (!selectedPhase) return;
    const enabling = !selectedPhase.auto_complete_checklist_on_pass;
    const confirmed = await confirmAction(
      enabling ? 'Completar checklist al aprobar' : 'Volver al marcado manual del checklist',
      enabling
        ? `Cuando un colaborador apruebe la evaluación de la Fase ${selectedPhase.phase_number}, el sistema marcará todos los contenidos del checklist de su inscripción con la cuenta de Recursos Humanos como autora. Podrás desmarcar contenidos a mano después.`
        : `El checklist de contenidos de la Fase ${selectedPhase.phase_number} volverá a marcarse a mano inscrito por inscrito. Las marcas ya hechas se conservan.`,
      enabling ? 'Activar' : 'Desactivar',
      'primary',
    );
    if (!confirmed) return;
    setTogglingAutoChecklist(true);
    try {
      const result = await updatePhaseAutoChecklist(selectedPhase.id, enabling);
      toast.success(result.message);
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo actualizar el interruptor del checklist.'));
    } finally {
      setTogglingAutoChecklist(false);
    }
  };

  const handleTogglePublish = async () => {
    if (!selectedPhase) return;
    const publishing = !selectedPhase.published_at;
    const limitHours = selectedPhase.reading_time_limit_hours;
    const publishDescription = [
      'Los inscritos verán los documentos en Sala de Lectura y recibirán un único aviso por SMS (no hay recordatorios posteriores).',
      limitHours
        ? `Fecha límite de lectura resultante: ${formatDeadline(new Date(Date.now() + limitHours * 3_600_000))} (${limitHours} h corridas desde ahora, incluye fines de semana). Si quieres otra fecha, cancela y ajusta primero "Límite de lectura (horas)".`
        : 'Sin límite de lectura: el cuestionario se abre solo cuando el colaborador termina de leer y firmar.',
      pendingReaders.length > 0
        ? `Aplica a ${pendingReaders.length} inscrito(s) pendiente(s) de lectura.`
        : 'Todavía no hay inscritos pendientes de lectura.',
      'Requiere documentos y cuestionario publicado.',
    ].join(' ');
    const confirmed = await confirmAction(
      publishing ? `Publicar la Fase ${selectedPhase.phase_number}` : `Regresar la Fase ${selectedPhase.phase_number} a borrador`,
      publishing
        ? publishDescription
        : 'Los documentos dejarán de verse en Sala de Lectura y se retirarán las lecturas pendientes. Solo es posible si nadie ha empezado a leer ni tiene evaluación.',
      publishing ? 'Publicar fase' : 'Regresar a borrador',
      publishing ? 'primary' : 'danger',
    );
    if (!confirmed) return;
    setTogglingPublish(true);
    try {
      if (publishing) {
        const result = await publishInductionPhase(selectedPhase.id);
        toast.success(result.message || 'Fase publicada.');
      } else {
        await unpublishInductionPhase(selectedPhase.id);
        toast.success('La fase regresó a borrador.');
      }
      await load();
      await loadEnrollments(selectedPhase.id);
    } catch (error) {
      toast.error(getApiErrorMessage(error, publishing ? 'No se pudo publicar la fase.' : 'No se pudo regresar la fase a borrador.'));
    } finally {
      setTogglingPublish(false);
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
      refreshCertReadiness(selectedPhase.id);
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
    const applyToEnrolled = Boolean(selectedPhase.published_at) && applyLimitToEnrolled && pendingReaders.length > 0;
    if (applyToEnrolled) {
      const hours = trimmed ? Number(trimmed) : null;
      const confirmed = await confirmAction(
        'Aplicar el límite a los inscritos',
        hours
          ? `Se recalculará la fecha límite de ${pendingReaders.length} inscrito(s) que aún no terminan la lectura: ${hours} h corridas desde que arrancó su lectura (la publicación de la fase o su inscripción, lo que haya sido después). Si el nuevo plazo ya venció, su cuestionario se abre de inmediato.`
          : `Se quitará la fecha límite a ${pendingReaders.length} inscrito(s) que aún no terminan la lectura: su cuestionario se abrirá solo al terminar de leer.`,
        'Guardar y aplicar',
        'primary',
      );
      if (!confirmed) return;
    }
    setSavingReadingLimit(true);
    try {
      const result = await updatePhaseReadingLimit(selectedPhase.id, trimmed ? Number(trimmed) : null, applyToEnrolled);
      toast.success(result.message || 'Límite de lectura actualizado correctamente.');
      await load();
      if (applyToEnrolled) {
        await loadEnrollments(selectedPhase.id);
      }
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
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold text-[var(--color-brand-700)]">Fases de inducción</h1>
          <a
            href="/rh/induction/dashboard"
            className="inline-flex items-center gap-1.5 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)]"
          >
            Abrir Tablero de inducción (Fases 1-4)
          </a>
        </div>
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
                  <p className="flex items-center gap-2 text-xs text-[var(--unilabor-neutral)]">
                    {phase.scope === 'INSTITUTIONAL' ? `${phase.documents.length} documentos` : 'Por puesto'}
                    {phase.phase_number !== 7 ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                          phase.published_at ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {phase.published_at ? 'Publicada' : 'Borrador'}
                      </span>
                    ) : null}
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
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-[var(--color-brand-700)]">
                    Fase {selectedPhase.phase_number}: {selectedPhase.name}
                  </h2>
                  <p className="text-xs text-[var(--unilabor-neutral)]">{selectedPhase.responsible_label}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <button
                    type="button"
                    onClick={() => void handleTogglePublish()}
                    disabled={togglingPublish}
                    className={
                      selectedPhase.published_at
                        ? 'inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 disabled:opacity-60'
                        : buttonClass
                    }
                  >
                    {togglingPublish ? <Loader2 size={14} className="animate-spin" /> : selectedPhase.published_at ? <EyeOff size={14} /> : <Eye size={14} />}
                    {selectedPhase.published_at ? 'Regresar a borrador' : 'Publicar fase'}
                  </button>
                  <p className="text-[11px] text-[var(--unilabor-neutral)]">
                    {selectedPhase.published_at
                      ? `Publicada el ${new Date(selectedPhase.published_at).toLocaleDateString('es-MX', { dateStyle: 'medium' })}: los inscritos ya ven sus documentos.`
                      : 'En borrador: puedes inscribir, pero nadie ve documentos hasta publicar.'}
                  </p>
                </div>
              </div>

              <ExpedientTabs
                tabs={phaseTabs}
                active={activeTab}
                onChange={(key) => setActiveTab(key as PhaseTabKey)}
                ariaLabel="Secciones de la fase"
              />

              {activeTab === 'info' ? (
                <div className="space-y-6">
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
                        Horas corridas (incluyen fines de semana) que tiene el colaborador para leer y firmar los
                        documentos desde que recibe sus lecturas: al publicar la fase o al inscribirlo si ya está
                        publicada. Al vencer (o al terminar antes la lectura) se abre el cuestionario de la fase.
                        Vacío = sin límite. La fecha de cada inscrito se fija en ese momento y no cambia sola al
                        editar este campo.
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
                      {selectedPhase.published_at && pendingReaders.length > 0 ? (
                        <label className="mt-2 flex cursor-pointer items-start gap-2 text-xs text-[var(--unilabor-neutral)]">
                          <input
                            type="checkbox"
                            checked={applyLimitToEnrolled}
                            onChange={(event) => setApplyLimitToEnrolled(event.target.checked)}
                            className="mt-0.5"
                          />
                          <span>
                            Aplicar también a los {pendingReaders.length} inscrito(s) que aún no terminan la lectura
                            (recalcula su fecha límite desde que recibieron sus lecturas). Sin marcar, solo aplica a
                            inscripciones nuevas.
                          </span>
                        </label>
                      ) : null}
                    </div>
                  ) : null}

                  {certReadiness ? <InductionCertReadinessNotice readiness={certReadiness} /> : null}

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
                </div>
              ) : null}

              {activeTab === 'documents' ? (
                <InductionPhaseDocumentsTab
                  phase={selectedPhase}
                  saving={savingDocument}
                  onAdd={(document) => void handleAddDocument(document)}
                  onRemove={(phaseDocumentId) => void handleRemoveDocument(phaseDocumentId)}
                  onChanged={() => void load()}
                />
              ) : null}

              {activeTab === 'checklist' ? (
                <InductionPhaseChecklistTab
                  phase={selectedPhase}
                  items={checklistItems}
                  newText={newChecklistText}
                  saving={savingChecklistItem}
                  togglingAuto={togglingAutoChecklist}
                  onNewTextChange={setNewChecklistText}
                  onAdd={() => void handleAddChecklistItem()}
                  onRemove={(checklistItemId) => void handleRemoveChecklistItem(checklistItemId)}
                  onToggleAuto={() => void handleToggleAutoChecklist()}
                />
              ) : null}

              {activeTab === 'enrollment' ? (
                <div className="space-y-6">
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
                        options={employeeOptions}
                        placeholder="Buscar colaborador..."
                        emptyLabel="Sin seleccionar"
                        searchPlaceholder="Buscar por nombre o código..."
                      />
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <SearchableSelect
                            value={enrollSupervisorId}
                            onChange={setEnrollSupervisorId}
                            options={employeeOptions}
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
                    <h3 className={sectionTitleClass}>
                      <Users size={14} />
                      Inscripciones ({enrollments.length})
                    </h3>
                    {loadingEnrollments ? (
                      <p className="text-sm text-[var(--unilabor-neutral)]">Cargando...</p>
                    ) : enrollments.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-[rgba(0,65,106,0.14)] p-4 text-sm text-[var(--unilabor-neutral)]">
                        Sin colaboradores inscritos todavía.
                      </p>
                    ) : (
                      <div className="overflow-hidden rounded-xl border border-[rgba(0,65,106,0.08)]">
                        <div className="space-y-1.5 p-2">
                          {pagedEnrollments.map((item) => (
                            <InductionEnrollmentCard
                              key={item.enrollment_id}
                              item={item}
                              employeeOptions={employeeOptions}
                              editingSupervisor={editingSupervisorId === item.enrollment_id}
                              supervisorSelection={supervisorSelection}
                              expanded={expandedEnrollmentId === item.enrollment_id}
                              loadingChecklist={loadingChecklistProgress}
                              checklistProgress={checklistProgress}
                              onSupervisorSelectionChange={setSupervisorSelection}
                              onStartEditSupervisor={() => {
                                setEditingSupervisorId(item.enrollment_id);
                                setSupervisorSelection(item.supervisor_employee_id ? String(item.supervisor_employee_id) : '');
                              }}
                              onSaveSupervisor={() => void handleSaveSupervisor(item.enrollment_id)}
                              onToggleExpand={() => void handleToggleExpandEnrollment(item.enrollment_id)}
                              onToggleChecklistItem={(checklistItemId, completed) =>
                                void handleToggleChecklistProgressItem(item.enrollment_id, checklistItemId, completed)
                              }
                              onCompleteData={() => setCertDataTarget(item)}
                              onReopenReading={() => setReopenEnrollment(item)}
                              onAuthorizeRetry={() => setRetryEnrollment(item)}
                              onRemove={() => void handleRemoveEnrollment(item)}
                            />
                          ))}
                        </div>
                        <CompactListPager
                          page={currentEnrollPage}
                          pageSize={enrollPageSize}
                          total={enrollments.length}
                          pageSizeOptions={ENROLLMENT_PAGE_SIZES}
                          onPageChange={setEnrollPage}
                          sizeLabel="Inscritos por página"
                          onPageSizeChange={(size) => {
                            setEnrollPageSize(size);
                            setEnrollPage(1);
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
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
      {reopenEnrollment && selectedPhase ? (
        <InductionReopenReadingModal
          enrollment={reopenEnrollment}
          onClose={() => setReopenEnrollment(null)}
          onReopened={() => void loadEnrollments(selectedPhase.id)}
        />
      ) : null}
      {retryEnrollment && selectedPhase ? (
        <InductionRetryModal
          enrollment={retryEnrollment}
          onClose={() => setRetryEnrollment(null)}
          onAuthorized={() => void loadEnrollments(selectedPhase.id)}
        />
      ) : null}
    </div>
  );
};
