import type { ModuleAccess, ModuleCode } from '../types/models';

export const normalizeModuleCode = (value?: string | null): ModuleCode | null => {
  const normalizedValue = String(value ?? '').trim().toUpperCase();

  if (normalizedValue === 'QUALITY' || normalizedValue === 'RH') {
    return normalizedValue;
  }

  return null;
};

export const getModuleHomePath = (moduleCode: ModuleCode): string =>
  moduleCode === 'RH' ? '/rh' : '/quality/dashboard';

export const getModuleAccess = (
  availableModules: ModuleAccess[],
  moduleCode?: ModuleCode | null,
): ModuleAccess | null => {
  const normalizedModuleCode = normalizeModuleCode(moduleCode ?? null);
  if (!normalizedModuleCode) {
    return null;
  }

  return (
    availableModules.find((moduleAccess) => moduleAccess.code === normalizedModuleCode) ?? null
  );
};

export const getModuleRole = (
  availableModules: ModuleAccess[],
  moduleCode?: ModuleCode | null,
): string | null => getModuleAccess(availableModules, moduleCode)?.role ?? null;
