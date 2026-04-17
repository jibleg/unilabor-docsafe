import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { hasAnyRole } from '../utils/roles';
import { getModuleHomePath } from '../utils/modules';

interface RoleGateProps {
  allowedRoles: string[];
  children: ReactNode;
  redirectTo?: string;
}

export const RoleGate = ({
  allowedRoles,
  children,
  redirectTo,
}: RoleGateProps) => {
  const token = useAuthStore((state) => state.token);
  const userRole = useAuthStore((state) => state.user?.role);
  const activeModule = useAuthStore((state) => state.activeModule);

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (!hasAnyRole(userRole, allowedRoles)) {
    return <Navigate to={redirectTo ?? getModuleHomePath(activeModule ?? 'QUALITY')} replace />;
  }

  return <>{children}</>;
};
