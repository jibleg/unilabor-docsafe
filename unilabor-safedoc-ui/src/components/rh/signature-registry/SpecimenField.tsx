import { useRef, useState } from 'react';
import { ClipboardPaste, FileSignature, ImageUp, Loader2, Trash2 } from 'lucide-react';
import { registerSpecimen, retireSpecimen } from '../../../api/service.api-rh-signature-registry';
import { getApiErrorMessage } from '../../../api/service.parsers';
import { useImagePaste } from '../../../hooks/useImagePaste';
import type { SignatureSpecimen, SignatureSpecimenKind } from '../../../types/models';
import { readClipboardImage } from '../../../utils/clipboard-image';
import { confirmAction } from '../../../utils/confirm';
import { notifyError, notifySuccess } from '../../../utils/notify';
import { SPECIMEN_IMAGE_ACCEPT, specimenImageIssue, specimenImageToPngDataUrl } from '../../../utils/specimen-image';
import { SpecimenThumb } from './SpecimenThumb';

interface SpecimenFieldProps {
  employeeId: number;
  kind: SignatureSpecimenKind;
  specimen: SignatureSpecimen | null;
  /** Fila histórica: solo consulta. */
  readOnly: boolean;
  onChanged: () => void;
}

const KIND_LABEL: Record<SignatureSpecimenKind, string> = { FIRMA: 'Firma', RUBRICA: 'Rúbrica' };

const ACTION =
  'inline-flex items-center gap-1 rounded-lg border border-[rgba(0,65,106,0.12)] bg-white px-2 py-1 text-[11px] font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)] disabled:opacity-50';

/**
 * Espécimen de firma o de rúbrica del colaborador: se carga desde archivo, del
 * portapapeles (botón o Ctrl+V sobre el recuadro) o se toma de su última firma
 * en SafeDoc. Cargar uno nuevo retira el anterior; retirar deja el antecedente.
 */
export const SpecimenField = ({ employeeId, kind, specimen, readOnly, onChanged }: SpecimenFieldProps) => {
  const zoneRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (file: File, source: 'UPLOAD' | 'CLIPBOARD') => {
    const issue = specimenImageIssue(file);
    if (issue) {
      notifyError(issue);
      return;
    }
    setBusy(true);
    try {
      const image = await specimenImageToPngDataUrl(file);
      notifySuccess((await registerSpecimen(employeeId, { kind, image, source })).message);
      onChanged();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo registrar el espécimen.'));
    } finally {
      setBusy(false);
    }
  };

  useImagePaste(zoneRef, !readOnly && !busy, (file) => void upload(file, 'CLIPBOARD'));

  const pasteFromButton = async () => {
    try {
      await upload(await readClipboardImage(), 'CLIPBOARD');
    } catch (error) {
      notifyError(error instanceof Error ? error.message : 'No se pudo leer el portapapeles.');
    }
  };

  const takeFromLastSignature = async () => {
    setBusy(true);
    try {
      notifySuccess((await registerSpecimen(employeeId, { kind, from_last_signature: true })).message);
      onChanged();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo tomar la última firma.'));
    } finally {
      setBusy(false);
    }
  };

  const retire = async () => {
    if (!specimen) return;
    const ok = await confirmAction(
      `Retirar ${KIND_LABEL[kind].toLowerCase()}`,
      `La ${KIND_LABEL[kind].toLowerCase()} dejará de ser el espécimen vigente y la fila quedará incompleta hasta cargar otra. El archivo se conserva como antecedente.`,
      'Retirar',
    );
    if (!ok) return;
    setBusy(true);
    try {
      notifySuccess(await retireSpecimen(specimen.id));
      onChanged();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo retirar el espécimen.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={zoneRef} tabIndex={readOnly ? undefined : -1} className="space-y-2 outline-none">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">{KIND_LABEL[kind]}</span>
        {readOnly ? null : (
          <span className="flex flex-wrap items-center gap-1">
            <input
              ref={fileRef}
              type="file"
              accept={SPECIMEN_IMAGE_ACCEPT}
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void upload(file, 'UPLOAD');
              }}
            />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} title="Cargar desde un archivo PNG, JPG, WEBP o BMP" className={ACTION}>
              <ImageUp size={12} /> Archivo
            </button>
            <button type="button" onClick={() => void pasteFromButton()} disabled={busy} title="Pegar la imagen copiada en el portapapeles (o Ctrl+V sobre el recuadro)" className={ACTION}>
              <ClipboardPaste size={12} /> Pegar
            </button>
            <button type="button" onClick={() => void takeFromLastSignature()} disabled={busy} title="Copiar la última firma que el colaborador puso en un REH-REG-003 o REH-REG-008 desde su sesión" className={ACTION}>
              <FileSignature size={12} /> Última firma
            </button>
            {specimen ? (
              <button type="button" onClick={() => void retire()} disabled={busy} title="Retirar el espécimen vigente (se conserva como antecedente)" aria-label={`Retirar ${KIND_LABEL[kind]}`} className={`${ACTION} text-rose-700`}>
                <Trash2 size={12} />
              </button>
            ) : null}
          </span>
        )}
      </div>
      <div className={`flex h-24 items-center justify-center rounded-xl border-2 bg-white ${specimen ? 'border-[var(--color-brand-300)]' : 'border-dashed border-[rgba(0,65,106,0.2)]'}`}>
        {busy ? (
          <Loader2 size={18} className="animate-spin text-[var(--unilabor-neutral)]" />
        ) : specimen ? (
          <SpecimenThumb specimen={specimen} height={80} />
        ) : (
          <span className="px-3 text-center text-xs text-[var(--unilabor-neutral)]">{readOnly ? 'Sin espécimen registrado' : 'Sin espécimen: carga, pega o toma su última firma'}</span>
        )}
      </div>
      {specimen ? (
        <p className="text-[11px] text-[var(--unilabor-neutral)]" title={`sha256 ${specimen.sha256}`}>
          Registrada el {new Date(specimen.registered_at).toLocaleDateString('es-MX')}
          {specimen.registered_by_name ? ` por ${specimen.registered_by_name}` : ''}
          {specimen.source_note ? ` · ${specimen.source_note}` : ''}
        </p>
      ) : null}
    </div>
  );
};
