import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import type { ModuleCode } from '../types/models';
import { getModuleHomePath } from '../utils/modules';

interface ModuleGuardProps {
  moduleCode: ModuleCode;
  children: ReactNode;
}

export const ModuleGuard = ({ moduleCode, children }: ModuleGuardProps) => {
  const token = useAuthStore((state) => state.token);
  const availableModules = useAuthStore((state) => state.availableModules);
  const activeModule = useAuthStore((state) => state.activeModule);
  const setActiveModule = useAuthStore((state) => state.setActiveModule);

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  const hasModuleAccess = availableModules.some((moduleAccess) => moduleAccess.code === moduleCode);

  if (!hasModuleAccess) {
    if (availableModules.length === 0) {
      return (
        <Navigate
          to="/login"
          replace
          state={{ message: 'Tu cuenta no tiene modulos habilitados.' }}
        />
      );
    }

    return <Navigate to={getModuleHomePath(availableModules[0].code)} replace />;
  }

  if (activeModule !== moduleCode) {
    setActiveModule(moduleCode);
  }

  return <>{children}</>;
};
