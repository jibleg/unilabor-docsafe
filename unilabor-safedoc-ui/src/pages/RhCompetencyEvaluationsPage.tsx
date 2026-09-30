import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ClipboardCheck, Loader2, Plus, Search, ShieldCheck, Trash2 } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { listEmployees } from '../api/service';
import { listPositions } from '../api/service.api-rh-position';
import {
  createCompetencyEvaluation,
  deleteCompetencyEvaluationDraft,
  getCompetencyEvaluation,
  listCompetencyEvaluations,
} from '../api/service.api-rh-competency';
import { getApiErrorMessage } from '../api/service.parsers';
import { SearchableSelect } from '../components/SearchableSelect';
import { CompetencyEvaluationEditor } from '../components/rh/CompetencyEvaluationEditor';
import { AUTHORIZATION_UI, DICTAMEN_UI, formatDateOnly } from '../utils/competency';
import { useHasPermission } from '../utils/permissions';
import type { Employee, RhCompetencyEvaluation, RhCompetencyEvaluationType, RhPosition } from '../types/models';

const cardClass = 'rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/90 p-5 shadow-xl shadow-[rgba(0,65,106,0.08)]';
const inputClass =
  'w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2 text-sm text-[var(--unilabor-ink)] outline-none focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]';
const labelClass = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]';
const buttonClass =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:cursor-not-allowed disabled:opacity-50';

const TYPE_LABELS: Record<RhCompetencyEvaluationType, string> = {
  INICIAL: 'Inicial (Fase 7 de Inducción)',
  PERIODICA: 'Periódica (anual)',
  REEVALUACION: 'Reevaluación',
  CAMBIO_PUESTO: 'Cambio de puesto',
  POST_CAPACITACION: 'Posterior a capacitación (eficacia)',
};

const todayIso = (): string => new Date().toISOString().slice(0, 10);

export const RhCompetencyEvaluationsPage = () => {
  const [evaluations, setEvaluations] = useState<RhCompetencyEvaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState<RhCompetencyEvaluation | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  // Acceso directo a la autorizacion (RH / Direccion General): panel de pendientes,
  // boton por fila, filtro dedicado y enlace ?evaluation=ID&authorize=1.
  const canAuthorize = useHasPermission('RH.COMPETENCY.AUTHORIZE');
  const [pendingAuthorization, setPendingAuthorization] = useState<RhCompetencyEvaluation[]>([]);
  const [autoAuthorize, setAutoAuthorize] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [positions, setPositions] = useState<RhPosition[]>([]);

  const [showCreate, setShowCreate] = useState(false);
  const [createEmployeeId, setCreateEmployeeId] = useState('');
  const [createPositionId, setCreatePositionId] = useState('');
  const [createType, setCreateType] = useState<RhCompetencyEvaluationType>('INICIAL');
  const [createDate, setCreateDate] = useState(todayIso());
  const [createEvaluator, setCreateEvaluator] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const pendingOnly = statusFilter === 'PENDING_AUTH';
      const result = await listCompetencyEvaluations({
        search: search.trim() || undefined,
        status: pendingOnly ? 'CLOSED' : statusFilter || undefined,
        ...(pendingOnly ? { limit: 100 } : {}),
      });
      setEvaluations(pendingOnly ? result.data.filter((item) => item.results.authorization_result === 'PENDIENTE') : result.data);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudieron cargar las evaluaciones.'));
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadPendingAuthorization = useCallback(async () => {
    try {
      const result = await listCompetencyEvaluations({ status: 'CLOSED', limit: 100 });
      setPendingAuthorization(result.data.filter((item) => item.results.authorization_result === 'PENDIENTE'));
    } catch {
      // Panel informativo: si falla, simplemente no se muestra.
    }
  }, []);

  useEffect(() => {
    void loadPendingAuthorization();
  }, [loadPendingAuthorization]);

  useEffect(() => {
    Promise.all([listEmployees(), listPositions()])
      .then(([employeeData, positionData]) => {
        setEmployees(employeeData);
        setPositions(positionData);
      })
      .catch((error) => toast.error(getApiErrorMessage(error, 'No se pudieron cargar colaboradores/puestos.')));
  }, []);

  const openDetail = async (evaluationId: number, options: { authorize?: boolean } = {}) => {
    setLoadingDetail(true);
    try {
      const detail = await getCompetencyEvaluation(evaluationId);
      setAutoAuthorize(Boolean(options.authorize));
      setSelected(detail);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo abrir la evaluación.'));
    } finally {
      setLoadingDetail(false);
    }
  };

  // Enlace directo: /rh/competency-evaluations?evaluation=ID[&authorize=1]
  const linkedEvaluationId = Number(searchParams.get('evaluation')) || null;
  const linkedAuthorize = searchParams.get('authorize') === '1';
  useEffect(() => {
    if (!linkedEvaluationId) return;
    void openDetail(linkedEvaluationId, { authorize: linkedAuthorize });
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedEvaluationId, linkedAuthorize]);

  const handleChanged = (updated: RhCompetencyEvaluation) => {
    setSelected(updated);
    void loadPendingAuthorization();
    void load();
  };

  const handleCreate = async () => {
    if (!createEmployeeId || !createPositionId || !createEvaluator.trim() || !createDate) {
      toast.warning('Colaborador, puesto, fecha y evaluador son obligatorios.');
      return;
    }
    setCreating(true);
    try {
      const created = await createCompetencyEvaluation({
        employee_id: Number(createEmployeeId),
        position_id: Number(createPositionId),
        evaluation_type: createType,
        evaluation_date: createDate,
        evaluator_name: createEvaluator.trim(),
      });
      toast.success('Evaluación creada; las competencias del puesto y los criterios de desempeño quedaron precargados.');
      setShowCreate(false);
      setCreateEmployeeId('');
      setCreatePositionId('');
      setCreateEvaluator('');
      setCreateType('INICIAL');
      setCreateDate(todayIso());
      await load();
      setSelected(created);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo crear la evaluación.'));
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteDraft = async (evaluation: RhCompetencyEvaluation) => {
    try {
      await deleteCompetencyEvaluationDraft(evaluation.id);
      toast.success('Borrador eliminado.');
      if (selected?.id === evaluation.id) {
        setSelected(null);
      }
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo eliminar el borrador.'));
    }
  };

  if (selected) {
    return (
      <div className="space-y-4">
        <div className={cardClass}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setSelected(null);
                  void load();
                }}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[rgba(0,65,106,0.1)] text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
                aria-label="Volver"
              >
                <ArrowLeft size={16} />
              </button>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                  Evaluación de competencia — REH-REG-003
                </p>
                <h2 className="text-lg font-bold text-[var(--color-brand-700)]">
                  {selected.employee_name} · {selected.position_name}
                </h2>
                <p className="text-xs text-[var(--unilabor-neutral)]">
                  {TYPE_LABELS[selected.evaluation_type]} · {formatDateOnly(selected.evaluation_date)} ·
                  Evaluador: {selected.evaluator_name}
                </p>
              </div>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                selected.status === 'CLOSED' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
              }`}
            >
              {selected.status === 'CLOSED' ? 'Cerrada' : 'Borrador'}
            </span>
          </div>
        </div>
        <CompetencyEvaluationEditor key={`${selected.id}-${autoAuthorize ? 'auth' : 'view'}`} evaluation={selected} onChanged={handleChanged} autoOpenAuthorize={autoAuthorize} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-[var(--color-brand-700)]">
              <ClipboardCheck size={20} />
              Evaluación de competencia
            </h1>
            <p className="text-xs text-[var(--unilabor-neutral)]">
              REH-REG-003 · Instrumento de la Fase 7 de Inducción y de la reevaluación anual (vigencia 12 meses).
            </p>
          </div>
          <button type="button" onClick={() => setShowCreate(true)} className={buttonClass}>
            <Plus size={14} /> Nueva evaluación
          </button>
        </div>

        {pendingAuthorization.length > 0 ? (
          <div className="relative mt-4 overflow-hidden rounded-2xl bg-gradient-to-r from-[var(--color-brand-700)] to-[var(--color-brand-500)] p-5 text-white shadow-xl shadow-[rgba(0,65,106,0.25)]">
            <div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-white/10" />
            <div className="pointer-events-none absolute -bottom-20 right-28 h-40 w-40 rounded-full bg-white/5" />
            <div className="relative flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white text-[var(--color-brand-700)] shadow-lg">
                  <ShieldCheck size={28} />
                  <span className="absolute -right-2 -top-2 inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-full bg-amber-400 px-1.5 text-xs font-black text-[var(--color-brand-900)] ring-4 ring-[var(--color-brand-700)]">
                    {pendingAuthorization.length}
                  </span>
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--color-brand-100)]">Autorización pendiente</p>
                  <p className="text-lg font-bold leading-tight">
                    {pendingAuthorization.length === 1
                      ? '1 evaluación de competencia espera tu autorización'
                      : `${pendingAuthorization.length} evaluaciones de competencia esperan autorización`}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--color-brand-100)]">
                    El dictamen ya está sellado.{' '}
                    {canAuthorize
                      ? 'Registra aquí la decisión de RH o Dirección General: vigencia y constancia nacen al autorizar.'
                      : 'La decisión la registra RH o Dirección General (tu cuenta no tiene ese permiso).'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setStatusFilter(statusFilter === 'PENDING_AUTH' ? '' : 'PENDING_AUTH')}
                className="inline-flex items-center gap-2 rounded-xl border border-white/40 bg-white/15 px-4 py-2 text-sm font-bold text-white backdrop-blur transition hover:bg-white/25"
              >
                <ClipboardCheck size={15} />
                {statusFilter === 'PENDING_AUTH' ? 'Ver todas las evaluaciones' : 'Ver solo pendientes'}
              </button>
            </div>
            <div className="relative mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {pendingAuthorization.slice(0, 6).map((item) => {
                const dictamenUi = item.results.dictamen ? DICTAMEN_UI[item.results.dictamen] : null;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => void openDetail(item.id, { authorize: canAuthorize })}
                    className="group flex items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 text-left shadow-md transition hover:-translate-y-0.5 hover:shadow-xl"
                    title={canAuthorize ? 'Abrir y autorizar' : 'Abrir la evaluación'}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-[var(--color-brand-700)]">{item.employee_name}</span>
                      <span className="block truncate text-xs text-[var(--unilabor-neutral)]">{item.position_name}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                        <span className="font-bold text-[var(--color-brand-700)]">{item.results.final_pct ?? '—'}%</span>
                        {dictamenUi ? <span className={`rounded-full px-2 py-0.5 font-semibold ${dictamenUi.className}`}>{dictamenUi.label}</span> : null}
                      </span>
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-amber-400 px-3 py-2 text-xs font-black text-[var(--color-brand-900)] shadow transition group-hover:bg-amber-300">
                      <ShieldCheck size={14} />
                      {canAuthorize ? 'Autorizar' : 'Abrir'}
                    </span>
                  </button>
                );
              })}
            </div>
            {pendingAuthorization.length > 6 ? (
              <p className="relative mt-2 text-xs text-[var(--color-brand-100)]">
                y {pendingAuthorization.length - 6} más: usa "Ver solo pendientes" para verlas todas.
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_200px]">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--unilabor-neutral)]" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por colaborador, código o puesto..."
              className={`${inputClass} pl-8`}
            />
          </div>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className={inputClass}>
            <option value="">Todos los estados</option>
            <option value="DRAFT">Borradores</option>
            <option value="CLOSED">Cerradas</option>
            <option value="PENDING_AUTH">Pendientes de autorización</option>
          </select>
        </div>

        {loading || loadingDetail ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-[var(--unilabor-neutral)]">
            <Loader2 size={15} className="animate-spin" /> Cargando...
          </p>
        ) : evaluations.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-[rgba(0,65,106,0.14)] p-6 text-center text-sm text-[var(--unilabor-neutral)]">
            Sin evaluaciones todavía. Crea la primera con "Nueva evaluación".
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[var(--unilabor-neutral)]">
                  <th className="pb-2 pr-2 font-semibold">Colaborador</th>
                  <th className="pb-2 pr-2 font-semibold">Puesto</th>
                  <th className="pb-2 pr-2 font-semibold">Tipo</th>
                  <th className="pb-2 pr-2 font-semibold">Fecha</th>
                  <th className="pb-2 pr-2 font-semibold">Resultado</th>
                  <th className="pb-2 pr-2 font-semibold">Vigencia</th>
                  <th className="pb-2 font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody>
                {evaluations.map((evaluation) => {
                  const dictamenUi = evaluation.results.dictamen ? DICTAMEN_UI[evaluation.results.dictamen] : null;
                  return (
                    <tr
                      key={evaluation.id}
                      onClick={() => void openDetail(evaluation.id)}
                      className="cursor-pointer border-t border-[rgba(0,65,106,0.06)] align-top transition hover:bg-[rgba(239,245,250,0.7)]"
                    >
                      <td className="py-2 pr-2">
                        <p className="font-bold text-[var(--color-brand-700)]">{evaluation.employee_name}</p>
                        <p className="text-[var(--unilabor-neutral)]">{evaluation.employee_code}</p>
                      </td>
                      <td className="py-2 pr-2 text-[var(--unilabor-neutral)]">{evaluation.position_name}</td>
                      <td className="py-2 pr-2 text-[var(--unilabor-neutral)]">{TYPE_LABELS[evaluation.evaluation_type]}</td>
                      <td className="py-2 pr-2 text-[var(--unilabor-neutral)]">
                        {formatDateOnly(evaluation.evaluation_date)}
                      </td>
                      <td className="py-2 pr-2">
                        {evaluation.results.final_pct !== null ? (
                          <>
                            <p className="font-bold text-[var(--color-brand-700)]">{evaluation.results.final_pct}%</p>
                            {dictamenUi && (
                              <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${dictamenUi.className}`}>
                                {dictamenUi.label}
                              </span>
                            )}
                            {evaluation.status === 'CLOSED' && evaluation.results.authorization_result && AUTHORIZATION_UI[evaluation.results.authorization_result] ? (
                              <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${AUTHORIZATION_UI[evaluation.results.authorization_result]?.className ?? ''}`}>
                                {AUTHORIZATION_UI[evaluation.results.authorization_result]?.label}
                              </span>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-[var(--unilabor-neutral)]">—</span>
                        )}
                      </td>
                      <td className="py-2 pr-2 text-[var(--unilabor-neutral)]">
                        {formatDateOnly(evaluation.valid_until)}
                      </td>
                      <td className="py-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded-full px-2 py-0.5 font-semibold ${
                              evaluation.status === 'CLOSED' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                            }`}
                          >
                            {evaluation.status === 'CLOSED' ? 'Cerrada' : 'Borrador'}
                          </span>
                          {evaluation.status === 'CLOSED' && evaluation.results.authorization_result === 'PENDIENTE' && canAuthorize ? (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                void openDetail(evaluation.id, { authorize: true });
                              }}
                              className="inline-flex items-center gap-1 rounded-lg bg-[var(--color-brand-700)] px-2 py-1 text-[11px] font-bold text-white transition hover:opacity-90"
                              title="Registrar la autorización de RH / Dirección General"
                            >
                              <ShieldCheck size={12} /> Autorizar
                            </button>
                          ) : null}
                          {evaluation.status === 'DRAFT' && (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleDeleteDraft(evaluation);
                              }}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[rgba(220,38,38,0.2)] text-red-600 transition hover:bg-red-50"
                              aria-label="Eliminar borrador"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(11,34,53,0.28)] p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg space-y-4 rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/96 p-5 shadow-2xl">
            <h2 className="text-lg font-bold text-[var(--color-brand-700)]">Nueva evaluación de competencia</h2>
            <div>
              <label className={labelClass}>Colaborador</label>
              <SearchableSelect
                value={createEmployeeId}
                onChange={setCreateEmployeeId}
                options={employees.map((employee) => ({
                  value: String(employee.id),
                  label: employee.full_name,
                  hint: employee.employee_code,
                }))}
                placeholder="Selecciona un colaborador"
                searchPlaceholder="Buscar colaborador..."
              />
            </div>
            <div>
              <label className={labelClass}>Puesto (sus competencias se precargan)</label>
              <SearchableSelect
                value={createPositionId}
                onChange={setCreatePositionId}
                options={positions.map((position) => ({ value: String(position.id), label: position.name, hint: position.code }))}
                placeholder="Selecciona el puesto de referencia"
                searchPlaceholder="Buscar puesto..."
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Tipo de evaluación</label>
                <select value={createType} onChange={(event) => setCreateType(event.target.value as RhCompetencyEvaluationType)} className={inputClass}>
                  {(Object.keys(TYPE_LABELS) as RhCompetencyEvaluationType[]).map((key) => (
                    <option key={key} value={key}>{TYPE_LABELS[key]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Fecha de evaluación</label>
                <input type="date" value={createDate} onChange={(event) => setCreateDate(event.target.value)} className={inputClass} />
              </div>
            </div>
            <div>
              <label className={labelClass}>Tutor asignado / evaluador</label>
              <input value={createEvaluator} onChange={(event) => setCreateEvaluator(event.target.value)} placeholder="Nombre del evaluador técnico" className={inputClass} />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowCreate(false)} disabled={creating} className="rounded-xl border border-[rgba(0,65,106,0.12)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)] disabled:opacity-50">
                Cancelar
              </button>
              <button type="button" onClick={() => void handleCreate()} disabled={creating} className={buttonClass}>
                {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Crear evaluación
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RhCompetencyEvaluationsPage;
