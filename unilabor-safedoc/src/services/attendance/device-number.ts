/**
 * Numero de empleado en el reloj (employeeNo de HikVision): solo digitos. El equipo rechaza letras y guiones
 * ("badJsonContent / employeeNo"), por eso DocSafe no los permite. Maximo 20 (limite de la columna).
 */
export const DEVICE_NUMBER_PATTERN = /^[0-9]{1,20}$/;

export const isDeviceNumber = (value: string | null | undefined): boolean => DEVICE_NUMBER_PATTERN.test((value ?? '').trim());

export const DEVICE_NUMBER_MESSAGE = 'Numero de empleado invalido: solo digitos (1-20); el reloj no acepta letras ni guiones.';
