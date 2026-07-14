import { useAuthStore } from '../store/useAuthStore';

const normalize = (code: string): string => code.trim().toUpperCase();

// Autoriza si el set de permisos contiene AL MENOS UNO de los requeridos
// (semantica OR), igual que el guard requirePermission del backend.
export const hasPermission = (
  permissions: string[] | null | undefined,
  required: string | string[],
): boolean => {
  const granted = new Set((permissions ?? []).map(normalize));
  const requiredCodes = (Array.isArray(required) ? required : [required]).map(normalize);
  return requiredCodes.some((code) => granted.has(code));
};

// Hook reactivo: recalcula cuando cambian los permisos en el store.
export const useHasPermission = (required: string | string[]): boolean => {
  const permissions = useAuthStore((state) => state.permissions);
  return hasPermission(permissions, required);
};
