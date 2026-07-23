import JsBarcode from 'jsbarcode';

// Formato unico de la etiqueta de activo (50 × 25 mm), compartido por la
// etiqueta individual y la impresion en lote.
//
// Jerarquia: el CODIGO manda. Es lo que se busca con la vista y lo que se teclea
// o escanea al inventariar, asi que va primero y con la letra mas grande de la
// etiqueta; el nombre del activo queda como apoyo.

export interface AssetLabelData {
  assetCode: string;
  name: string;
  brand?: string | null;
  model?: string | null;
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * El codigo se imprime tan grande como quepa: los del inventario van de 3 a 22
 * caracteres, y un tamano fijo o desbordaria los 48 mm utiles o desperdiciaria
 * la etiqueta en los codigos cortos.
 */
export const codeFontSizePt = (assetCode: string): number => {
  const length = assetCode.trim().length;
  if (length <= 10) {
    return 16;
  }
  if (length <= 14) {
    return 14;
  }
  if (length <= 18) {
    return 12;
  }
  if (length <= 22) {
    return 10;
  }
  return 8.5;
};

/**
 * El codigo de barras ya NO dibuja el texto: lo ponemos nosotros arriba y mucho
 * mas grande, y repetirlo dos veces solo robaria alto a la etiqueta.
 */
export const buildBarcodeDataUrl = (assetCode: string): string => {
  const canvas = document.createElement('canvas');
  try {
    JsBarcode(canvas, assetCode, {
      format: 'CODE128',
      displayValue: false,
      height: 55,
      margin: 4,
    });
    return canvas.toDataURL('image/png');
  } catch {
    return '';
  }
};

export const LABEL_PRINT_STYLES = `
  @page { size: 50mm 25mm; margin: 0; }
  html, body { margin: 0; padding: 0; }
  .label {
    width: 50mm; height: 25mm; box-sizing: border-box; padding: 1mm;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    font-family: Arial, Helvetica, sans-serif; text-align: center;
  }
  .code {
    font-family: 'Arial Narrow', Arial, sans-serif;
    font-weight: 800; line-height: 1; letter-spacing: 0.2px;
    max-width: 48mm; white-space: nowrap; overflow: hidden;
  }
  img { max-width: 48mm; max-height: 9mm; margin-top: 0.6mm; }
  .name { font-size: 6pt; font-weight: 600; line-height: 1.05; max-width: 48mm; margin-top: 0.4mm;
    overflow: hidden; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; }
  .sub { font-size: 5pt; color: #333; line-height: 1; }
`;

/** Una etiqueta lista para imprimir. El tamano del codigo depende de su largo. */
export const renderLabelHtml = (label: AssetLabelData, dataUrl: string): string => {
  const subtitle = [label.brand, label.model].filter(Boolean).join(' · ');
  return `<div class="label">
    <div class="code" style="font-size:${codeFontSizePt(label.assetCode)}pt">${escapeHtml(
      label.assetCode,
    )}</div>
    <img src="${dataUrl}" alt="${escapeHtml(label.assetCode)}" />
    <div class="name">${escapeHtml(label.name)}</div>
    ${subtitle ? `<div class="sub">${escapeHtml(subtitle)}</div>` : ''}
  </div>`;
};
