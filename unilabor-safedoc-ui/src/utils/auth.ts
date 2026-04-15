const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

const decodeBase64Url = (input: string): string => {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return atob(padded);
};

export const decodeJwtPayload = (token: string): Record<string, unknown> | null => {
  const parts = token.split('.');
  if (parts.length < 2 || !parts[1]) {
    return null;
  }

  try {
    const payloadText = decodeBase64Url(parts[1]);
    const payload = JSON.parse(payloadText) as unknown;
    return asRecord(payload);
  } catch {
    return null;
  }
};

export const tokenRequiresPasswordChange = (token: string): boolean => {
  const payload = decodeJwtPayload(token);
  if (!payload) {
    return false;
  }

  const raw = payload.mustChangePassword ?? payload.must_change_password;
  return raw === true || raw === 1;
};
