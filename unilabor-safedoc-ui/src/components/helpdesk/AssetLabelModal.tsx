import { useMemo } from 'react';
import JsBarcode from 'jsbarcode';
import { Printer, X } from 'lucide-react';

interface AssetLabelModalProps {
  assetCode: string;
  name: string;
  brand?: string | null;
  model?: string | null;
  onClose: () => void;
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export const AssetLabelModal = ({ assetCode, name, brand, model, onClose }: AssetLabelModalProps) => {
  const { dataUrl, error } = useMemo(() => {
    const canvas = document.createElement('canvas');
    try {
      JsBarcode(canvas, assetCode, {
        format: 'CODE128',
        displayValue: true,
        fontSize: 16,
        height: 55,
        margin: 6,
        textMargin: 2,
        font: 'monospace',
      });
      return { dataUrl: canvas.toDataURL('image/png'), error: false };
    } catch {
      return { dataUrl: '', error: true };
    }
  }, [assetCode]);

  const handlePrint = () => {
    if (!dataUrl) {
      return;
    }
    const printWindow = window.open('', '_blank', 'width=480,height=360');
    if (!printWindow) {
      return;
    }
    const subtitle = [brand, model].filter(Boolean).join(' · ');
    printWindow.document.write(`<!DOCTYPE html>
<html><head><meta charset="utf-8" /><title>Etiqueta ${escapeHtml(assetCode)}</title>
<style>
  @page { size: 50mm 25mm; margin: 0; }
  html, body { margin: 0; padding: 0; }
  .label {
    width: 50mm; height: 25mm; box-sizing: border-box; padding: 1mm;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    font-family: Arial, Helvetica, sans-serif; text-align: center;
  }
  .name { font-size: 7pt; font-weight: 700; line-height: 1.05; max-width: 48mm;
    overflow: hidden; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; }
  .sub { font-size: 5.5pt; color: #333; line-height: 1; }
  img { max-width: 48mm; max-height: 14mm; margin-top: 0.4mm; }
</style></head>
<body>
  <div class="label">
    <div class="name">${escapeHtml(name)}</div>
    ${subtitle ? `<div class="sub">${escapeHtml(subtitle)}</div>` : ''}
    <img src="${dataUrl}" alt="${escapeHtml(assetCode)}" />
  </div>
  <script>window.onload=function(){window.focus();window.print();setTimeout(function(){window.close();},400);};</script>
</body></html>`);
    printWindow.document.close();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(11,34,53,0.28)] p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm overflow-hidden rounded-3xl border border-[rgba(0,65,106,0.08)] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[rgba(0,65,106,0.08)] px-4 py-3">
          <div className="text-sm font-bold text-[var(--color-brand-700)]">Etiqueta del equipo</div>
          <button type="button" onClick={onClose} className="rounded-full p-1 text-[var(--unilabor-neutral)] transition hover:bg-[rgba(191,212,230,0.28)]">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-4 p-5">
          <div className="flex flex-col items-center rounded-2xl border border-[rgba(0,65,106,0.1)] bg-[rgba(248,251,253,0.96)] p-4 text-center">
            <p className="text-sm font-bold text-[var(--unilabor-ink)]">{name}</p>
            {(brand || model) ? (
              <p className="text-xs text-[var(--unilabor-neutral)]">{[brand, model].filter(Boolean).join(' · ')}</p>
            ) : null}
            {error ? (
              <p className="mt-3 text-sm text-[#b02a2a]">No se pudo generar el codigo de barras.</p>
            ) : dataUrl ? (
              <img src={dataUrl} alt={assetCode} className="mt-2 max-w-full" />
            ) : null}
          </div>
          <p className="text-center text-xs text-[var(--unilabor-neutral)]">
            Codigo de barras Code128 · etiqueta de 50 × 25 mm (5 × 2.5 cm).
          </p>
          <button
            type="button"
            onClick={handlePrint}
            disabled={!dataUrl}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-brand-700)] px-3 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            <Printer size={16} /> Imprimir etiqueta
          </button>
        </div>
      </div>
    </div>
  );
};
