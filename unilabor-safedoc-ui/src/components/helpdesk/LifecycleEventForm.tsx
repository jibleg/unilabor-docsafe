import { useMemo, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import type { HelpdeskCatalogs, HelpdeskLifecycleEventPayload } from '../../types/models';

interface LifecycleEventFormProps {
  catalogs: HelpdeskCatalogs;
  saving: boolean;
  onSubmit: (payload: HelpdeskLifecycleEventPayload) => void;
}

const inputClass =
  'w-full rounded-xl border border-[rgba(0,65,106,0.14)] bg-white px-3 py-2 text-sm text-[var(--unilabor-ink)] outline-none focus:border-[var(--color-brand-300)]';
const labelClass = 'mb-1 block text-xs font-semibold text-[var(--unilabor-neutral)]';

const todayIso = () => new Date().toISOString().slice(0, 10);

export const LifecycleEventForm = ({ catalogs, saving, onSubmit }: LifecycleEventFormProps) => {
  const [eventTypeId, setEventTypeId] = useState<number | ''>('');
  const [eventDate, setEventDate] = useState(todayIso());
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [supplierId, setSupplierId] = useState<number | ''>('');
  const [provider, setProvider] = useState('');
  const [cost, setCost] = useState('');
  const [disposalReasonId, setDisposalReasonId] = useState<number | ''>('');
  const [toLocationId, setToLocationId] = useState<number | ''>('');
  const [calibrationCert, setCalibrationCert] = useState('');
  const [calibrationDue, setCalibrationDue] = useState('');
  const [notes, setNotes] = useState('');

  const selectedCode = useMemo(
    () => catalogs.lifecycle_event_types.find((t) => t.id === eventTypeId)?.code ?? '',
    [catalogs.lifecycle_event_types, eventTypeId],
  );

  const isCalibration = selectedCode === 'CALIBRATION';
  const isRelocation = selectedCode === 'RELOCATION';
  const isDecommission = selectedCode === 'DECOMMISSION';
  const showSupplier = ['ACQUISITION', 'MAINTENANCE', 'CALIBRATION'].includes(selectedCode);

  const submit = () => {
    if (!eventTypeId || !eventDate || !title.trim()) {
      return;
    }
    onSubmit({
      event_type_id: Number(eventTypeId),
      event_date: eventDate,
      title: title.trim(),
      description: description.trim() || null,
      supplier_id: showSupplier && supplierId ? Number(supplierId) : null,
      performed_by_provider: provider.trim() || null,
      cost: cost ? Number(cost) : null,
      disposal_reason_id: isDecommission && disposalReasonId ? Number(disposalReasonId) : null,
      to_location_id: isRelocation && toLocationId ? Number(toLocationId) : null,
      calibration_certificate_no: isCalibration ? calibrationCert.trim() || null : null,
      calibration_due_on: isCalibration ? calibrationDue || null : null,
      notes: notes.trim() || null,
    });
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label className={labelClass}>Tipo de evento *</label>
          <select className={inputClass} value={eventTypeId} onChange={(e) => setEventTypeId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Selecciona...</option>
            {catalogs.lifecycle_event_types.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Fecha del evento *</label>
          <input type="date" className={inputClass} value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
        </div>
      </div>

      <div>
        <label className={labelClass}>Titulo *</label>
        <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej. Compra inicial, Mantenimiento preventivo..." />
      </div>

      <div>
        <label className={labelClass}>Descripcion</label>
        <textarea className={inputClass} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      {showSupplier ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <label className={labelClass}>Proveedor</label>
            <select className={inputClass} value={supplierId} onChange={(e) => setSupplierId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">Sin proveedor del catalogo</option>
              {catalogs.suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Tecnico / Proveedor (texto)</label>
            <input className={inputClass} value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="Nombre del tecnico externo" />
          </div>
          <div>
            <label className={labelClass}>Costo (MXN)</label>
            <input type="number" min="0" step="0.01" className={inputClass} value={cost} onChange={(e) => setCost(e.target.value)} />
          </div>
        </div>
      ) : null}

      {isCalibration ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className={labelClass}>No. de certificado de calibracion</label>
            <input className={inputClass} value={calibrationCert} onChange={(e) => setCalibrationCert(e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Vigencia / proxima calibracion</label>
            <input type="date" className={inputClass} value={calibrationDue} onChange={(e) => setCalibrationDue(e.target.value)} />
          </div>
        </div>
      ) : null}

      {isRelocation ? (
        <div>
          <label className={labelClass}>Nueva ubicacion</label>
          <select className={inputClass} value={toLocationId} onChange={(e) => setToLocationId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Selecciona ubicacion...</option>
            {catalogs.locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>
      ) : null}

      {isDecommission ? (
        <div>
          <label className={labelClass}>Motivo de baja</label>
          <select className={inputClass} value={disposalReasonId} onChange={(e) => setDisposalReasonId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Selecciona motivo...</option>
            {catalogs.disposal_reasons.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-[var(--unilabor-neutral)]">Al registrar la baja el sistema generara el acta en PDF y dara de baja el equipo.</p>
        </div>
      ) : null}

      <div>
        <label className={labelClass}>Observaciones</label>
        <textarea className={inputClass} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={saving || !eventTypeId || !title.trim()}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-brand-700)] px-3 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
      >
        {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
        Registrar evento
      </button>
    </div>
  );
};
