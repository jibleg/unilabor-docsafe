import { describe, expect, it } from 'vitest';
import { describeEmployeeDeactivationImpact } from './employeeDeactivationImpact';

describe('describeEmployeeDeactivationImpact', () => {
  it('con usuario y vínculo avisa de la cuenta y de XLab', () => {
    const text = describeEmployeeDeactivationImpact({ full_name: 'María Peña', user_id: 'u-1', xlab_linked: true });
    expect(text).toContain('María Peña saldrá de Colaboradores');
    expect(text).toContain('Su cuenta de DocSafe seguirá activa.');
    expect(text).toContain('Se quitará su vínculo con XLab');
    expect(text).toContain('No hay opción para revertir');
  });

  it('sin usuario ni vínculo omite esos avisos', () => {
    const text = describeEmployeeDeactivationImpact({ full_name: 'José Núñez', user_id: null, xlab_linked: false });
    expect(text).not.toContain('cuenta de DocSafe');
    expect(text).not.toContain('XLab');
    expect(text).toContain('No hay opción para revertir');
  });
});
