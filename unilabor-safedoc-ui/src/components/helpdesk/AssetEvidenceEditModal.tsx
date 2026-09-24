import { useMemo, useState } from 'react';
import { Loader2, PencilLine, X } from 'lucide-react';
import type {
  HelpdeskAssetDocument,
  HelpdeskAssetDocumentMetadataPayload,
  HelpdeskCatalogs,
  HelpdeskLifecycleEvent,
} from '../../types/models';
import { SearchableSelect } from '../SearchableSelect';

interface AssetEvidenceEditModalProps {
  document: HelpdeskAssetDocument;
  catalogs: HelpdeskCatalogs;
  events: HelpdeskLifecycleEvent[];
  saving: boolean;
  onClose: () => void;
  onSubmit: (payload: HelpdeskAssetDocumentMetadataPayload) => Promise<void>;
}

const inputClass =
  'w-full rounded-xl border border-[rgba(0,65,106,0.14)] bg-white px-3 py-2 text-sm text-[var(--unilabor-ink)] outline-none focus:border-[var(--color-brand-300)]';
const labelClass = 'mb-1 block text-xs font-semibold text-[var(--unilabor-neutral)]';

/**
 * Correccion de los datos de una evidencia ya cargada: titulo, tipo, evento al
 * que pertenece y fechas. El PDF no cambia; para sustituirlo se carga una
 * evidencia nueva y se da de baja la anterior.
 */
export const AssetEvidenceEditModal = ({
  document,
  catalogs,
  events,
  saving,
  onClose,
  onSubmit,
}: AssetEvidenceEditModalProps) => {
  const [title, setTitle] = useState(document.title);
  const [kindId, setKindId] = useState<number | ''>(document.document_kind_id ?? '');
  const [eventId, setEventId] = useState<number | ''>(document.lifecycle_event_id ?? '');
  const [issuedOn, setIssuedOn] = useState(document.issued_on ?? '');
  const [expiresOn, setExpiresOn] = useState(document.expires_on ?? '');

  const eventOptions = useMemo(
    () => [
      { value: '', label: 'Sin evento' },
      ...events.map((ev) => ({
        value: String(ev.id),
        label: `${ev.event_code} — ${ev.title}`,
        hint: ev.event_type?.name ?? undefined,
      })),
    ],
    [events],
  );

  const canSave = title.trim().length > 0 && !saving;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[rgba(11,34,53,0.28)] p-4 backdrop-blur-sm">
      <div className="my-6 w-full max-w-xl overflow-hidden rounded-3xl border border-[rgba(0,65,106,0.08)] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[rgba(0,65,106,0.08)] px-5 py-3">
          <div className="text-sm font-bold text-[var(--color-brand-700)]">Editar evidencia</div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-full p-1 text-[var(--unilabor-neutral)] transition hover:bg-[rgba(191,212,230,0.28)]"
          >
            <X size={18} />
          </button>
        </div>
        <form
          className="space-y-3 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSave) {
              return;
            }
            void onSubmit({
              title: title.trim(),
              document_kind_id: kindId ? Number(kindId) : null,
              lifecycle_event_id: eventId ? Number(eventId) : null,
              issued_on: issuedOn || null,
              expires_on: expiresOn || null,
            });
          }}
        >
          <div>
            <label htmlFor="hd-evidence-title" className={labelClass}>Titulo del documento *</label>
            <input id="hd-evidence-title" className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label htmlFor="hd-evidence-kind" className={labelClass}>Tipo de documento</label>
              <select id="hd-evidence-kind" className={inputClass} value={kindId} onChange={(e) => setKindId(e.target.value ? Number(e.target.value) : '')}>
                <option value="">Sin clasificar</option>
                {catalogs.document_kinds.map((k) => (
                  <option key={k.id} value={k.id}>{k.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Evento asociado</label>
              <SearchableSelect
                value={eventId ? String(eventId) : ''}
                onChange={(value) => setEventId(value ? Number(value) : '')}
                options={eventOptions}
                placeholder="Sin evento"
                emptyLabel="Sin evento"
                searchPlaceholder="Buscar evento por folio o título..."
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label htmlFor="hd-evidence-issued" className={labelClass}>Fecha de emision</label>
              <input id="hd-evidence-issued" type="date" className={inputClass} value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} />
            </div>
            <div>
              <label htmlFor="hd-evidence-expires" className={labelClass}>Vigencia / vence</label>
              <input id="hd-evidence-expires" type="date" className={inputClass} value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
            </div>
          </div>
          <p className="rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.88)] px-3 py-2 text-xs text-[var(--unilabor-neutral)]">
            El archivo PDF no cambia{document.version > 1 ? ` (version ${document.version})` : ''}. Para sustituirlo, carga una
            evidencia nueva y da de baja esta. El cambio queda en la auditoria del equipo.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl border border-[rgba(0,65,106,0.14)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.3)] disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!canSave}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-brand-700)] px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <PencilLine size={16} />}
              Guardar cambios
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
