import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { hasAnyRole } from '../utils/roles';

interface RoleGateProps {
  allowedRoles: string[];
  children: ReactNode;
  redirectTo?: string;
}

export const RoleGate = ({
  allowedRoles,
  children,
  redirectTo = '/dashboard',
}: RoleGateProps) => {
  const token = useAuthStore((state) => state.token);
  const userRole = useAuthStore((state) => state.user?.role);

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (!hasAnyRole(userRole, allowedRoles)) {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
};
