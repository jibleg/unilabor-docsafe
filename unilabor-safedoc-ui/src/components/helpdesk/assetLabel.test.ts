import { describe, expect, it } from 'vitest';
import { LABEL_PRINT_STYLES, codeFontSizePt, renderLabelHtml } from './assetLabel';

// Tamano del nombre del activo en la etiqueta impresa (.name en los estilos).
const NAME_FONT_PT = 6;

const label = {
  assetCode: 'A-IT-LAB_EQUIPMENT-001',
  name: 'Microscopio binocular Olympus CX23',
  brand: 'Olympus',
  model: 'CX23',
};

describe('codeFontSizePt', () => {
  it('el codigo SIEMPRE es mas grande que el nombre del activo', () => {
    // Es la regla de la etiqueta: el codigo manda. Hasta el codigo mas largo
    // del inventario (22 caracteres) se imprime por encima del nombre.
    const codes = ['A-1', 'A-REC-EQC-001', 'A-REC-EQC-001-002', 'A-IT-LAB_EQUIPMENT-001', 'X'.repeat(40)];
    for (const code of codes) {
      expect(codeFontSizePt(code)).toBeGreaterThan(NAME_FONT_PT);
    }
  });

  it('encoge conforme el codigo se alarga, para no desbordar los 50 mm', () => {
    expect(codeFontSizePt('A-1')).toBeGreaterThan(codeFontSizePt('A-REC-EQC-001'));
    expect(codeFontSizePt('A-REC-EQC-001')).toBeGreaterThan(codeFontSizePt('A-REC-EQC-001-002'));
    expect(codeFontSizePt('A-REC-EQC-001-002')).toBeGreaterThan(
      codeFontSizePt('A-IT-LAB_EQUIPMENT-001'),
    );
  });
});

describe('renderLabelHtml', () => {
  it('coloca el codigo antes que el nombre', () => {
    const html = renderLabelHtml(label, 'data:image/png;base64,AAA');
    expect(html.indexOf('class="code"')).toBeLessThan(html.indexOf('class="name"'));
  });

  it('imprime el codigo con el tamano que le toca por su largo', () => {
    const html = renderLabelHtml(label, 'data:image/png;base64,AAA');
    expect(html).toContain(`font-size:${codeFontSizePt(label.assetCode)}pt`);
  });

  it('escapa el contenido para no romper el HTML de impresion', () => {
    const html = renderLabelHtml(
      { ...label, name: 'Equipo <script>alert("x")</script>' },
      'data:image/png;base64,AAA',
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('omite la linea de marca/modelo cuando no hay ninguno', () => {
    const html = renderLabelHtml(
      { assetCode: 'A-1', name: 'Equipo', brand: null, model: null },
      'data:image/png;base64,AAA',
    );
    expect(html).not.toContain('class="sub"');
  });
});

describe('LABEL_PRINT_STYLES', () => {
  it('mantiene el nombre en 6pt: si sube, la regla del codigo deja de cumplirse', () => {
    expect(LABEL_PRINT_STYLES).toContain(`.name { font-size: ${NAME_FONT_PT}pt`);
  });
});
