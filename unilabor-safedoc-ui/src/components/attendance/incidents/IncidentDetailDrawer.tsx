import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ExternalLink, Info, Loader2, Paperclip, Trash2, Upload, X } from 'lucide-react';
import {
  addIncidentAttachments,
  deleteIncidentAttachment,
  getIncident,
  incidentAttachmentPath,
  type Incident,
} from '../../../api/service.api-attendance-incidents';
import { openAttendanceFile } from '../../../api/service.api-attendance-common';
import { getApiErrorMessage } from '../../../api/service.parsers';
import { confirmAction } from '../../../utils/confirm';
import { notifyError, notifySuccess } from '../../../utils/notify';
import { formatDate, formatDateTime } from '../shared/format';
import { iconButtonClass, primaryButtonClass, secondaryButtonClass } from '../employees/ui';
import { formatFileSize, formatIncidentDuration, validateFiles } from './incidentFormat';
import { IncidentStatusBadge } from './IncidentStatusBadge';

interface Props {
  incidentId: number;
  canEdit: boolean;
  onClose: () => void;
  onChanged: () => void;
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">{label}</dt>
    <dd className="mt-0.5 text-sm text-[var(--unilabor-ink)]">{children || '—'}</dd>
  </div>
);

export const IncidentDetailDrawer = ({ incidentId, canEdit, onClose, onChanged }: Props) => {
  const [incident, setIncident] = useState<Incident | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setIncident(await getIncident(incidentId));
    } catch (err) {
      setError(getApiErrorMessage(err, 'No se pudo cargar la incidencia.'));
    } finally {
      setLoading(false);
    }
  }, [incidentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleOpen = async (attachmentId: number) => {
    try {
      await openAttendanceFile(incidentAttachmentPath(incidentId, attachmentId));
    } catch (err) {
      notifyError(getApiErrorMessage(err, 'No se pudo abrir el archivo.'));
    }
  };

  const handleUpload = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const { accepted, rejected } = validateFiles(Array.from(list));
    if (rejected.length > 0) notifyError(rejected.join(' '));
    if (inputRef.current) inputRef.current.value = '';
    if (accepted.length === 0) return;
    setUploading(true);
    try {
      await addIncidentAttachments(incidentId, accepted.slice(0, 3));
      notifySuccess('Comprobante agregado.');
      await load();
      onChanged();
    } catch (err) {
      notifyError(getApiErrorMessage(err, 'No se pudo agregar el comprobante.'));
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (attachmentId: number, name: string) => {
    const confirmed = await confirmAction(
      'Quitar comprobante',
      `Se dará de baja "${name}". El archivo se conserva en el servidor como evidencia.`,
      'Quitar',
    );
    if (!confirmed) return;
    try {
      setIncident(await deleteIncidentAttachment(incidentId, attachmentId));
      notifySuccess('Comprobante dado de baja.');
      onChanged();
    } catch (err) {
      notifyError(getApiErrorMessage(err, 'No se pudo quitar el comprobante.'));
    }
  };

  const attachments = incident?.attachments ?? [];
  const canAddAttachments = canEdit && incident && (incident.status === 'captured' || incident.status === 'authorized');

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[rgba(11,34,53,0.28)] backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Detalle de incidencia">
      <div className="flex h-full w-full max-w-lg flex-col overflow-y-auto bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[rgba(0,65,106,0.08)] px-5 py-4">
          <h2 className="text-base font-bold text-[var(--color-brand-700)]">Incidencia #{incidentId}</h2>
          <button type="button" className={iconButtonClass} aria-label="Cerrar detalle" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="space-y-5 px-5 py-5">
          {loading ? (
            <p className="flex items-center gap-2 text-sm text-[var(--unilabor-neutral)]"><Loader2 size={16} className="animate-spin" /> Cargando…</p>
          ) : error ? (
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-sm text-red-800"><AlertTriangle size={16} /> {error}</p>
              <button type="button" className={secondaryButtonClass} onClick={() => void load()}>Reintentar</button>
            </div>
          ) : incident ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-bold text-[var(--unilabor-ink)]">{incident.employee.full_name}</p>
                  <p className="text-xs text-[var(--unilabor-neutral)]">
                    {[incident.employee.employee_code, incident.employee.branch_name].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <IncidentStatusBadge status={incident.status} />
              </div>
              <dl className="grid grid-cols-2 gap-4">
                <Field label="Tipo">{incident.type.name}</Field>
                <Field label="Duración">{formatIncidentDuration(incident)}</Field>
                <Field label="Desde">{formatDate(incident.start_date)}</Field>
                <Field label="Hasta">{formatDate(incident.end_date)}</Field>
                {incident.imss_folio ? <Field label="Folio IMSS">{incident.imss_folio}</Field> : null}
                <Field label="Capturó">{incident.captured_by_name}</Field>
                <Field label="Decidió">{incident.authorized_by_name ? `${incident.authorized_by_name} · ${formatDateTime(incident.authorized_at)}` : null}</Field>
                <Field label="Aviso al colaborador">{incident.notified_at ? formatDateTime(incident.notified_at) : 'Sin enviar'}</Field>
              </dl>
              <Field label="Motivo">{incident.reason}</Field>
              {incident.authorization_notes ? <Field label="Notas de la decisión">{incident.authorization_notes}</Field> : null}

              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--color-brand-700)]">
                    <Paperclip size={15} aria-hidden="true" /> Comprobantes ({attachments.length})
                  </h3>
                  {canAddAttachments ? (
                    <>
                      <input ref={inputRef} type="file" multiple hidden accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => void handleUpload(event.target.files)} />
                      <button type="button" className={primaryButtonClass} disabled={uploading} onClick={() => inputRef.current?.click()}>
                        {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} aria-hidden="true" />} Agregar
                      </button>
                    </>
                  ) : null}
                </div>
                {attachments.length === 0 ? (
                  <p className="text-sm text-[var(--unilabor-neutral)]">Sin comprobantes.</p>
                ) : (
                  <ul className="space-y-2">
                    {attachments.map((attachment) => (
                      <li key={attachment.id} className="flex items-center justify-between gap-2 rounded-xl border border-[rgba(0,65,106,0.1)] px-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[var(--unilabor-ink)]">{attachment.original_file_name}</p>
                          <p className="text-xs text-[var(--unilabor-neutral)]">
                            {formatFileSize(attachment.size_bytes)} · {formatDateTime(attachment.uploaded_at)}
                            {attachment.uploaded_by_name ? ` · ${attachment.uploaded_by_name}` : ''}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <button type="button" className={iconButtonClass} aria-label={`Abrir ${attachment.original_file_name}`} onClick={() => void handleOpen(attachment.id)}>
                            <ExternalLink size={15} />
                          </button>
                          {canEdit ? (
                            <button type="button" className={iconButtonClass} aria-label={`Quitar ${attachment.original_file_name}`} onClick={() => void handleDelete(attachment.id, attachment.original_file_name)}>
                              <Trash2 size={15} />
                            </button>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="flex gap-2 rounded-xl bg-[rgba(239,245,250,0.7)] p-3 text-xs text-[var(--unilabor-ink)]">
                <Info size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
                <ul className="list-disc space-y-1 pl-4">
                  <li>Los comprobantes se dan de baja de forma lógica: nunca se borra el archivo.</li>
                  <li>No puedes quitar el último comprobante de una incidencia autorizada si su tipo lo exige.</li>
                  <li>Solo se agregan comprobantes a incidencias por autorizar o autorizadas (máximo 10 vigentes).</li>
                  <li>Autorizar un tipo que exige comprobante requiere al menos uno vigente.</li>
                </ul>
              </section>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};
