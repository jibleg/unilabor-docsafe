import { useState } from 'react';
import { Lock, ShieldCheck, Loader2 } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { changePassword, getApiErrorMessage } from '../api/service';
import { FormFieldError } from '../components/FormFieldError';
import { useNativeFormValidation } from '../hooks/useNativeFormValidation';
import { useAuthStore } from '../store/useAuthStore';
import { tokenRequiresPasswordChange } from '../utils/auth';

export const ChangePasswordPage = () => {
  const navigate = useNavigate();
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const validation = useNativeFormValidation();

  const newPasswordError = validation.getFieldError('newPassword');
  const confirmPasswordError = validation.getFieldError('confirmPassword');

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  const mustChangePassword = user?.mustChangePassword || tokenRequiresPasswordChange(token);
  if (!mustChangePassword) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccessMessage('');

    if (newPassword.length < 8) {
      setError('La nueva contrasena debe tener al menos 8 caracteres');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Las contrasenas no coinciden');
      return;
    }

    setLoading(true);
    try {
      await changePassword(newPassword);
      setSuccessMessage('Contrasena actualizada. Redirigiendo al inicio de sesion...');
      logout();
      navigate('/login', {
        replace: true,
        state: {
          message: 'Contrasena actualizada correctamente. Inicia sesion con tu nueva clave.',
        },
      });
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'No se pudo actualizar la contrasena'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-6 py-10 sm:px-10">
      <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900/80 backdrop-blur-xl shadow-2xl p-8 sm:p-10">
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-300">
          <ShieldCheck size={14} /> Cambio obligatorio
        </div>

        <h1 className="mt-4 text-3xl font-bold tracking-tight">Actualiza tu contrasena</h1>
        <p className="mt-3 text-sm text-slate-400 leading-6">
          Tu cuenta usa una contrasena temporal. Debes crear una nueva para continuar.
        </p>

        <form
          onSubmit={handleSubmit}
          onInvalidCapture={validation.handleInvalid}
          onChangeCapture={validation.handleChange}
          className="mt-8 space-y-5"
        >
          {error && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {successMessage && (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
              {successMessage}
            </div>
          )}

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-300">
              Nueva contrasena <span className="text-rose-300">*</span>
            </label>
            <div className="relative">
              <Lock
                className={`pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 ${
                  newPasswordError ? 'text-rose-300' : 'text-slate-500'
                }`}
                size={18}
              />
              <input
                type="password"
                required
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="NuevaClaveSegura123*"
                data-value-missing="Ingresa tu nueva contrasena."
                {...validation.getFieldProps('newPassword')}
                className={`w-full rounded-2xl border pl-11 pr-4 py-3.5 text-sm outline-none transition ${
                  newPasswordError
                    ? 'border-rose-500/60 bg-rose-950/20 text-slate-50 placeholder:text-rose-200/40 focus:border-rose-400 focus:ring-2 focus:ring-rose-500/20'
                    : 'border-slate-700 bg-slate-950 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20'
                }`}
              />
            </div>
            <FormFieldError id="newPassword-error" message={newPasswordError} />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-300">
              Confirmar contrasena <span className="text-rose-300">*</span>
            </label>
            <div className="relative">
              <Lock
                className={`pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 ${
                  confirmPasswordError ? 'text-rose-300' : 'text-slate-500'
                }`}
                size={18}
              />
              <input
                type="password"
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Repite la nueva contrasena"
                data-value-missing="Confirma tu nueva contrasena."
                {...validation.getFieldProps('confirmPassword')}
                className={`w-full rounded-2xl border pl-11 pr-4 py-3.5 text-sm outline-none transition ${
                  confirmPasswordError
                    ? 'border-rose-500/60 bg-rose-950/20 text-slate-50 placeholder:text-rose-200/40 focus:border-rose-400 focus:ring-2 focus:ring-rose-500/20'
                    : 'border-slate-700 bg-slate-950 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20'
                }`}
              />
            </div>
            <FormFieldError id="confirmPassword-error" message={confirmPasswordError} />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-cyan-500 px-4 py-3.5 text-sm font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:-translate-y-0.5 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 size={18} className="animate-spin" /> Actualizando...
              </span>
            ) : (
              'Guardar nueva contrasena'
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
