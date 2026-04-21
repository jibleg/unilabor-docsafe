import { ArrowLeft, Loader2, Mail, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { getApiErrorMessage, requestTemporaryPasswordByEmail } from '../api/service';
import { FormFieldError } from '../components/FormFieldError';
import { useNativeFormValidation } from '../hooks/useNativeFormValidation';

const getRecoverPasswordSuccessMessage = (payload: unknown): string => {
  if (typeof payload === 'string' && payload.trim().length > 0) {
    return payload.trim();
  }

  if (typeof payload === 'object' && payload !== null && !Array.isArray(payload)) {
    const source = payload as Record<string, unknown>;
    const candidateKeys = ['message', 'detail', 'title'];

    for (const key of candidateKeys) {
      const value = source[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }
  }

  return 'Si el correo existe en el sistema, enviaremos una contrasena temporal a esa bandeja en unos minutos.';
};

export const ForgotPasswordPage = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const validation = useNativeFormValidation();

  const emailError = validation.getFieldError('email');
  const canSubmit = email.trim().length > 0 && !loading;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSuccessMessage('');

    setLoading(true);
    try {
      const response = await requestTemporaryPasswordByEmail(email);
      setSuccessMessage(getRecoverPasswordSuccessMessage(response));
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No se pudo solicitar la contrasena temporal'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fbfd_0%,#eef5fa_52%,#dbe8f2_100%)] px-6 py-10 text-[var(--unilabor-ink)] sm:px-10">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-5xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-[2rem] border border-[rgba(0,65,106,0.08)] bg-white/90 shadow-2xl shadow-[rgba(0,65,106,0.12)] backdrop-blur-xl lg:grid-cols-[1.1fr_0.9fr]">
          <section className="relative hidden overflow-hidden border-r border-[rgba(0,65,106,0.08)] bg-[linear-gradient(135deg,#ffffff_0%,#eef5fa_52%,#dbe8f2_100%)] p-8 lg:block">
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,transparent_0%,rgba(255,255,255,0.04)_50%,transparent_100%)]" />
            <div className="relative z-10 flex h-full flex-col justify-between">
              <div>
                <div className="inline-flex items-center gap-3 rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/88 px-4 py-2 shadow-xl shadow-[rgba(0,65,106,0.08)]">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-brand-200)] font-black text-[var(--color-brand-700)]">
                    U
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.30em] text-[var(--unilabor-neutral)]">UNILABOR</p>
                    <h1 className="text-lg font-semibold text-[var(--color-brand-700)]">Recuperacion segura</h1>
                  </div>
                </div>

                <div className="mt-10 max-w-xl">
                  <p className="text-sm uppercase tracking-[0.35em] text-[var(--color-brand-500)]">
                    Acceso controlado
                  </p>

                  <p className="mt-5 text-base leading-8 text-[var(--unilabor-neutral)]">
                    Te enviaremos una clave temporal al correo institucional registrado y el sistema
                    te pedira cambiarla en el siguiente inicio de sesion.
                  </p>
                </div>
              </div>

              <div className="grid gap-4">
                <div className="rounded-2xl border border-[rgba(0,65,106,0.1)] bg-[rgba(191,212,230,0.28)] p-4">
                  <p className="text-sm font-semibold text-[var(--color-brand-700)]">Revisa spam o correo no deseado</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--unilabor-neutral)]">
                    Algunos servidores pueden tardar unos minutos en entregar la contrasena temporal.
                  </p>
                </div>
                <div className="rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/84 p-4">
                  <p className="text-sm font-semibold text-[var(--color-brand-700)]">Proteccion de cuenta</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--unilabor-neutral)]">
                    La nueva clave temporal invalida la anterior y fuerza un cambio inmediato al entrar.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="p-8 sm:p-10">
            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.12)] bg-white/92 px-3 py-2 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
            >
              <ArrowLeft size={14} />
              Volver al login
            </Link>

            <div className="mt-8">
              <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(0,65,106,0.1)] bg-[rgba(191,212,230,0.32)] px-3 py-1 text-xs font-semibold text-[var(--color-brand-700)]">
                <ShieldCheck size={14} />
                Recuperacion por correo
              </div>

              <h2 className="mt-4 text-3xl font-bold tracking-tight text-[var(--color-brand-700)]">
                Olvide mi contrasena
              </h2>
              <p className="mt-3 max-w-md text-sm leading-6 text-[var(--unilabor-neutral)]">
                Ingresa tu correo institucional para enviar una contrasena temporal al email
                registrado.
              </p>
            </div>

            <form
              onSubmit={handleSubmit}
              onInvalidCapture={validation.handleInvalid}
              onChangeCapture={validation.handleChange}
              className="mt-8 space-y-5"
            >
              {error && (
                <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                  {error}
                </div>
              )}

              {successMessage && (
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                  {successMessage}
                </div>
              )}

              <div>
                <label className="mb-2 block text-sm font-medium text-[var(--color-brand-700)]">
                  Correo institucional <span className="text-rose-300">*</span>
                </label>
                <div className="relative">
                  <Mail
                    size={18}
                    className={`pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 ${
                      emailError ? 'text-rose-500' : 'text-slate-500'
                    }`}
                  />
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="usuario@unilabor.com"
                    data-value-missing="Ingresa tu correo institucional."
                    data-type-mismatch="Ingresa un correo institucional valido."
                    {...validation.getFieldProps('email')}
                    className={`w-full rounded-2xl border pl-11 pr-4 py-3.5 text-sm outline-none transition ${
                      emailError
                        ? 'border-rose-300 bg-rose-50 text-[var(--unilabor-ink)] placeholder:text-rose-300 focus:border-rose-400 focus:ring-2 focus:ring-rose-500/20'
                        : 'border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] text-[var(--unilabor-ink)] focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]'
                    }`}
                  />
                </div>
                <FormFieldError id="email-error" message={emailError} />
              </div>

              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full rounded-2xl bg-[linear-gradient(135deg,#00416a_0%,#0069a6_58%,#7cadd3_100%)] px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-[rgba(0,65,106,0.24)] transition hover:-translate-y-0.5 hover:brightness-105 disabled:cursor-not-allowed disabled:translate-y-0 disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none"
              >
                {loading ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 size={18} className="animate-spin" />
                    Enviando solicitud...
                  </span>
                ) : (
                  'Enviar contrasena temporal'
                )}
              </button>
            </form>

            <div className="mt-6 rounded-2xl border border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.9)] p-4 text-xs leading-6 text-[var(--unilabor-neutral)]">
              Usa el mismo correo con el que inicias sesion normalmente. Si la cuenta existe,
              recibirás una contrasena temporal y luego deberás actualizarla al entrar.
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
