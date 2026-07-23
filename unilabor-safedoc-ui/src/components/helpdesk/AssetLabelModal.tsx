import { useMemo } from 'react';
import { Printer, X } from 'lucide-react';
import {
  LABEL_PRINT_STYLES,
  buildBarcodeDataUrl,
  codeFontSizePt,
  renderLabelHtml,
} from './assetLabel';

interface AssetLabelModalProps {
  assetCode: string;
  name: string;
  brand?: string | null;
  model?: string | null;
  onClose: () => void;
}

export const AssetLabelModal = ({ assetCode, name, brand, model, onClose }: AssetLabelModalProps) => {
  const dataUrl = useMemo(() => buildBarcodeDataUrl(assetCode), [assetCode]);
  const error = !dataUrl;

  const handlePrint = () => {
    if (!dataUrl) {
      return;
    }
    const printWindow = window.open('', '_blank', 'width=480,height=360');
    if (!printWindow) {
      return;
    }
    printWindow.document.write(`<!DOCTYPE html>
<html><head><meta charset="utf-8" /><title>Etiqueta ${assetCode}</title>
<style>${LABEL_PRINT_STYLES}</style></head>
<body>
  ${renderLabelHtml({ assetCode, name, brand, model }, dataUrl)}
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
          {/* La vista previa respeta la jerarquia de la impresion: el codigo
              manda, el nombre acompana. */}
          <div className="flex flex-col items-center rounded-2xl border border-[rgba(0,65,106,0.1)] bg-[rgba(248,251,253,0.96)] p-4 text-center">
            <p
              className="font-extrabold leading-none tracking-tight text-[var(--unilabor-ink)]"
              style={{ fontSize: `${codeFontSizePt(assetCode) * 1.6}px` }}
            >
              {assetCode}
            </p>
            {error ? (
              <p className="mt-3 text-sm text-[#b02a2a]">No se pudo generar el codigo de barras.</p>
            ) : (
              <img src={dataUrl} alt={assetCode} className="mt-2 max-h-16 max-w-full" />
            )}
            <p className="mt-1 text-xs font-semibold text-[var(--unilabor-ink)]">{name}</p>
            {(brand || model) ? (
              <p className="text-[11px] text-[var(--unilabor-neutral)]">{[brand, model].filter(Boolean).join(' · ')}</p>
            ) : null}
          </div>
          <p className="text-center text-xs text-[var(--unilabor-neutral)]">
            Codigo de barras Code128 · etiqueta de 50 × 25 mm (5 × 2.5 cm).
          </p>
          <button
            type="button"
            onClick={handlePrint}
            disabled={!dataUrl}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-brand-700)] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            <Printer size={16} />
            Imprimir etiqueta
          </button>
        </div>
      </div>
    </div>
  );
};
