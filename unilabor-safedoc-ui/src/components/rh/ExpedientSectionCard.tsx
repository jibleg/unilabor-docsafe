import { AlertTriangle, CalendarDays, Eye, FilePlus2, FileText, RefreshCw, Shield } from 'lucide-react';
import type { EmployeeExpedientSection, ExpedientItemStatus } from '../../types/models';

const getStatusLabel = (status: ExpedientItemStatus): string => {
  switch (status) {
    case 'uploaded':
      return 'Cargado';
    case 'valid':
      return 'Vigente';
    case 'expiring':
      return 'Por vencer';
    case 'expired':
      return 'Vencido';
    case 'missing':
    default:
      return 'Pendiente';
  }
};

const getStatusClassName = (status: ExpedientItemStatus): string => {
  switch (status) {
    case 'uploaded':
      return 'border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.36)] text-[var(--color-brand-700)]';
    case 'valid':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'expiring':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'expired':
      return 'border-rose-200 bg-rose-50 text-rose-700';
    case 'missing':
    default:
      return 'border-[rgba(151,163,172,0.28)] bg-[rgba(151,163,172,0.12)] text-[var(--color-brand-700)]';
  }
};

interface ExpedientSectionCardProps {
  section: EmployeeExpedientSection;
  onUpload: (item: EmployeeExpedientSection['items'][number]) => void;
  onView: (documentId: number) => void;
}

export const ExpedientSectionCard = ({
  section,
  onUpload,
  onView,
}: ExpedientSectionCardProps) => {
  return (
    <div className="overflow-hidden rounded-3xl border border-[rgba(0,65,106,0.08)] bg-white/92 shadow-xl shadow-[rgba(0,65,106,0.08)]">
      <div className="border-b border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.92)] px-5 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-brand-500)]">
              {section.section.code}
            </p>
            <h3 className="mt-1 text-lg font-bold text-[var(--color-brand-700)]">{section.section.name}</h3>
            <p className="mt-1 text-sm text-[var(--unilabor-neutral)]">
              {section.section.description || 'Seccion documental del expediente RH.'}
            </p>
          </div>
          <span className="rounded-full border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.34)] px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-[var(--color-brand-700)]">
            {section.items.length} tipo{section.items.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      <div className="divide-y divide-[rgba(0,65,106,0.08)]">
        {section.items.map((item) => (
          <div key={item.document_type.id} className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(220px,0.7fr)_auto] lg:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-sm font-bold text-[var(--color-brand-700)]">{item.document_type.name}</h4>
                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${getStatusClassName(item.status)}`}>
                  {getStatusLabel(item.status)}
                </span>
                {item.document_type.is_required && (
                  <span className="rounded-full border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.22)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--color-brand-700)]">
                    Obligatorio
                  </span>
                )}
                {item.document_type.is_sensitive && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-[rgba(0,65,106,0.14)] bg-[rgba(239,245,250,0.92)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--color-brand-700)]">
                    <Shield size={10} />
                    Sensible
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-[var(--unilabor-neutral)]">
                {item.document_type.description || 'Sin descripcion adicional.'}
              </p>
            </div>

            <div className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.82)] px-4 py-3 text-xs text-[var(--unilabor-neutral)]">
              {item.current_document ? (
                <div className="space-y-1.5">
                  <p className="font-semibold text-[var(--color-brand-700)]">{item.current_document.title}</p>
                  <p>Version {item.current_document.version}</p>
                  <p>Emitido: {item.current_document.issue_date || 'Sin fecha'}</p>
                  <p>Vence: {item.current_document.expiry_date || 'No aplica'}</p>
                  <p>Cargado por: {item.current_document.uploaded_by_name || 'Sistema'}</p>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <AlertTriangle size={14} className="mt-0.5 text-[var(--color-brand-500)]" />
                  <p>Aun no existe un PDF vigente para este tipo documental.</p>
                </div>
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              {item.current_document ? (
                <button
                  type="button"
                  onClick={() => onView(item.current_document!.id)}
                  className="inline-flex items-center gap-1 rounded-xl border border-[rgba(0,65,106,0.12)] bg-white/90 px-3 py-2 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
                >
                  <Eye size={14} />
                  Ver PDF
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => onUpload(item)}
                className="inline-flex items-center gap-1 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.36)] px-3 py-2 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)]"
              >
                {item.current_document ? <RefreshCw size={14} /> : <FilePlus2 size={14} />}
                {item.current_document ? 'Reemplazar' : 'Cargar'}
              </button>
            </div>

            {item.current_document?.description ? (
              <div className="lg:col-span-3">
                <div className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/80 px-4 py-3 text-xs text-[var(--unilabor-neutral)]">
                  <div className="mb-1 flex items-center gap-2 font-semibold text-[var(--color-brand-700)]">
                    <FileText size={13} />
                    Descripcion del documento
                  </div>
                  <p>{item.current_document.description}</p>
                </div>
              </div>
            ) : null}

            {item.current_document?.expiry_date ? (
              <div className="lg:col-span-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.92)] px-3 py-1 text-[11px] font-semibold text-[var(--unilabor-neutral)]">
                  <CalendarDays size={12} />
                  Vigencia controlada para este documento
                </div>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
};
