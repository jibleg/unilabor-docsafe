import type { Employee } from '../../types/models';

/** Texto del modal de Inactivar. Debe seguir lo que hace la baja en el backend (deactivateEmployee). */
export const describeEmployeeDeactivationImpact = (employee: Pick<Employee, 'full_name' | 'user_id' | 'xlab_linked'>): string =>
  [
    `${employee.full_name} saldrá de Colaboradores, inducción y asistencias. Su expediente quedará solo de consulta para RH y administradores; no se borra ningún documento.`,
    'Si firma borradores ANA-REG-060, pasarán al siguiente responsable.',
    employee.user_id ? 'Su cuenta de DocSafe se desactivará y ya no podrá entrar.' : null,
    employee.xlab_linked ? 'Se quitará su vínculo con XLab y dejará de ver sus notificaciones de Contigo+.' : null,
    'No hay opción para revertir la baja desde el sistema.',
  ]
    .filter(Boolean)
    .join(' ');
