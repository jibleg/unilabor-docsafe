import { useMemo } from 'react';
import { LifeBuoy, Loader2 } from 'lucide-react';
import { CatalogSelect } from '../components/CatalogSelect';
import { SearchableSelect } from '../components/SearchableSelect';
import type { Employee, HelpdeskAsset, HelpdeskTicketCatalogs } from '../types/models';
import { REQUEST_CHANNEL_OPTIONS, type TicketFormState } from './HelpdeskTicketsPage.helpers';

const assetOptions = (assets: HelpdeskAsset[]) =>
  assets.map((asset) => ({ value: String(asset.id), label: asset.name, hint: asset.asset_code }));

const employeeOptions = (employees: Employee[]) =>
  employees.map((employee) => ({ value: String(employee.id), label: employee.full_name, hint: employee.employee_code }));

interface TicketFormModalProps {
  open: boolean;
  isEditing: boolean;
  form: TicketFormState;
  setField: <K extends keyof TicketFormState>(field: K, value: TicketFormState[K]) => void;
  assets: HelpdeskAsset[];
  employees: Employee[];
  catalogs: HelpdeskTicketCatalogs;
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
}

export const TicketFormModal = ({
  open,
  isEditing,
  form,
  setField,
  assets,
  employees,
  catalogs,
  saving,
  onCancel,
  onSave,
}: TicketFormModalProps) => {
  const assetSelectOptions = useMemo(() => assetOptions(assets), [assets]);
  const employeeSelectOptions = useMemo(() => employeeOptions(employees), [employees]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(11,34,53,0.28)] p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/96 shadow-2xl shadow-[rgba(0,65,106,0.18)]">
        <div className="border-b border-[rgba(0,65,106,0.08)] px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-500)]">
            Mesa de ayuda
          </p>
          <h2 className="mt-1 text-lg font-bold text-[var(--color-brand-700)]">
            {isEditing ? 'Editar solicitud' : 'Nueva solicitud'}
          </h2>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="block md:col-span-2">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                Título
              </span>
              <input
                value={form.title}
                onChange={(event) => setField('title', event.target.value)}
                className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                Activo relacionado
              </span>
              <SearchableSelect
                value={form.asset_id}
                onChange={(value) => setField('asset_id', value)}
                options={assetSelectOptions}
                placeholder="Selecciona un activo"
                emptyLabel="Sin activo"
                searchPlaceholder="Buscar activo por nombre o código..."
              />
            </label>

            <CatalogSelect label="Tipo de solicitud" value={form.request_type_id} options={catalogs.request_types} onChange={(value) => setField('request_type_id', value)} />
            <CatalogSelect label="Prioridad" value={form.priority_id} options={catalogs.ticket_priorities} onChange={(value) => setField('priority_id', value)} />

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                Canal de solicitud
              </span>
              <select
                value={form.request_channel}
                onChange={(event) => setField('request_channel', event.target.value)}
                className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
              >
                {REQUEST_CHANNEL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                Colaborador solicitante
              </span>
              <SearchableSelect
                value={form.requester_employee_id}
                onChange={(value) => setField('requester_employee_id', value)}
                options={employeeSelectOptions}
                placeholder="Selecciona un colaborador"
                emptyLabel="Sin solicitante"
                searchPlaceholder="Buscar colaborador por nombre o código..."
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                Responsable
              </span>
              <SearchableSelect
                value={form.assigned_employee_id}
                onChange={(value) => setField('assigned_employee_id', value)}
                options={employeeSelectOptions}
                placeholder="Selecciona un responsable"
                emptyLabel="Sin responsable"
                searchPlaceholder="Buscar responsable por nombre o código..."
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                Fecha compromiso
              </span>
              <input
                type="datetime-local"
                value={form.due_at}
                onChange={(event) => setField('due_at', event.target.value)}
                className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
              />
            </label>

            <label className="flex items-center gap-3 rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)] px-3 py-2.5">
              <input
                type="checkbox"
                checked={form.affects_results}
                onChange={(event) => setField('affects_results', event.target.checked)}
                className="h-4 w-4 rounded border-[rgba(0,65,106,0.18)] text-[var(--color-brand-500)]"
              />
              <span className="text-sm font-semibold text-[var(--color-brand-700)]">
                Puede afectar resultados
              </span>
            </label>

            <label className="block md:col-span-2">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                Descripción
              </span>
              <textarea
                value={form.description}
                onChange={(event) => setField('description', event.target.value)}
                rows={4}
                className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
              />
            </label>

            <label className="block md:col-span-2">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                Impacto operativo
              </span>
              <textarea
                value={form.operational_impact}
                onChange={(event) => setField('operational_impact', event.target.value)}
                rows={3}
                className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
              />
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-[rgba(0,65,106,0.08)] px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-xl border border-[rgba(0,65,106,0.12)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)] disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <LifeBuoy size={14} />}
            Guardar solicitud
          </button>
        </div>
      </div>
    </div>
  );
};
