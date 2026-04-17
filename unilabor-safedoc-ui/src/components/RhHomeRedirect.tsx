import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { getModuleRole } from '../utils/modules';

export const RhHomeRedirect = () => {
  const availableModules = useAuthStore((state) => state.availableModules);
  const role = getModuleRole(availableModules, 'RH') ?? 'VIEWER';

  if (role === 'VIEWER') {
    return <Navigate to="/rh/my-expedient" replace />;
  }

  return <Navigate to="/rh/dashboard" replace />;
};
