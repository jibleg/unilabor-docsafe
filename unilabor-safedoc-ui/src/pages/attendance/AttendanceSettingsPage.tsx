import { useSearchParams } from 'react-router-dom';
import { HolidaysTab } from '../../components/attendance/settings/HolidaysTab';
import { IncidentTypesTab } from '../../components/attendance/settings/IncidentTypesTab';
import { RulesTab } from '../../components/attendance/settings/RulesTab';
import { VacationTab } from '../../components/attendance/settings/VacationTab';

const TABS = [
  { id: 'rules', label: 'Reglas' },
  { id: 'holidays', label: 'Festivos' },
  { id: 'incident-types', label: 'Tipos de incidencia' },
  { id: 'vacations', label: 'Vacaciones' },
] as const;

type TabId = (typeof TABS)[number]['id'];

const isTabId = (value: string | null): value is TabId => TABS.some((tab) => tab.id === value);

export const AttendanceSettingsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get('tab');
  const active: TabId = isTabId(raw) ? raw : 'rules';

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-[var(--color-brand-700)]">Parámetros</h1>
        <p className="text-sm text-slate-500">Reglas de puntualidad, festivos, tipos de incidencia y vacaciones.</p>
      </div>

      <div role="tablist" aria-label="Secciones de parámetros" className="flex gap-1 overflow-x-auto border-b border-[rgba(0,65,106,0.12)]">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`settings-tab-${tab.id}`}
            aria-selected={active === tab.id}
            aria-controls={`settings-panel-${tab.id}`}
            onClick={() => setSearchParams(tab.id === 'rules' ? {} : { tab: tab.id }, { replace: true })}
            className={`whitespace-nowrap border-b-2 px-4 py-2 text-sm font-semibold transition ${
              active === tab.id
                ? 'border-[var(--color-brand-700)] text-[var(--color-brand-700)]'
                : 'border-transparent text-slate-500 hover:text-[var(--color-brand-700)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`settings-panel-${active}`} aria-labelledby={`settings-tab-${active}`}>
        {active === 'rules' ? <RulesTab /> : null}
        {active === 'holidays' ? <HolidaysTab /> : null}
        {active === 'incident-types' ? <IncidentTypesTab /> : null}
        {active === 'vacations' ? <VacationTab /> : null}
      </div>
    </div>
  );
};
