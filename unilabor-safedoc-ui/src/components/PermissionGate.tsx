import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { hasPermission } from '../utils/permissions';
import { getModuleHomePath } from '../utils/modules';

interface PermissionGateProps {
  // Autoriza si el usuario tiene AL MENOS UNO de estos permisos (OR).
  permission: string | string[];
  children: ReactNode;
  redirectTo?: string;
}

// Guard de ruta por permiso efectivo (RBAC). Complementa a RoleGate (por rol de
// modulo) para las superficies ya migradas a permisos por accion.
export const PermissionGate = ({ permission, children, redirectTo }: PermissionGateProps) => {
  const token = useAuthStore((state) => state.token);
  const activeModule = useAuthStore((state) => state.activeModule);
  const permissions = useAuthStore((state) => state.permissions);

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (!hasPermission(permissions, permission)) {
    return <Navigate to={redirectTo ?? getModuleHomePath(activeModule ?? 'QUALITY')} replace />;
  }

  return <>{children}</>;
};
