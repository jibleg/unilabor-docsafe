import type { ModuleCode } from '../types/models';

export const normalizeModuleCode = (value?: string | null): ModuleCode | null => {
  const normalizedValue = String(value ?? '').trim().toUpperCase();

  if (normalizedValue === 'QUALITY' || normalizedValue === 'RH') {
    return normalizedValue;
  }

  return null;
};

export const getModuleHomePath = (moduleCode: ModuleCode): string =>
  moduleCode === 'RH' ? '/rh' : '/quality/dashboard';
