import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { hasAnyRole } from '../utils/roles';
import { getModuleHomePath, getModuleRole } from '../utils/modules';

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
  const activeModule = useAuthStore((state) => state.activeModule);
  const availableModules = useAuthStore((state) => state.availableModules);
  const userRole = getModuleRole(availableModules, activeModule);

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (!hasAnyRole(userRole, allowedRoles)) {
    return <Navigate to={redirectTo ?? getModuleHomePath(activeModule ?? 'QUALITY')} replace />;
  }

  return <>{children}</>;
};
