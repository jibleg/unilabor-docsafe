import { AlertCircle } from 'lucide-react';

interface FormFieldErrorProps {
  id: string;
  message?: string;
}

export const FormFieldError = ({ id, message }: FormFieldErrorProps) => {
  if (!message) {
    return null;
  }

  return (
    <div
      id={id}
      role="alert"
      className="mt-2 flex items-start gap-2 rounded-2xl border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-200 shadow-lg shadow-slate-950/20"
    >
      <AlertCircle size={14} className="mt-0.5 shrink-0 text-rose-300" />
      <span>{message}</span>
    </div>
  );
};
