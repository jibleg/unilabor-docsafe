import { toast } from 'react-toastify';

const defaultToastOptions = {
  autoClose: 5000,
  closeOnClick: true,
  pauseOnHover: true,
  draggable: false,
} as const;

export const notifySuccess = (message: string) =>
  toast.success(message, defaultToastOptions);

export const notifyError = (message: string) =>
  toast.error(message, defaultToastOptions);

export const notifyInfo = (message: string) =>
  toast.info(message, defaultToastOptions);

export const notifyWarning = (message: string) =>
  toast.warning(message, defaultToastOptions);
