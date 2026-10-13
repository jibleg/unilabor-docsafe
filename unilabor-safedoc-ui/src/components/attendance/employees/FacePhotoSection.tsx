import { useEffect, useState } from 'react';
import { Camera, Loader2, Send, UserRound } from 'lucide-react';
import {
  fetchFacePhotoUrl, sendFacePhoto, type AttendanceEmployee, type DeviceSyncStatus,
} from '../../../api/service.api-attendance-employees';
import { getApiErrorMessage } from '../../../api/service.parsers';
import { notifyError, notifySuccess } from '../../../utils/notify';
import { DrawerShell } from '../schedule/DrawerShell';
import { FacePhotoCropper } from './FacePhotoCropper';
import { secondaryButtonClass } from './ui';

interface Props {
  employee: AttendanceEmployee;
  canWrite: boolean;
  onChanged: (employee: AttendanceEmployee) => void;
}

const FACE_STATUS: Record<DeviceSyncStatus, { label: string; className: string }> = {
  not_applicable: { label: 'Sin enviar', className: 'badge-ghost' },
  pending: { label: 'Pendiente de enviar al reloj', className: 'badge-warning' },
  synced: { label: 'En el reloj', className: 'badge-success' },
  error: { label: 'Error al enviar', className: 'badge-error' },
};

/** Fotografia de rostro del colaborador: vista previa, carga con recorte/zoom y envio al reloj. */
export const FacePhotoSection = ({ employee, canWrite, onChanged }: Props) => {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!employee.has_face_photo) {
      setPhotoUrl(null);
      return;
    }
    let active = true;
    let created: string | null = null;
    fetchFacePhotoUrl(employee.id)
      .then((next) => {
        if (!active) return URL.revokeObjectURL(next);
        created = next;
        setPhotoUrl(next);
      })
      .catch(() => active && setPhotoUrl(null));
    return () => {
      active = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [employee.id, employee.has_face_photo, employee.face_photo_updated_at]);

  const status = FACE_STATUS[employee.face_sync_status] ?? FACE_STATUS.not_applicable;
  const onDevice = employee.device_sync_status === 'synced';

  const resend = async () => {
    setSending(true);
    try {
      onChanged(await sendFacePhoto(employee.id));
      notifySuccess('Orden enviada: el agente subirá la fotografía al reloj en unos segundos.');
    } catch (err) {
      notifyError(getApiErrorMessage(err, 'No se pudo enviar la fotografía al reloj.'));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-xl border border-[rgba(0,65,106,0.1)] p-3">
      <div className="flex items-start gap-3">
        <div className="flex h-[120px] w-[90px] shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[rgba(0,65,106,0.12)] bg-[rgba(239,245,250,0.9)]">
          {photoUrl ? (
            <img src={photoUrl} alt={`Fotografía de ${employee.full_name}`} className="h-full w-full object-cover" />
          ) : (
            <UserRound size={32} className="text-[var(--color-brand-300)]" aria-hidden="true" />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold text-[var(--unilabor-ink)]">Fotografía de rostro:</span>
            {employee.has_face_photo ? (
              <span className={`badge badge-sm ${status.className}`}>{status.label}</span>
            ) : (
              <span className="badge badge-ghost badge-sm">Sin fotografía</span>
            )}
          </p>
          {employee.face_sync_error ? <p className="text-xs text-red-700">{employee.face_sync_error}</p> : null}
          {employee.has_face_photo && employee.face_sync_status === 'pending' && !onDevice ? (
            <p className="text-xs text-[var(--unilabor-neutral)]">Se enviará al reloj cuando el colaborador se sincronice.</p>
          ) : null}
          {canWrite ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" className={secondaryButtonClass} onClick={() => { setFile(null); setOpen(true); }}>
                <Camera size={15} aria-hidden="true" /> {employee.has_face_photo ? 'Cambiar foto' : 'Cargar foto'}
              </button>
              {employee.has_face_photo && onDevice ? (
                <button type="button" className={secondaryButtonClass} onClick={() => void resend()} disabled={sending} title="Volver a enviar la fotografía al reloj">
                  {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} aria-hidden="true" />} Enviar al reloj
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <DrawerShell open={open} title="Fotografía de rostro" subtitle={employee.full_name} onClose={() => setOpen(false)}>
        <FacePhotoCropper
          initialFile={file}
          employeeId={employee.id}
          onCancel={() => setOpen(false)}
          onSaved={(saved, queued) => {
            setOpen(false);
            onChanged(saved);
            notifySuccess(
              queued
                ? 'Fotografía guardada y enviada al reloj.'
                : 'Fotografía guardada. Se enviará al reloj cuando el colaborador esté sincronizado.',
            );
          }}
        />
      </DrawerShell>
    </div>
  );
};
