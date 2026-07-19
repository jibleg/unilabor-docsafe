import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { hasPermission } from '../utils/permissions';

// Home del modulo Administracion: manda a la primera pagina que el usuario
// pueda ver segun sus permisos efectivos (un admin puede tener solo un subset,
// p. ej. auditoria). Evita aterrizar en una pagina bloqueada.
export const AdminHomeRedirect = () => {
  const permissions = useAuthStore((state) => state.permissions);

  if (hasPermission(permissions, 'ADMIN.USERS.READ')) {
    return <Navigate to="/admin/users" replace />;
  }

  if (hasPermission(permissions, 'ADMIN.ROLES.MANAGE')) {
    return <Navigate to="/admin/roles" replace />;
  }

  if (hasPermission(permissions, 'ADMIN.AUDIT.READ')) {
    return <Navigate to="/admin/audit" replace />;
  }

  return <Navigate to="/admin/profile" replace />;
};
