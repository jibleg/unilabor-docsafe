import { useMemo, useState } from 'react';
import { ArrowDownUp, Building2, FileText, LayoutGrid, PenLine, Rows3, ShieldCheck, Users } from 'lucide-react';
import { CompactListPager } from '../../CompactListPager';
import type { CompetencyDashboardEmployee, CompetencyDashboardEvaluation } from '../../../types/competencyDashboard';
import { formatDateOnly } from '../../../utils/competency';
import { SECTION_META, STANDING_META, STANDING_ORDER, initials, scoreColor } from '../../../utils/competencyDashboard';

type SortKey = 'urgency' | 'name' | 'score' | 'expiry';
type ViewMode = 'cards' | 'table';

const SORTS: Record<SortKey, string> = {
  urgency: 'Prioridad de atención',
  name: 'Nombre',
  score: 'Calificación final',
  expiry: 'Próximo vencimiento',
};

interface CompetencyCollaboratorsProps {
  employees: CompetencyDashboardEmployee[];
  evaluationsById: Map<number, CompetencyDashboardEvaluation>;
  onOpen: (employee: CompetencyDashboardEmployee) => void;
}

const ScoreRing = ({ value, size = 52 }: { value: number | null; size?: number }) => {
  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-label={value !== null ? `Final ${value}%` : 'Sin calificación'}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(0,65,106,0.08)" strokeWidth="5" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={scoreColor(value)}
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - (value ?? 0) / 100)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset .8s ease' }}
      />
      <text x="50%" y="54%" textAnchor="middle" className="fill-[var(--color-brand-700)] text-[12px] font-black">
        {value !== null ? Math.round(value) : '—'}
      </text>
    </svg>
  );
};

export const StandingBadge = ({ standing }: { standing: CompetencyDashboardEmployee['standing'] }) => {
  const meta = STANDING_META[standing];
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${meta.soft} ${meta.text}`}>
      <Icon size={12} /> {meta.label}
    </span>
  );
};

/** Puestos del colaborador; con varios, cada uno con el color de su estado de competencia. */
const PositionNames = ({ employee }: { employee: CompetencyDashboardEmployee }) => {
  const standings = employee.position_standings ?? [];
  if (standings.length <= 1) {
    return <>{employee.positions.map((position) => position.name).join(' · ')}</>;
  }
  return (
    <span className="inline-flex flex-wrap gap-x-2 gap-y-0.5">
      {standings.map((item) => (
        <span key={item.position_id} className="inline-flex items-center gap-1" title={`${item.position_name}: ${STANDING_META[item.standing].label}`}>
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: STANDING_META[item.standing].color }} />
          {item.position_name}
        </span>
      ))}
    </span>
  );
};

const expiryText = (employee: CompetencyDashboardEmployee): string | null => {
  if (employee.days_to_expiry === null || !employee.valid_until) return null;
  if (employee.days_to_expiry < 0) return `Venció hace ${Math.abs(employee.days_to_expiry)} d`;
  return `Vence en ${employee.days_to_expiry} d`;
};

const CollaboratorCard = ({ employee, evaluation, onOpen, delay }: { employee: CompetencyDashboardEmployee; evaluation: CompetencyDashboardEvaluation | null; onOpen: () => void; delay: number }) => {
  const meta = STANDING_META[employee.standing];
  const progress = evaluation && evaluation.status === 'DRAFT' && evaluation.items_total > 0 ? Math.round((evaluation.items_scored / evaluation.items_total) * 100) : null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/95 p-4 text-left shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-[rgba(0,65,106,0.12)]"
      style={{ animation: `agr-pop .4s ease ${delay}ms both` }}
    >
      <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: meta.color }} />
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-sm font-black text-white shadow-md" style={{ background: `linear-gradient(135deg, ${meta.color}, #00416a)` }}>
          {initials(employee.full_name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-[var(--color-brand-700)] group-hover:underline">{employee.full_name}</p>
          <p className="truncate text-[11px] text-[var(--unilabor-neutral)]">
            {employee.employee_code}
            {employee.branch_name ? ` · ${employee.branch_name}` : ''}
          </p>
          <div className="mt-1.5">
            <StandingBadge standing={employee.standing} />
          </div>
        </div>
        <ScoreRing value={evaluation?.final_pct ?? null} />
      </div>
      <p className="line-clamp-2 min-h-[2rem] text-[11px] text-[var(--unilabor-ink)]">
        {employee.positions.length > 0 ? (
          <PositionNames employee={employee} />
        ) : (
          <span className="italic text-[var(--unilabor-neutral)]">Sin puesto activo</span>
        )}
      </p>
      {evaluation && evaluation.status === 'CLOSED' ? (
        <div className="grid grid-cols-3 gap-2">
          {SECTION_META.map((section) => (
            <div key={section.key} title={`${section.label}: ${evaluation[section.key] ?? '—'}%`}>
              <div className="h-1.5 overflow-hidden rounded-full bg-[rgba(0,65,106,0.08)]">
                <span className="block h-full rounded-full" style={{ width: `${evaluation[section.key] ?? 0}%`, backgroundColor: section.color }} />
              </div>
              <p className="mt-0.5 truncate text-[10px] text-[var(--unilabor-neutral)]">{section.label.split(' ')[0]}</p>
            </div>
          ))}
        </div>
      ) : progress !== null ? (
        <div>
          <div className="flex justify-between text-[10px] text-[var(--unilabor-neutral)]">
            <span>Avance de captura</span>
            <span className="font-bold">{progress}%</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[rgba(0,65,106,0.08)]">
            <span className="block h-full rounded-full bg-sky-500" style={{ width: `${progress}%` }} />
          </div>
        </div>
      ) : (
        <div className="h-[26px]" />
      )}
      <div className="flex flex-wrap items-center gap-1.5 border-t border-[rgba(0,65,106,0.06)] pt-2 text-[10px] font-semibold">
        <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(191,212,230,0.4)] px-2 py-0.5 text-[var(--color-brand-700)]">
          <FileText size={11} /> {employee.evaluations_count} eval.
        </span>
        {evaluation?.certificate_document_id ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">
            <ShieldCheck size={11} /> Constancia
          </span>
        ) : null}
        {employee.has_draft && employee.standing !== 'EN_CAPTURA' ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-sky-700">
            <PenLine size={11} /> Reevaluación en curso
          </span>
        ) : null}
        {expiryText(employee) ? <span className={`ml-auto ${meta.text}`}>{expiryText(employee)}</span> : null}
      </div>
    </button>
  );
};

const urgencyRank = (employee: CompetencyDashboardEmployee): number => STANDING_ORDER.indexOf(employee.standing);

export const CompetencyCollaborators = ({ employees, evaluationsById, onOpen }: CompetencyCollaboratorsProps) => {
  const [sort, setSort] = useState<SortKey>('urgency');
  const [view, setView] = useState<ViewMode>('cards');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);

  const current = (employee: CompetencyDashboardEmployee) =>
    employee.current_evaluation_id ? evaluationsById.get(employee.current_evaluation_id) ?? null : null;

  const sorted = useMemo(() => {
    const list = [...employees];
    const byName = (a: CompetencyDashboardEmployee, b: CompetencyDashboardEmployee) => a.full_name.localeCompare(b.full_name, 'es');
    const score = (employee: CompetencyDashboardEmployee) =>
      (employee.current_evaluation_id ? evaluationsById.get(employee.current_evaluation_id)?.final_pct : null) ?? -1;
    if (sort === 'name') list.sort(byName);
    if (sort === 'urgency') list.sort((a, b) => urgencyRank(a) - urgencyRank(b) || (a.days_to_expiry ?? 9999) - (b.days_to_expiry ?? 9999) || byName(a, b));
    if (sort === 'score') list.sort((a, b) => score(b) - score(a) || byName(a, b));
    if (sort === 'expiry') list.sort((a, b) => (a.days_to_expiry ?? 99999) - (b.days_to_expiry ?? 99999) || byName(a, b));
    return list;
  }, [employees, sort, evaluationsById]);

  // Al cambiar el conjunto filtrado se vuelve a la primera página (ajuste durante el render).
  const [lastEmployees, setLastEmployees] = useState(employees);
  if (lastEmployees !== employees) {
    setLastEmployees(employees);
    setPage(1);
  }
  const visible = sorted.slice((page - 1) * pageSize, page * pageSize);

  return (
    <section className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/90 p-5 shadow-xl shadow-[rgba(0,65,106,0.08)]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="inline-flex items-center gap-2 text-sm font-bold text-[var(--color-brand-700)]">
          <Users size={16} /> Colaboradores
          <span className="rounded-full bg-[rgba(191,212,230,0.5)] px-2 py-0.5 text-[11px] tabular-nums">{employees.length}</span>
          <span className="text-[11px] font-normal text-[var(--unilabor-neutral)]">· clic para ver trazabilidad y documentos</span>
        </h2>
        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-1.5 text-xs text-[var(--unilabor-neutral)]">
            <ArrowDownUp size={13} />
            <select value={sort} onChange={(event) => {
                setSort(event.target.value as SortKey);
                setPage(1);
              }} className="rounded-lg border border-[rgba(0,65,106,0.14)] bg-white px-2 py-1.5 text-xs text-[var(--unilabor-ink)]">
              {Object.entries(SORTS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <div className="inline-flex rounded-lg border border-[rgba(0,65,106,0.14)] bg-white p-0.5">
            {([['cards', LayoutGrid, 'Tarjetas'], ['table', Rows3, 'Tabla']] as const).map(([mode, Icon, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setView(mode)}
                aria-pressed={view === mode}
                title={label}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition ${view === mode ? 'bg-[var(--color-brand-700)] text-white' : 'text-[var(--color-brand-700)] hover:bg-[rgba(191,212,230,0.3)]'}`}
              >
                <Icon size={13} /> {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {employees.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[rgba(0,65,106,0.14)] py-12 text-center text-sm text-[var(--unilabor-neutral)]">
          Ningún colaborador coincide con los filtros.
        </div>
      ) : view === 'cards' ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {visible.map((employee, i) => (
            <CollaboratorCard key={employee.employee_id} employee={employee} evaluation={current(employee)} onOpen={() => onOpen(employee)} delay={i * 25} />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="text-[11px] uppercase tracking-wide text-[var(--unilabor-neutral)]">
              <tr className="border-b border-[rgba(0,65,106,0.08)]">
                <th className="px-3 py-2">Colaborador</th>
                <th className="px-3 py-2">Puesto(s)</th>
                <th className="px-3 py-2">Estado</th>
                {SECTION_META.map((section) => (
                  <th key={section.key} className="px-3 py-2 text-right">{section.label.split(' ')[0]}</th>
                ))}
                <th className="px-3 py-2 text-right">Final</th>
                <th className="px-3 py-2">Vigencia</th>
                <th className="px-3 py-2 text-right">Eval.</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((employee) => {
                const evaluation = current(employee);
                return (
                  <tr key={employee.employee_id} onClick={() => onOpen(employee)} className="cursor-pointer border-b border-[rgba(0,65,106,0.05)] transition hover:bg-[rgba(239,245,250,0.8)]">
                    <td className="px-3 py-2">
                      <p className="font-bold text-[var(--color-brand-700)]">{employee.full_name}</p>
                      <p className="inline-flex items-center gap-1 text-[10px] text-[var(--unilabor-neutral)]">
                        {employee.employee_code}
                        {employee.branch_name ? (
                          <>
                            <Building2 size={10} /> {employee.branch_name}
                          </>
                        ) : null}
                      </p>
                    </td>
                    <td className="max-w-[220px] px-3 py-2 text-[var(--unilabor-ink)]">
                      {employee.positions.length > 0 ? <PositionNames employee={employee} /> : '—'}
                    </td>
                    <td className="px-3 py-2"><StandingBadge standing={employee.standing} /></td>
                    {SECTION_META.map((section) => (
                      <td key={section.key} className="px-3 py-2 text-right tabular-nums">{evaluation?.[section.key] ?? '—'}</td>
                    ))}
                    <td className="px-3 py-2 text-right font-black tabular-nums" style={{ color: scoreColor(evaluation?.final_pct ?? null) }}>
                      {evaluation?.final_pct ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-[var(--unilabor-ink)]">{formatDateOnly(employee.valid_until)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{employee.evaluations_count}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {employees.length > 0 ? (
        <div className="mt-4">
          <CompactListPager page={page} pageSize={pageSize} total={employees.length} pageSizeOptions={[12, 24, 48]} onPageChange={setPage} onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }} sizeLabel="Colaboradores por página" />
        </div>
      ) : null}
    </section>
  );
};
