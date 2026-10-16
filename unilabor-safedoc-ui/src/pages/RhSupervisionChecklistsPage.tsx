import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ClipboardPen, Loader2, Plus, Search, Sparkles } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { listEmployees } from '../api/service.api-core';
import { listPositions } from '../api/service.api-rh-position';
import {
  createSupervisionChecklist,
  generateSupervisionDrafts,
  getSupervisionChecklist,
  listSupervisionChecklists,
  listSupervisionPending,
  type CloseSupervisionChecklistResult,
} from '../api/service.api-rh-supervision';
import { getApiErrorMessage } from '../api/service.parsers';
import { Pagination } from '../components/Pagination';
import { SearchableSelect } from '../components/SearchableSelect';
import { SupervisionChecklistEditor } from '../components/rh/supervision/SupervisionChecklistEditor';
import { SupervisionPendingTable } from '../components/rh/supervision/SupervisionPendingTable';
import { SupervisionSignatoriesPanel } from '../components/rh/supervision/SupervisionSignatoriesPanel';
import { SupervisionBatchSignPanel } from '../components/rh/supervision/SupervisionBatchSignPanel';
import { CONCLUSION_UI, buttonClass, cardClass, formatDateOnly, formatPct, inputClass, labelClass, primaryButtonClass, todayIsoDate } from '../components/rh/supervision/supervision-ui';
import type { Employee, RhPosition, SupervisionChecklist, SupervisionChecklistListRow, SupervisionChecklistStatus, SupervisionPendingRow } from '../types/models';
import { notifyError, notifyInfo, notifySuccess, notifyWarning } from '../utils/notify';

type Tab = 'pending' | 'batch' | 'records' | 'signatories';
const PAGE_SIZE = 20;

/**
 * Supervisión (ANA-REG-060): bandeja de la Fase 6 por área para aplicar la
 * lista a cada colaborador y puesto, registros (borradores y cerradas) y alta
 * libre para supervisiones de área. Enlaces directos: ?checklist=ID abre una
 * lista; ?enrollment=ID abre (o crea) la de esa inscripción de la Fase 6.
 */
export const RhSupervisionChecklistsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>('pending');
  const [pending, setPending] = useState<SupervisionPendingRow[]>([]);
  const [pendingSearch, setPendingSearch] = useState('');
  const [includePassed, setIncludePassed] = useState(false);
  const [loadingPending, setLoadingPending] = useState(true);
  const [opening, setOpening] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);

  const [rows, setRows] = useState<SupervisionChecklistListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [recordSearch, setRecordSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<SupervisionChecklistStatus | ''>('');
  const [loadingRows, setLoadingRows] = useState(false);

  const [selected, setSelected] = useState<SupervisionChecklist | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [positions, setPositions] = useState<RhPosition[]>([]);
  const [createEmployeeId, setCreateEmployeeId] = useState('');
  const [createPositionId, setCreatePositionId] = useState('');
  const [createDate, setCreateDate] = useState(todayIsoDate());
  const [creating, setCreating] = useState(false);

  const loadPending = useCallback(async () => {
    setLoadingPending(true);
    try {
      setPending(await listSupervisionPending({ q: pendingSearch.trim() || undefined, include_passed: includePassed }));
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo cargar la bandeja de la Fase 6.'));
    } finally {
      setLoadingPending(false);
    }
  }, [pendingSearch, includePassed]);

  const loadRows = useCallback(async () => {
    setLoadingRows(true);
    try {
      const result = await listSupervisionChecklists({ q: recordSearch.trim() || undefined, status: statusFilter || undefined, page, limit: PAGE_SIZE });
      setRows(result.rows);
      setTotal(result.total);
      setTotalPages(result.total_pages);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudieron cargar las listas.'));
    } finally {
      setLoadingRows(false);
    }
  }, [recordSearch, statusFilter, page]);

  useEffect(() => {
    void loadPending();
  }, [loadPending]);
  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const openDetail = useCallback(async (id: number) => {
    setLoadingDetail(true);
    try {
      setSelected(await getSupervisionChecklist(id));
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo abrir la lista.'));
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const openForEnrollment = useCallback(async (enrollmentId: number, draftId: number | null) => {
    setOpening(enrollmentId);
    try {
      if (draftId) {
        await openDetail(draftId);
        return;
      }
      const created = await createSupervisionChecklist({ enrollment_id: enrollmentId, supervision_date: todayIsoDate(), reuse_draft: true });
      setSelected(created);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo abrir la lista de la inscripción.'));
    } finally {
      setOpening(null);
    }
  }, [openDetail]);

  // Enlaces directos.
  const linkedChecklist = Number(searchParams.get('checklist')) || null;
  const linkedEnrollment = Number(searchParams.get('enrollment')) || null;
  useEffect(() => {
    if (!linkedChecklist && !linkedEnrollment) return;
    if (linkedChecklist) void openDetail(linkedChecklist);
    else if (linkedEnrollment) void openForEnrollment(linkedEnrollment, null);
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedChecklist, linkedEnrollment]);

  useEffect(() => {
    if (!showCreate || employees.length > 0) return;
    Promise.all([listEmployees(), listPositions()])
      .then(([employeeData, positionData]) => {
        setEmployees(employeeData.filter((employee) => employee.is_active));
        setPositions(positionData);
      })
      .catch((error) => notifyError(getApiErrorMessage(error, 'No se pudieron cargar colaboradores y puestos.')));
  }, [showCreate, employees.length]);

  const refreshLists = () => {
    void loadPending();
    void loadRows();
  };

  const handleCreate = async () => {
    if (!createEmployeeId || !createPositionId) {
      notifyWarning('Selecciona colaborador y puesto.');
      return;
    }
    setCreating(true);
    try {
      const created = await createSupervisionChecklist({
        employee_id: Number(createEmployeeId),
        position_id: Number(createPositionId),
        supervision_date: createDate,
        reuse_draft: true,
      });
      setShowCreate(false);
      setSelected(created);
      refreshLists();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo abrir la lista.'));
    } finally {
      setCreating(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { message, result } = await generateSupervisionDrafts();
      if (result.created > 0) notifySuccess(message);
      else notifyInfo(message);
      if (result.areas_without_signatories.length > 0) {
        notifyWarning(`Áreas sin firmantes configurados: ${result.areas_without_signatories.join(', ')}. Los borradores se abrieron con los nombres vacíos.`);
      }
      refreshLists();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudieron generar los borradores.'));
    } finally {
      setGenerating(false);
    }
  };

  const handleClosed = (result: CloseSupervisionChecklistResult) => {
    setSelected(result.checklist);
    if (result.practical && !result.practical.captured) notifyWarning(result.message);
    else notifySuccess(result.message);
    refreshLists();
  };

  if (selected || loadingDetail) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => { setSelected(null); refreshLists(); }} className={buttonClass}>
          <ArrowLeft size={14} /> Volver
        </button>
        {loadingDetail || !selected ? (
          <p className="inline-flex items-center gap-2 text-sm text-[var(--unilabor-neutral)]">
            <Loader2 size={14} className="animate-spin" /> Abriendo lista…
          </p>
        ) : (
          <div className={cardClass}>
            <SupervisionChecklistEditor
              key={selected.id}
              checklist={selected}
              onChanged={setSelected}
              onClosed={handleClosed}
              onDeleted={() => { setSelected(null); refreshLists(); }}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-500)]">Recursos Humanos · Inducción Fase 6</p>
          <h1 className="text-2xl font-bold text-[var(--color-brand-700)]">Supervisión (ANA-REG-060)</h1>
          <p className="max-w-3xl text-sm leading-6 text-[var(--unilabor-ink)]">
            Lista de verificación de Supervisión por colaborador y puesto. Ligada a la Fase 6, su porcentaje (≥ 80 %) acredita la fase, emite la
            constancia y abre el siguiente puesto o la Fase 7. El PDF se archiva en el expediente con el diseño del formato controlado.
          </p>
        </div>
        <button type="button" onClick={() => setShowCreate((value) => !value)} className={primaryButtonClass}>
          <Plus size={14} /> Supervisión de área
        </button>
      </header>

      {showCreate ? (
        <section className={`${cardClass} grid gap-3 md:grid-cols-4`}>
          <div>
            <label className={labelClass}>Colaborador</label>
            <SearchableSelect
              value={createEmployeeId}
              onChange={setCreateEmployeeId}
              options={employees.map((employee) => ({ value: String(employee.id), label: `${employee.full_name} (${employee.employee_code})` }))}
              placeholder="Buscar colaborador"
            />
          </div>
          <div>
            <label className={labelClass}>Puesto</label>
            <SearchableSelect
              value={createPositionId}
              onChange={setCreatePositionId}
              options={positions.map((position) => ({ value: String(position.id), label: `${position.code} – ${position.name}` }))}
              placeholder="Buscar puesto"
            />
          </div>
          <div>
            <label className={labelClass}>Fecha</label>
            <input type="date" value={createDate} max={todayIsoDate()} onChange={(e) => setCreateDate(e.target.value)} className={inputClass} />
          </div>
          <div className="flex items-end gap-2">
            <button type="button" onClick={handleCreate} disabled={creating} className={primaryButtonClass}>
              {creating ? <Loader2 size={14} className="animate-spin" /> : <ClipboardPen size={14} />} Abrir lista
            </button>
            <button type="button" onClick={() => setShowCreate(false)} className={buttonClass}>
              Cancelar
            </button>
          </div>
          <p className="md:col-span-4 text-xs text-[var(--unilabor-neutral)]">
            Si el colaborador tiene la Fase 6 de ese puesto en curso, la lista se liga sola a su inscripción.
          </p>
        </section>
      ) : null}

      <div className="inline-flex overflow-hidden rounded-xl border border-[rgba(0,65,106,0.14)] bg-white">
        {(
          [
            ['pending', `Pendientes Fase 6 (${pending.length})`],
            ['batch', 'Firmar por área'],
            ['records', `Registros (${total})`],
            ['signatories', 'Firmantes por área'],
          ] as Array<[Tab, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-semibold ${tab === key ? 'bg-[var(--color-brand-700)] text-white' : 'text-[var(--unilabor-neutral)] hover:bg-[rgba(191,212,230,0.3)]'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'signatories' ? (
        <section className={cardClass}>
          <SupervisionSignatoriesPanel />
        </section>
      ) : tab === 'batch' ? (
        <section className={cardClass}>
          <SupervisionBatchSignPanel key={tab} />
        </section>
      ) : tab === 'pending' ? (
        <section className={`${cardClass} space-y-4`}>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[260px] flex-1">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--unilabor-neutral)]" />
              <input value={pendingSearch} onChange={(e) => setPendingSearch(e.target.value)} placeholder="Buscar por colaborador, puesto o área" className={`${inputClass} pl-9`} />
            </div>
            <label className="inline-flex items-center gap-2 text-xs text-[var(--unilabor-ink)]">
              <input type="checkbox" checked={includePassed} onChange={(e) => setIncludePassed(e.target.checked)} /> Incluir acreditadas (correcciones)
            </label>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating}
              className={buttonClass}
              title="Abre un borrador por cada inscripción activa de Fase 6 que aún no tenga lista, con el puesto, los N/A del puesto y los firmantes del área. También corre solo cada 10 minutos."
            >
              {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Generar borradores
            </button>
          </div>
          <SupervisionPendingTable rows={pending} loading={loadingPending} openingEnrollmentId={opening} onOpen={(row) => void openForEnrollment(row.enrollment_id, row.draft_checklist_id)} />
        </section>
      ) : (
        <section className={`${cardClass} space-y-4`}>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[260px] flex-1">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--unilabor-neutral)]" />
              <input value={recordSearch} onChange={(e) => { setRecordSearch(e.target.value); setPage(1); }} placeholder="Buscar por folio, colaborador, puesto o área" className={`${inputClass} pl-9`} />
            </div>
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as SupervisionChecklistStatus | ''); setPage(1); }} className={`${inputClass} w-auto`}>
              <option value="">Todas</option>
              <option value="DRAFT">Borradores</option>
              <option value="CLOSED">Cerradas</option>
            </select>
          </div>
          {loadingRows ? (
            <p className="inline-flex items-center gap-2 text-sm text-[var(--unilabor-neutral)]">
              <Loader2 size={14} className="animate-spin" /> Cargando…
            </p>
          ) : rows.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[rgba(0,65,106,0.14)] p-6 text-center text-sm text-[var(--unilabor-neutral)]">Sin listas registradas.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="text-[11px] uppercase text-[var(--unilabor-neutral)]">
                <tr>
                  <th className="px-3 py-2">Folio</th>
                  <th className="px-3 py-2">Colaborador</th>
                  <th className="px-3 py-2">Puesto</th>
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2">Cumplimiento</th>
                  <th className="px-3 py-2">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(0,65,106,0.08)]">
                {rows.map((row) => {
                  const conclusion = row.conclusion ? CONCLUSION_UI[row.conclusion] : null;
                  return (
                    <tr key={row.id} onClick={() => void openDetail(row.id)} className="cursor-pointer hover:bg-[rgba(248,251,253,0.9)]">
                      <td className="px-3 py-2 font-semibold text-[var(--color-brand-700)]">
                        {row.folio}
                        {row.enrollment_id ? <span className="ml-1 text-[10px] font-semibold text-[var(--unilabor-neutral)]">F6{row.is_final ? ' · final' : ''}</span> : null}
                      </td>
                      <td className="px-3 py-2">
                        <p className="font-semibold text-[var(--unilabor-ink)]">{row.employee_name}</p>
                        <p className="text-[11px] text-[var(--unilabor-neutral)]">{row.area_name ?? '—'}</p>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <span className="font-semibold text-[var(--color-brand-700)]">{row.position_code}</span> · {row.position_name}
                      </td>
                      <td className="px-3 py-2 text-xs">{formatDateOnly(row.supervision_date)}</td>
                      <td className="px-3 py-2 text-xs">
                        {row.status === 'CLOSED' ? (
                          <span className="inline-flex items-center gap-2">
                            {formatPct(row.compliance_pct)}
                            {conclusion ? <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${conclusion.className}`}>{conclusion.label}</span> : null}
                          </span>
                        ) : (
                          <span className="text-[var(--unilabor-neutral)]">{row.items_pending} sin calificar</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {row.status === 'CLOSED' ? (
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700">Cerrada</span>
                        ) : (
                          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-bold text-amber-700">Borrador</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <Pagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} loading={loadingRows} />
        </section>
      )}
    </div>
  );
};
