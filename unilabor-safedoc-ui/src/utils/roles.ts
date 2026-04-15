export const normalizeRole = (role?: string | null): string =>
  (role ?? '').trim().toUpperCase();

export const hasAnyRole = (
  role: string | null | undefined,
  allowedRoles: string[],
): boolean => {
  const normalizedRole = normalizeRole(role);
  return allowedRoles.some((allowedRole) => normalizeRole(allowedRole) === normalizedRole);
};
