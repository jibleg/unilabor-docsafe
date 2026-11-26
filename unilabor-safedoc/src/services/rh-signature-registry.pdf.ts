import type { PDFImage } from 'pdf-lib';
import {
  FORM_BOTTOM,
  FORM_COLORS,
  FORM_CONTENT_W,
  FORM_MARGIN,
  columnLayout,
  createFormPdfKit,
  drawFormHeader,
  drawFormSignatures,
  formatFormDate,
  type Rgb,
} from './rh-form-pdf.kit';
import type { SignatureRegistryTone } from './rh-signature-registry.rules';
import type { SignatureRegistryListing, SignatureRegistryRow } from './rh-signature-registry.service';

/**
 * PDF del Registro de firmas autorizadas REH-REG-027 con el diseno del formato
 * controlado en Excel: carta horizontal, encabezado (logo, titulo y cuadro
 * codigo / vigencia / revision), leyenda del formato, tabla de 13 columnas con
 * los especimenes de firma y rubrica embebidos, colores por estado y FIRMAS.
 */

export const SIGNATURE_REGISTRY_FORM = {
  code: 'REH-REG-027',
  title: 'REGISTRO DE FIRMAS AUTORIZADAS',
  valid_from: '30/07/2026',
  revision_label: '1 (Uno)',
  statement:
    'Ninguna persona firma un informe de resultados ni un registro del sistema antes de quedar asentada aquí. Una fila se llena cuando se otorga la autorización y se actualiza cada vez que el alcance cambia, cuando se evalúa de nuevo la competencia y cuando la persona causa baja. La columna ESTADO se calcula sola.',
  signers: [
    { heading: 'RESPONSABLE DE ELABORACIÓN', name: 'T.L.C. Ursula Guadalupe Méndez Cuevas', role: 'Coordinador de Recursos Humanos' },
    // El formato deja el nombre de quien revisa en blanco.
    { heading: 'REVISÓ', name: '', role: 'Coordinador de Procedimientos Analíticos' },
    { heading: 'APROBÓ', name: 'Q.F.B. Guillermo Priego Hernández', role: 'Director General' },
  ],
} as const;

// Anchos de las 13 columnas en las proporciones del Excel (B..N).
// FIRMA y RUBRICA van mas anchas que en el Excel para que el trazo se lea.
const LAYOUT = columnLayout([5, 29, 25, 13, 18, 12, 30, 28, 26, 14, 16, 15, 17]);
const { widths: COL_W, xs: COL_X, span } = LAYOUT;

const HEADERS = [
  'No.',
  'NOMBRE COMPLETO',
  'PUESTO',
  'SUCURSAL',
  'DISCIPLINA O ÁREA\n(cuando aplique)',
  '¿ES RESPONSABLE\nDE DISCIPLINA?',
  'ACTIVIDADES Y DOCUMENTOS\nQUE ESTÁ AUTORIZADA A FIRMAR',
  'FIRMA',
  'RÚBRICA',
  'FECHA DE ALTA',
  'FECHA DE LA ÚLTIMA\nEVALUACIÓN DE\nCOMPETENCIA\n(REH-REG-003)',
  'FECHA DE BAJA O\nDE CAMBIO DE ALCANCE',
  'ESTADO',
];

const ROW_H = 36;
const HEADER_ROW_H = 32;

const TONE_STYLE: Record<SignatureRegistryTone, { fill: Rgb; color: Rgb }> = {
  green: { fill: FORM_COLORS.GREEN, color: FORM_COLORS.GREEN_TEXT },
  amber: { fill: FORM_COLORS.YELLOW, color: FORM_COLORS.AMBER_TEXT },
  red: { fill: FORM_COLORS.RED, color: FORM_COLORS.RED_TEXT },
  gray: { fill: FORM_COLORS.GRAY, color: FORM_COLORS.GRAY_TEXT },
};

export interface SignatureRegistryPdfOptions {
  /** PNG de cada especimen por id (los que falten salen en blanco). */
  specimenImages?: Map<number, Buffer>;
}

export const buildSignatureRegistryPdf = async (listing: SignatureRegistryListing, generatedAt: Date, options: SignatureRegistryPdfOptions = {}): Promise<Buffer> => {
  const kit = await createFormPdfKit(`${SIGNATURE_REGISTRY_FORM.code} ${SIGNATURE_REGISTRY_FORM.title} - corte ${formatFormDate(listing.cutoff_date)}`);

  // Los especimenes se embeben una sola vez aunque el colaborador tenga varias filas.
  const embedded = new Map<number, PDFImage | null>();
  const specimenImage = async (id: number | null): Promise<PDFImage | null> => {
    if (id === null) return null;
    if (embedded.has(id)) return embedded.get(id)!;
    const bytes = options.specimenImages?.get(id);
    const image = bytes ? await kit.doc.embedPng(bytes).catch(() => null) : null;
    embedded.set(id, image);
    return image;
  };

  const drawStatement = () => {
    const h = 24;
    const y = kit.y();
    kit.box(FORM_MARGIN, y, FORM_CONTENT_W, h, FORM_COLORS.BLUE_SOFT);
    kit.cell(SIGNATURE_REGISTRY_FORM.statement, FORM_MARGIN, y, FORM_CONTENT_W, h, { font: kit.italic, size: 6.5, maxLines: 3 });
    kit.advance(h);
    const cutoffH = 12;
    const labelW = span(0, 1);
    kit.band('FECHA DE CORTE', FORM_MARGIN, kit.y(), labelW, cutoffH);
    kit.box(FORM_MARGIN + labelW, kit.y(), COL_W[2]!, cutoffH, FORM_COLORS.GRAY_SOFT);
    kit.cell(formatFormDate(listing.cutoff_date), FORM_MARGIN + labelW, kit.y(), COL_W[2]!, cutoffH, { font: kit.bold, size: 7 });
    kit.box(FORM_MARGIN + labelW + COL_W[2]!, kit.y(), FORM_CONTENT_W - labelW - COL_W[2]!, cutoffH);
    kit.cell(
      `${listing.summary.rows_total} filas · ${listing.summary.people_total} colaboradores · una fila por colaborador y puesto autorizado`,
      FORM_MARGIN + labelW + COL_W[2]!,
      kit.y(),
      FORM_CONTENT_W - labelW - COL_W[2]!,
      cutoffH,
      { size: 6, align: 'left', color: FORM_COLORS.MUTED, maxLines: 1 },
    );
    kit.advance(cutoffH + 8);
  };

  const drawTableHeader = () => {
    HEADERS.forEach((label, index) => {
      kit.box(COL_X[index]!, kit.y(), COL_W[index]!, HEADER_ROW_H, FORM_COLORS.NAVY);
      kit.cell(label, COL_X[index]!, kit.y(), COL_W[index]!, HEADER_ROW_H, { font: kit.bold, size: 4.8, color: FORM_COLORS.WHITE, maxLines: 4 });
    });
    kit.advance(HEADER_ROW_H);
  };

  const drawRow = async (row: SignatureRegistryRow) => {
    const y = kit.y();
    const tone = TONE_STYLE[row.status_tone];
    const [signature, initials] = await Promise.all([specimenImage(row.signature_specimen?.id ?? null), specimenImage(row.initials_specimen?.id ?? null)]);
    const retiredFill = row.retired ? FORM_COLORS.GRAY_SOFT : undefined;
    const cells: Array<{ value: string; fill?: Rgb | undefined; font?: typeof kit.bold; color?: Rgb; align?: 'left' | 'center'; size?: number; maxLines?: number; image?: PDFImage | null }> = [
      { value: String(row.row_no), size: 5.5, fill: retiredFill },
      { value: row.full_name, font: kit.bold, align: 'left', fill: retiredFill },
      { value: row.position_name, fill: retiredFill },
      { value: row.branch_name ?? '', fill: retiredFill },
      { value: row.discipline_name ?? '', fill: retiredFill },
      { value: row.discipline_id ? (row.is_discipline_responsible ? 'Sí' : 'No') : '', font: kit.bold, fill: retiredFill },
      { value: row.signing_scope_text ?? '', align: 'left', size: 5.3, maxLines: 4, fill: retiredFill },
      { value: '', image: signature, fill: retiredFill },
      { value: '', image: initials, fill: retiredFill },
      { value: formatFormDate(row.start_date), fill: retiredFill ?? (row.start_date ? undefined : FORM_COLORS.YELLOW) },
      { value: formatFormDate(row.last_evaluation_date), fill: retiredFill ?? (row.last_evaluation_date ? undefined : FORM_COLORS.YELLOW) },
      { value: formatFormDate(row.end_or_change_date), fill: retiredFill },
      { value: row.status_label, font: kit.bold, size: 5.8, fill: tone.fill, color: tone.color },
    ];
    cells.forEach((entry, index) => {
      kit.box(COL_X[index]!, y, COL_W[index]!, ROW_H, entry.fill);
      if (entry.image) kit.image(entry.image, COL_X[index]!, y, COL_W[index]!, ROW_H, 3);
      else {
        kit.cell(entry.value, COL_X[index]!, y, COL_W[index]!, ROW_H, {
          font: entry.font ?? kit.regular,
          size: entry.size ?? 6.2,
          maxLines: entry.maxLines ?? 3,
          ...(entry.color ? { color: entry.color } : {}),
          ...(entry.align ? { align: entry.align } : {}),
        });
      }
    });
    kit.advance(ROW_H);
  };

  const drawSummary = () => {
    const rowH = 12;
    const { by_status: byStatus } = listing.summary;
    const entries: Array<{ label: string; value: number; tone: SignatureRegistryTone | null }> = [
      { label: 'Vigentes', value: byStatus.VIGENTE, tone: 'green' },
      { label: `Por vencer (${listing.warning_days} días o menos)`, value: byStatus.POR_VENCER, tone: 'amber' },
      { label: 'Vencidas', value: byStatus.VENCIDA, tone: 'red' },
      { label: 'Sin evaluación', value: byStatus.SIN_EVALUACION, tone: 'red' },
      { label: 'Incompletas', value: byStatus.INCOMPLETA, tone: 'red' },
      { label: 'Dadas de baja', value: byStatus.DADA_DE_BAJA, tone: 'gray' },
    ];
    if (kit.y() - (12 + rowH * entries.length + 12) < FORM_BOTTOM) kit.newPage();
    kit.band('RESUMEN', FORM_MARGIN, kit.y(), FORM_CONTENT_W, 12);
    kit.advance(12);
    const labelW = span(0, 2);
    const valueW = COL_W[3]!;
    for (const entry of entries) {
      const style = entry.tone ? TONE_STYLE[entry.tone] : null;
      kit.box(FORM_MARGIN, kit.y(), labelW, rowH, style?.fill);
      kit.cell(entry.label, FORM_MARGIN, kit.y(), labelW, rowH, { font: kit.bold, size: 6.5, align: 'left', maxLines: 1, ...(style ? { color: style.color } : {}) });
      kit.box(FORM_MARGIN + labelW, kit.y(), valueW, rowH, style?.fill);
      kit.cell(String(entry.value), FORM_MARGIN + labelW, kit.y(), valueW, rowH, { font: kit.bold, size: 8 });
      kit.box(FORM_MARGIN + labelW + valueW, kit.y(), FORM_CONTENT_W - labelW - valueW, rowH);
      kit.advance(rowH);
    }
    kit.advance(12);
  };

  drawFormHeader(kit, SIGNATURE_REGISTRY_FORM, span(0, 1), COL_W[11]!, COL_W[12]!);
  drawStatement();
  drawTableHeader();
  for (const row of listing.rows) {
    if (kit.y() - ROW_H < FORM_BOTTOM) {
      kit.newPage();
      drawTableHeader();
    }
    await drawRow(row);
  }
  kit.advance(12);
  drawSummary();
  drawFormSignatures(kit, SIGNATURE_REGISTRY_FORM.signers, [span(0, 3), span(4, 7), span(8, 12)]);
  kit.footer(SIGNATURE_REGISTRY_FORM.code, generatedAt);

  return Buffer.from(await kit.doc.save());
};
