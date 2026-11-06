/** La fecha de la visita viene del LIS como entero AAAAMMDD. */
export const lisDateToDisplay = (value: number | null | undefined): string => {
  if (!value || value < 10000101) {
    return '';
  }
  const text = String(value);
  return `${text.slice(6, 8)}/${text.slice(4, 6)}/${text.slice(0, 4)}`;
};

/** Mensaje de lista vacía según la causa: sin vínculo, XLab caído o simplemente sin avisos. */
export const notificationsEmptyMessage = (linked: boolean, available: boolean): string => {
  if (!linked) {
    return 'Tu usuario aún no está vinculado con XLab. Pide a Recursos Humanos que lo vincule para recibir tus notificaciones.';
  }
  if (!available) {
    return 'Las notificaciones no están disponibles por el momento. Intenta más tarde.';
  }
  return 'Aún no tienes notificaciones. Aquí llegarán las felicitaciones que los pacientes dejen para ti.';
};
