// Helpers 100% genericos, sin dependencia de ningun dominio en particular.
// Compartidos por provider-controller.shared.ts, client-controller.shared.ts
// y classification.controller.ts para no duplicarlos.

export const getText = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
};

// Fecha opcional en formato YYYY-MM-DD; vacio/ausente -> null.
export const getOptionalDate = (value: unknown): string | null => {
  const text = getText(value);
  if (!text) {
    return null;
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
};

export const getNumberId = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return null;
  }

  return parsedValue;
};
