import { LifeBuoy, Loader2 } from 'lucide-react';
import { CatalogSelect } from '../components/CatalogSelect';
import type { Employee, HelpdeskAsset, HelpdeskTicketCatalogs } from '../types/models';
import type { TicketFormState } from './HelpdeskTicketsPage.helpers';

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
                Titulo
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
              <select
                value={form.asset_id}
                onChange={(event) => setField('asset_id', event.target.value)}
                className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
              >
                <option value="">Sin activo</option>
                {assets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.asset_code} - {asset.name}
                  </option>
                ))}
              </select>
            </label>

            <CatalogSelect label="Tipo de solicitud" value={form.request_type_id} options={catalogs.request_types} onChange={(value) => setField('request_type_id', value)} />
            <CatalogSelect label="Prioridad" value={form.priority_id} options={catalogs.ticket_priorities} onChange={(value) => setField('priority_id', value)} />
            <CatalogSelect label="Estado" value={form.status_id} options={catalogs.ticket_statuses} onChange={(value) => setField('status_id', value)} />

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                Colaborador solicitante
              </span>
              <select
                value={form.requester_employee_id}
                onChange={(event) => setField('requester_employee_id', event.target.value)}
                className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
              >
                <option value="">Sin solicitante</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.employee_code} - {employee.full_name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                Responsable
              </span>
              <select
                value={form.assigned_employee_id}
                onChange={(event) => setField('assigned_employee_id', event.target.value)}
                className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
              >
                <option value="">Sin responsable</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.employee_code} - {employee.full_name}
                  </option>
                ))}
              </select>
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
                Descripcion
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
