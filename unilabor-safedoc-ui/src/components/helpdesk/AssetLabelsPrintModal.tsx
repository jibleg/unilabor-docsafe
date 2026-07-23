import { useMemo } from 'react';
import { Loader2, Printer, X } from 'lucide-react';
import {
  LABEL_PRINT_STYLES,
  buildBarcodeDataUrl,
  renderLabelHtml,
  type AssetLabelData,
} from './assetLabel';

export type { AssetLabelData };

interface AssetLabelsPrintModalProps {
  assets: AssetLabelData[];
  onClose: () => void;
}

// Impresión en lote: una etiqueta 50 × 25 mm por página, en una sola corrida.
// Reutiliza el mismo formato Code128 de la etiqueta individual (AssetLabelModal).
export const AssetLabelsPrintModal = ({ assets, onClose }: AssetLabelsPrintModalProps) => {
  const labels = useMemo(
    () =>
      assets.map((asset) => ({
        ...asset,
        dataUrl: buildBarcodeDataUrl(asset.assetCode),
      })),
    [assets],
  );

  const printable = labels.filter((label) => label.dataUrl);
  const failed = labels.length - printable.length;

  const handlePrint = () => {
    if (printable.length === 0) {
      return;
    }
    const printWindow = window.open('', '_blank', 'width=480,height=360');
    if (!printWindow) {
      return;
    }
    const labelsHtml = printable
      .map((label) => renderLabelHtml(label, label.dataUrl))
      .join('\n');

    printWindow.document.write(`<!DOCTYPE html>
<html><head><meta charset="utf-8" /><title>Etiquetas (${printable.length})</title>
<style>${LABEL_PRINT_STYLES}
  .label { page-break-after: always; break-after: page; }
  .label:last-child { page-break-after: auto; break-after: auto; }
</style></head>
<body>
  ${labelsHtml}
  <script>window.onload=function(){window.focus();window.print();setTimeout(function(){window.close();},600);};</script>
</body></html>`);
    printWindow.document.close();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(11,34,53,0.28)] p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-[rgba(0,65,106,0.08)] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[rgba(0,65,106,0.08)] px-4 py-3">
          <div className="text-sm font-bold text-[var(--color-brand-700)]">
            Etiquetas en lote ({printable.length})
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-[var(--unilabor-neutral)] transition hover:bg-[rgba(191,212,230,0.28)]"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
          <p className="text-sm text-[var(--unilabor-ink)]">
            Se imprimirán <strong>{printable.length}</strong> etiqueta(s) de 50 × 25 mm, una por página, en una sola corrida.
          </p>
          {failed > 0 ? (
            <p className="rounded-xl border border-[rgba(176,42,42,0.2)] bg-[rgba(176,42,42,0.06)] px-3 py-2 text-xs text-[#b02a2a]">
              {failed} activo(s) sin código válido no se incluirán.
            </p>
          ) : null}
          <ul className="divide-y divide-[rgba(0,65,106,0.08)] rounded-xl border border-[rgba(0,65,106,0.1)] bg-[rgba(248,251,253,0.96)]">
            {labels.map((label) => (
              <li key={label.assetCode} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-[var(--color-brand-700)]">{label.assetCode}</p>
                  <p className="truncate text-xs text-[var(--unilabor-neutral)]">{label.name}</p>
                </div>
                {label.dataUrl ? null : (
                  <span className="shrink-0 text-[10px] font-semibold uppercase text-[#b02a2a]">Sin código</span>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex justify-end gap-2 border-t border-[rgba(0,65,106,0.08)] px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[rgba(0,65,106,0.12)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
          >
            Cerrar
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={printable.length === 0}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--color-brand-700)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {printable.length === 0 ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
            Imprimir {printable.length} etiqueta(s)
          </button>
        </div>
      </div>
    </div>
  );
};
