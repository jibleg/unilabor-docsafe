import { Loader2 } from 'lucide-react';

interface TabStatusProps {
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  label?: string;
}

/** Estado de carga o error con Reintentar; devuelve null cuando no aplica. */
export const TabStatus = ({ loading, error, onRetry, label = 'Cargando…' }: TabStatusProps) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500">
        <Loader2 className="animate-spin" size={18} /> {label}
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">
        No se pudo cargar la información.{' '}
        <button type="button" onClick={onRetry} className="font-semibold underline">Reintentar</button>
      </div>
    );
  }
  return null;
};
