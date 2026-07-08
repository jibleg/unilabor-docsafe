import { useMemo, useRef, useState } from 'react';
import { FileText, Loader2, Upload, Eye } from 'lucide-react';
import type { HelpdeskAssetDocument, HelpdeskCatalogs, HelpdeskLifecycleEvent } from '../../types/models';
import { SearchableSelect } from '../SearchableSelect';

interface AssetEvidencePanelProps {
  documents: HelpdeskAssetDocument[];
  catalogs: HelpdeskCatalogs;
  events: HelpdeskLifecycleEvent[];
  uploading: boolean;
  onUpload: (file: File, fields: { title: string; document_kind_id?: number | null; lifecycle_event_id?: number | null }) => void;
  onView: (documentId: number) => void;
}

const inputClass =
  'w-full rounded-xl border border-[rgba(0,65,106,0.14)] bg-white px-3 py-2 text-sm text-[var(--unilabor-ink)] outline-none focus:border-[var(--color-brand-300)]';
const labelClass = 'mb-1 block text-xs font-semibold text-[var(--unilabor-neutral)]';

export const AssetEvidencePanel = ({
  documents,
  catalogs,
  events,
  uploading,
  onUpload,
  onView,
}: AssetEvidencePanelProps) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [kindId, setKindId] = useState<number | ''>('');
  const [eventId, setEventId] = useState<number | ''>('');
  const [file, setFile] = useState<File | null>(null);

  // La lista de eventos puede ser extensa: se usa un dropdown con buscador.
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

  const submit = () => {
    if (!file || !title.trim()) {
      return;
    }
    onUpload(file, {
      title: title.trim(),
      document_kind_id: kindId ? Number(kindId) : null,
      lifecycle_event_id: eventId ? Number(eventId) : null,
    });
    setTitle('');
    setKindId('');
    setEventId('');
    setFile(null);
    if (fileRef.current) {
      fileRef.current.value = '';
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[rgba(0,65,106,0.1)] bg-[rgba(248,251,253,0.96)] p-4">
        <p className="mb-3 text-sm font-bold text-[var(--color-brand-700)]">Cargar evidencia (PDF)</p>
        <div className="space-y-3">
          <div>
            <label className={labelClass}>Titulo del documento *</label>
            <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej. Factura de compra, Manual de usuario..." />
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className={labelClass}>Tipo de documento</label>
              <select className={inputClass} value={kindId} onChange={(e) => setKindId(e.target.value ? Number(e.target.value) : '')}>
                <option value="">Sin clasificar</option>
                {catalogs.document_kinds.map((k) => (
                  <option key={k.id} value={k.id}>{k.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Asociar a evento (opcional)</label>
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
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-[var(--unilabor-neutral)] file:mr-3 file:rounded-lg file:border-0 file:bg-[rgba(191,212,230,0.5)] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-[var(--color-brand-700)]"
          />
          <button
            type="button"
            onClick={submit}
            disabled={uploading || !file || !title.trim()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-brand-700)] px-3 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            Subir evidencia
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-bold text-[var(--color-brand-700)]">Evidencias del equipo ({documents.length})</p>
        {documents.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[rgba(0,65,106,0.14)] p-4 text-sm text-[var(--unilabor-neutral)]">
            Sin evidencias cargadas todavia.
          </p>
        ) : (
          documents.map((doc) => (
            <div key={doc.id} className="flex items-center justify-between gap-3 rounded-xl border border-[rgba(0,65,106,0.08)] bg-white px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <FileText size={18} className="shrink-0 text-[var(--color-brand-700)]" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[var(--unilabor-ink)]">{doc.title}</p>
                  <p className="truncate text-xs text-[var(--unilabor-neutral)]">
                    {doc.document_kind_name ?? 'Sin clasificar'}{doc.version > 1 ? ` · v${doc.version}` : ''}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onView(doc.id)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[rgba(0,65,106,0.14)] px-2.5 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.3)]"
              >
                <Eye size={14} /> Ver
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
