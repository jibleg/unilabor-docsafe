import { useCallback, useEffect, useRef, useState } from 'react';
import { ClipboardPaste, ImageUp, Loader2, Save, Trash2 } from 'lucide-react';
import { getFormSignerImageUrl, listFormSigners, retireFormSigner, saveFormSigner } from '../../../api/service.api-rh-form-signers';
import { getApiErrorMessage } from '../../../api/service.parsers';
import { useImagePaste } from '../../../hooks/useImagePaste';
import type { FormSignerSlot, RhFormSigner, RhFormSignersBySlot } from '../../../types/models';
import { readClipboardImage } from '../../../utils/clipboard-image';
import { confirmAction } from '../../../utils/confirm';
import { notifyError, notifySuccess } from '../../../utils/notify';
import { SPECIMEN_IMAGE_ACCEPT, specimenImageIssue, specimenImageToPngDataUrl } from '../../../utils/specimen-image';
import { DrawerShell } from '../../attendance/schedule/DrawerShell';

export interface FormSignerSlotSpec {
  slot: FormSignerSlot;
  /** Encabezado del puesto tal como lo imprime el formato (Elaboró, Aprobó…). */
  label: string;
  hint: string;
}

interface FormSignersDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Base de las rutas del módulo: `/rh/authorized-personnel`, `/rh/signature-registry`. */
  basePath: string;
  /** Código del formato, para el subtítulo. */
  formCode: string;
  slots: FormSignerSlotSpec[];
}

const INPUT = 'w-full rounded-xl border border-[rgba(0,65,106,0.14)] bg-white px-3 py-2 text-sm text-[var(--unilabor-ink)] outline-none focus:border-[var(--color-brand-300)]';
const ACTION =
  'inline-flex items-center gap-1 rounded-lg border border-[rgba(0,65,106,0.12)] bg-white px-2 py-1 text-[11px] font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)] disabled:opacity-50';

interface SignerCardProps {
  basePath: string;
  slot: FormSignerSlot;
  label: string;
  hint: string;
  signer: RhFormSigner | null;
  onChanged: () => void;
}

/** Un puesto de firma: nombre, cargo y firma (archivo, portapapeles o Ctrl+V); guardar retira el registro anterior. */
const SignerCard = ({ basePath, slot, label, hint, signer, onChanged }: SignerCardProps) => {
  const zoneRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(signer?.signer_name ?? '');
  const [title, setTitle] = useState(signer?.signer_title ?? '');
  // Firma recién elegida (aún sin guardar) como data URL; null = conservar la vigente.
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(signer?.signer_name ?? '');
    setTitle(signer?.signer_title ?? '');
    setPendingImage(null);
  }, [signer]);

  useEffect(() => {
    let active = true;
    if (!signer?.has_signature) {
      setCurrentUrl(null);
      return undefined;
    }
    getFormSignerImageUrl(basePath, slot)
      .then((url) => {
        if (active) setCurrentUrl(url);
      })
      .catch(() => {
        if (active) setCurrentUrl(null);
      });
    return () => {
      active = false;
    };
  }, [signer, slot, basePath]);

  const pickFile = async (file: File) => {
    const issue = specimenImageIssue(file);
    if (issue) {
      notifyError(issue);
      return;
    }
    try {
      setPendingImage(await specimenImageToPngDataUrl(file));
    } catch (error) {
      notifyError(error instanceof Error ? error.message : 'No se pudo leer la imagen.');
    }
  };

  useImagePaste(zoneRef, !busy, (file) => void pickFile(file));

  const pasteFromButton = async () => {
    try {
      await pickFile(await readClipboardImage());
    } catch (error) {
      notifyError(error instanceof Error ? error.message : 'No se pudo leer el portapapeles.');
    }
  };

  const save = async () => {
    if (!name.trim() || !title.trim()) {
      notifyError('Captura el nombre y el cargo del firmante.');
      return;
    }
    setBusy(true);
    try {
      const result = await saveFormSigner(basePath, slot, { signer_name: name.trim(), signer_title: title.trim(), ...(pendingImage ? { image: pendingImage } : {}) });
      notifySuccess(result.message);
      setPendingImage(null);
      onChanged();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo guardar al firmante.'));
    } finally {
      setBusy(false);
    }
  };

  const retire = async () => {
    const ok = await confirmAction(
      `Retirar firmante de ${label}`,
      'El PDF volverá a imprimir el nombre fijo del formato, sin firma. El registro se conserva como antecedente.',
      'Retirar',
    );
    if (!ok) return;
    setBusy(true);
    try {
      notifySuccess(await retireFormSigner(basePath, slot));
      onChanged();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo retirar al firmante.'));
    } finally {
      setBusy(false);
    }
  };

  const preview = pendingImage ?? currentUrl;
  const dirty = pendingImage !== null || name.trim() !== (signer?.signer_name ?? '') || title.trim() !== (signer?.signer_title ?? '');

  return (
    <section ref={zoneRef} tabIndex={-1} className="space-y-2 rounded-2xl border border-[rgba(0,65,106,0.1)] bg-[rgba(248,251,253,0.95)] p-3 outline-none">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold uppercase tracking-wide text-[var(--color-brand-700)]">{label}</h3>
        <span className="text-[11px] text-[var(--unilabor-neutral)]">{hint}</span>
      </div>
      <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nombre completo (con título)" aria-label={`Nombre · ${label}`} className={INPUT} />
      <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Cargo" aria-label={`Cargo · ${label}`} className={INPUT} />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Firma</span>
        <span className="flex flex-wrap items-center gap-1">
          <input
            ref={fileRef}
            type="file"
            accept={SPECIMEN_IMAGE_ACCEPT}
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void pickFile(file);
            }}
          />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} title="Cargar desde un archivo PNG, JPG, WEBP o BMP" className={ACTION}>
            <ImageUp size={12} /> Archivo
          </button>
          <button type="button" onClick={() => void pasteFromButton()} disabled={busy} title="Pegar la imagen copiada en el portapapeles (o Ctrl+V sobre la tarjeta)" className={ACTION}>
            <ClipboardPaste size={12} /> Pegar
          </button>
          {signer ? (
            <button type="button" onClick={() => void retire()} disabled={busy} title="Retirar al firmante (se conserva como antecedente)" aria-label={`Retirar ${label}`} className={`${ACTION} text-rose-700`}>
              <Trash2 size={12} />
            </button>
          ) : null}
        </span>
      </div>
      <div className={`flex h-24 items-center justify-center rounded-xl border-2 bg-white ${preview ? 'border-[var(--color-brand-300)]' : 'border-dashed border-[rgba(0,65,106,0.2)]'}`}>
        {preview ? (
          <img src={preview} alt={`Firma · ${label}`} className="max-h-20 max-w-full object-contain" />
        ) : (
          <span className="px-3 text-center text-xs text-[var(--unilabor-neutral)]">Sin firma: carga o pega la imagen</span>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-[var(--unilabor-neutral)]">
          {pendingImage
            ? 'Firma nueva sin guardar'
            : signer
              ? `Registrado el ${new Date(signer.registered_at).toLocaleDateString('es-MX')}${signer.registered_by_name ? ` por ${signer.registered_by_name}` : ''}`
              : 'Sin firmante: el PDF imprime el nombre fijo del formato'}
        </p>
        <button type="button" onClick={() => void save()} disabled={busy || !dirty} className={`${ACTION} bg-[rgba(191,212,230,0.4)]`}>
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Guardar
        </button>
      </div>
    </section>
  );
};

/** Firmantes del pie del PDF de un formato: nombre, cargo y firma de quien elabora, revisa y autoriza. */
export const FormSignersDrawer = ({ open, onClose, basePath, formCode, slots }: FormSignersDrawerProps) => {
  const [signers, setSigners] = useState<RhFormSignersBySlot | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSigners(await listFormSigners(basePath));
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudieron cargar los firmantes.'));
    } finally {
      setLoading(false);
    }
  }, [basePath]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  return (
    <DrawerShell open={open} onClose={onClose} title="Firmas del formato" subtitle={`${formCode} · quienes elaboran, revisan y autorizan; se imprimen al pie del PDF`}>
      {loading && !signers ? (
        <div className="flex justify-center py-10">
          <Loader2 size={20} className="animate-spin text-[var(--unilabor-neutral)]" />
        </div>
      ) : signers ? (
        <div className="space-y-3 p-4">
          {slots.map((item) => (
            <SignerCard key={item.slot} basePath={basePath} slot={item.slot} label={item.label} hint={item.hint} signer={signers[item.slot]} onChanged={() => void load()} />
          ))}
        </div>
      ) : null}
    </DrawerShell>
  );
};
