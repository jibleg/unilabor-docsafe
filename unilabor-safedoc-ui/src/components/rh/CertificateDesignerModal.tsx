import { useEffect, useState } from 'react';
import { Eye, Image as ImageIcon, Loader2, Plus, Save, Trash2, X } from 'lucide-react';
import {
  getApiErrorMessage,
  getCertificatePreviewUrl,
  getCertificateTemplate,
  saveCertificateTemplate,
  uploadCertificateImage,
} from '../../api/service';
import type { CertificateSignature, CertificateTemplate } from '../../types/models';
import { notifyError, notifySuccess, notifyWarning } from '../../utils/notify';

interface CertificateDesignerModalProps {
  courseId: number;
  courseTitle: string;
  onClose: () => void;
}

const inputClass =
  'w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]';
const labelClass = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]';

const PLACEHOLDERS = ['{{nombre}}', '{{capacitacion}}', '{{fecha}}', '{{calificacion}}', '{{vigencia}}'];

export const CertificateDesignerModal = ({ courseId, courseTitle, onClose }: CertificateDesignerModalProps) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [template, setTemplate] = useState<CertificateTemplate | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const data = await getCertificateTemplate(courseId);
        if (active) {
          setTemplate(data);
        }
      } catch (error) {
        if (active) {
          notifyError(getApiErrorMessage(error, 'No se pudo cargar la plantilla de constancia.'));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [courseId]);

  // Liberar el object URL del preliminar al cerrar/cambiar.
  useEffect(() => () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
  }, [previewUrl]);

  const patch = (changes: Partial<CertificateTemplate>) =>
    setTemplate((current) => (current ? { ...current, ...changes } : current));

  const updateSignature = (index: number, changes: Partial<CertificateSignature>) =>
    setTemplate((current) =>
      current
        ? { ...current, signatures: current.signatures.map((s, i) => (i === index ? { ...s, ...changes } : s)) }
        : current,
    );

  const addSignature = () =>
    setTemplate((current) =>
      current && current.signatures.length < 4
        ? {
            ...current,
            signatures: [...current.signatures, { signatory_name: '', role: null, signature_image_path: null }],
          }
        : current,
    );

  const removeSignature = (index: number) =>
    setTemplate((current) =>
      current ? { ...current, signatures: current.signatures.filter((_, i) => i !== index) } : current,
    );

  const handleLogoUpload = async (file: File) => {
    try {
      const path = await uploadCertificateImage(courseId, file);
      patch({ logo_path: path });
      notifySuccess('Logo cargado. Guarda y previsualiza para verlo.');
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo cargar el logo.'));
    }
  };

  const handleSignatureUpload = async (index: number, file: File) => {
    try {
      const path = await uploadCertificateImage(courseId, file);
      updateSignature(index, { signature_image_path: path });
      notifySuccess('Imagen de firma cargada.');
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo cargar la imagen de firma.'));
    }
  };

  const persist = async (): Promise<boolean> => {
    if (!template) return false;
    if (!template.title_text.trim() || !template.body_text.trim()) {
      notifyWarning('El titulo y el cuerpo de la constancia son obligatorios.');
      return false;
    }
    if (template.signatures.some((s) => !s.signatory_name.trim())) {
      notifyWarning('Cada firma necesita el nombre del firmante.');
      return false;
    }
    const saved = await saveCertificateTemplate(courseId, {
      title_text: template.title_text,
      body_text: template.body_text,
      logo_path: template.logo_path,
      orientation: template.orientation,
      signatures: template.signatures.map((s) => ({
        signatory_name: s.signatory_name,
        role: s.role,
        signature_image_path: s.signature_image_path,
      })),
    });
    setTemplate(saved);
    return true;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (await persist()) {
        notifySuccess('Plantilla de constancia guardada.');
      }
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo guardar la plantilla.'));
    } finally {
      setSaving(false);
    }
  };

  // Guarda primero para que el preliminar refleje los ajustes actuales.
  const handlePreview = async () => {
    setPreviewing(true);
    try {
      if (!(await persist())) {
        return;
      }
      const url = await getCertificatePreviewUrl(courseId);
      setPreviewUrl((current) => {
        if (current) {
          URL.revokeObjectURL(current);
        }
        return url;
      });
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo generar el preliminar.'));
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(11,34,53,0.28)] p-4 backdrop-blur-sm">
      <div className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/96 shadow-2xl shadow-[rgba(0,65,106,0.18)]">
        <div className="flex items-center justify-between border-b border-[rgba(0,65,106,0.08)] px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-500)]">
              Disenador de constancia
            </p>
            <h2 className="mt-1 text-lg font-bold text-[var(--color-brand-700)]">{courseTitle}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[rgba(0,65,106,0.1)] text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        {loading || !template ? (
          <div className="flex flex-1 items-center justify-center py-16 text-sm text-[var(--unilabor-neutral)]">
            <Loader2 className="mr-2 animate-spin" size={18} /> Cargando plantilla...
          </div>
        ) : (
          <div className="grid flex-1 grid-cols-1 gap-0 overflow-hidden lg:grid-cols-2">
            {/* Editor */}
            <div className="space-y-4 overflow-y-auto border-b border-[rgba(0,65,106,0.08)] p-5 lg:border-b-0 lg:border-r">
              <div>
                <label className={labelClass}>Titulo</label>
                <input value={template.title_text} onChange={(e) => patch({ title_text: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Cuerpo</label>
                <textarea
                  value={template.body_text}
                  onChange={(e) => patch({ body_text: e.target.value })}
                  rows={4}
                  className={inputClass}
                />
                <p className="mt-1 text-[11px] text-[var(--unilabor-neutral)]">
                  Placeholders: {PLACEHOLDERS.join('  ')}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Orientacion</label>
                  <select
                    value={template.orientation}
                    onChange={(e) => patch({ orientation: e.target.value as 'landscape' | 'portrait' })}
                    className={inputClass}
                  >
                    <option value="landscape">Horizontal</option>
                    <option value="portrait">Vertical</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Logo</label>
                  <label className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-[rgba(0,65,106,0.12)] bg-white/80 px-3 py-2.5 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]">
                    <ImageIcon size={14} />
                    {template.logo_path ? 'Cambiar logo' : 'Subir logo'}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void handleLogoUpload(file);
                      }}
                    />
                  </label>
                  <p className="mt-1 text-[10px] text-[var(--unilabor-neutral)]">
                    {template.logo_path ? 'Logo personalizado cargado' : 'Se usa el logo Unilabor por defecto'}
                  </p>
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className={labelClass}>Firmas ({template.signatures.length}/4)</label>
                  {template.signatures.length < 4 && (
                    <button
                      type="button"
                      onClick={addSignature}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-brand-500)] transition hover:text-[var(--color-brand-700)]"
                    >
                      <Plus size={13} /> Agregar firma
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {template.signatures.map((signature, index) => (
                    <div key={index} className="space-y-2 rounded-xl border border-[rgba(0,65,106,0.1)] bg-[rgba(248,251,253,0.6)] p-3">
                      <div className="flex items-center gap-2">
                        <input
                          value={signature.signatory_name}
                          onChange={(e) => updateSignature(index, { signatory_name: e.target.value })}
                          placeholder="Nombre del firmante"
                          className={inputClass}
                        />
                        <button
                          type="button"
                          onClick={() => removeSignature(index)}
                          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[rgba(220,38,38,0.2)] text-red-600 transition hover:bg-red-50"
                          aria-label="Eliminar firma"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <input
                        value={signature.role ?? ''}
                        onChange={(e) => updateSignature(index, { role: e.target.value })}
                        placeholder="Cargo (opcional)"
                        className={inputClass}
                      />
                      <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-[var(--color-brand-500)] transition hover:text-[var(--color-brand-700)]">
                        <ImageIcon size={13} />
                        {signature.signature_image_path ? 'Cambiar imagen de firma' : 'Subir imagen de firma (opcional)'}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void handleSignatureUpload(index, file);
                          }}
                        />
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Preliminar */}
            <div className="flex flex-col bg-[rgba(248,251,253,0.6)] p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-wide text-[var(--color-brand-700)]">Preliminar</h3>
                <button
                  type="button"
                  onClick={() => void handlePreview()}
                  disabled={previewing}
                  className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:opacity-50"
                >
                  {previewing ? <Loader2 size={13} className="animate-spin" /> : <Eye size={13} />}
                  Generar preliminar
                </button>
              </div>
              <div className="flex-1 overflow-hidden rounded-xl border border-[rgba(0,65,106,0.12)] bg-white">
                {previewUrl ? (
                  <iframe title="Preliminar de constancia" src={previewUrl} className="h-full min-h-[360px] w-full" />
                ) : (
                  <div className="flex h-full min-h-[360px] items-center justify-center px-6 text-center text-xs text-[var(--unilabor-neutral)]">
                    Genera el preliminar para ver la constancia con datos de muestra y ajustar textos, logo y firmas.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-[rgba(0,65,106,0.08)] px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-[rgba(0,65,106,0.12)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)] disabled:opacity-50"
          >
            Cerrar
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || loading}
            className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Guardar plantilla
          </button>
        </div>
      </div>
    </div>
  );
};
