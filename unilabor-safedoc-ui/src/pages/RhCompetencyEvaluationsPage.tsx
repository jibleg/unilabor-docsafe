import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ClipboardCheck, Loader2, Plus, Search, Trash2 } from 'lucide-react';
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
import { DICTAMEN_UI, formatDateOnly } from '../utils/competency';
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
      const result = await listCompetencyEvaluations({
        search: search.trim() || undefined,
        status: statusFilter || undefined,
      });
      setEvaluations(result.data);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudieron cargar las evaluaciones.'));
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    Promise.all([listEmployees(), listPositions()])
      .then(([employeeData, positionData]) => {
        setEmployees(employeeData);
        setPositions(positionData);
      })
      .catch((error) => toast.error(getApiErrorMessage(error, 'No se pudieron cargar colaboradores/puestos.')));
  }, []);

  const openDetail = async (evaluationId: number) => {
    setLoadingDetail(true);
    try {
      const detail = await getCompetencyEvaluation(evaluationId);
      setSelected(detail);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo abrir la evaluación.'));
    } finally {
      setLoadingDetail(false);
    }
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
        <CompetencyEvaluationEditor evaluation={selected} onChanged={setSelected} />
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
