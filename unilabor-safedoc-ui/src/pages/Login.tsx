import { useEffect, useState } from 'react';
import { Loader2, Lock, Mail } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { getApiErrorMessage, login } from '../api/service';
import { FormFieldError } from '../components/FormFieldError';
import { useNativeFormValidation } from '../hooks/useNativeFormValidation';
import { useAuthStore } from '../store/useAuthStore';
import unilaborIcon from '../assets/icono-UNILABOR.png';
import loginPageBackground from '../assets/login-page-v1.png';
import { getModuleHomePath } from '../utils/modules';

const featureCards = [
  {
    title: 'Versionado controlado',
    text: 'Manten historial, vigencia, cambios y responsables por cada documento.',
  },
  {
    title: 'Cumplimiento normativo',
    text: 'Ideal para laboratorios, calidad, TI y procesos regulados.',
  },
] as const;

const moduleHighlights = [
  ['CALIDAD', 'Control documental institucional y trazabilidad de calidad.'],
  ['RH', 'Expediente digital del colaborador y gestion documental de personal.'],
  ['HELPDESK', 'Mesa de ayuda, activos y mantenimiento de equipos.'],
] as const;

export const LoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const setAuth = useAuthStore((state) => state.setAuth);
  const infoMessage =
    location.state && typeof location.state === 'object' && 'message' in location.state
      ? String((location.state as { message?: string }).message ?? '')
      : '';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const validation = useNativeFormValidation();
  const canSubmit = email.trim().length > 0 && password.trim().length > 0 && !loading;

  const emailError = validation.getFieldError('email');
  const passwordError = validation.getFieldError('password');

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { token, user, availableModules } = await login({ email, password });
      setAuth(token, user, availableModules);

      if (user.mustChangePassword) {
        navigate('/change-password');
        return;
      }

      if (availableModules.length <= 1) {
        const targetModule = availableModules[0]?.code ?? 'QUALITY';
        navigate(getModuleHomePath(targetModule));
        return;
      }

      navigate('/select-module');
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Error al conectar con el servidor'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative isolate flex h-dvh overflow-hidden bg-[linear-gradient(180deg,#f8fbfd_0%,#eef5fa_52%,#dbe8f2_100%)] text-[var(--unilabor-ink)]">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <img
          src={loginPageBackground}
          alt=""
          aria-hidden="true"
          className="h-full w-full object-cover object-center opacity-[0.28] sm:object-[center_22%] sm:opacity-[0.34] lg:object-[center_center] lg:opacity-[0.4] xl:opacity-[0.46]"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(248,251,253,0.36)_0%,rgba(238,245,250,0.44)_52%,rgba(219,232,242,0.52)_100%)]" />
      </div>

      <section className="relative hidden overflow-hidden border-r border-[rgba(0,65,106,0.08)] bg-[linear-gradient(135deg,rgba(255,255,255,0.48)_0%,rgba(238,245,250,0.56)_52%,rgba(219,232,242,0.66)_100%)] lg:flex lg:h-dvh lg:w-1/2">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.18)_0%,rgba(238,245,250,0.26)_52%,rgba(219,232,242,0.36)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(124,173,211,0.24),transparent_25%),radial-gradient(circle_at_bottom_left,rgba(191,212,230,0.28),transparent_30%)]" />

        <div className="relative z-10 flex h-full w-full flex-col justify-between overflow-y-auto p-8 xl:p-10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div>
            <div className="inline-flex items-center gap-3 rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/88 px-4 py-2 backdrop-blur-md shadow-xl shadow-[rgba(0,65,106,0.08)] transition-all duration-300 hover:-translate-y-0.5">
              <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-[rgba(0,65,106,0.08)] bg-white/90 p-1 shadow-[0_8px_18px_rgba(0,65,106,0.08)] xl:h-11 xl:w-11">
                <img
                  src={unilaborIcon}
                  alt="Icono Unilabor"
                  className="h-full w-full object-contain"
                />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.30em] text-[var(--unilabor-neutral)]">ISO 15189:2022</p>
                <h1 className="text-xl font-semibold text-[var(--color-brand-700)]">Gestion Documental</h1>
              </div>
            </div>

            <div className="mt-8 max-w-xl">
              <p className="text-sm uppercase tracking-[0.35em] text-[var(--color-brand-500)]">UNILABOR en la nube</p>
              <h2 className="mt-4 text-4xl font-black leading-tight text-[var(--color-brand-700)] xl:text-5xl">
                Sistema electrónico documental ISO 15189:2022
              </h2>
              <p className="mt-6 text-base leading-8 text-[var(--unilabor-neutral)] xl:text-lg">
                Centraliza procedimientos, formatos, evidencias, versiones y aprobaciones en una sola plataforma segura, moderna y trazable.
              </p>
            </div>

            <div className="mt-8 grid max-w-2xl grid-cols-1 gap-4 md:grid-cols-2">
              {moduleHighlights.map(([title, text]) => (
                <div
                  key={title}
                  className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/78 p-5 backdrop-blur-md shadow-lg shadow-[rgba(0,65,106,0.06)]"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-brand-500)]">
                    Modulo
                  </p>
                  <h3 className="mt-2 text-lg font-bold text-[var(--color-brand-700)]">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--unilabor-neutral)]">{text}</p>
                </div>
              ))}
            </div>

          </div>

        </div>
      </section>

      <section className="relative flex h-dvh w-full items-center justify-center overflow-hidden bg-[linear-gradient(180deg,rgba(248,251,253,0.34)_0%,rgba(238,245,250,0.44)_52%,rgba(219,232,242,0.52)_100%)] px-6 py-6 sm:px-10 lg:w-1/2 lg:py-8">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(248,251,253,0.12)_0%,rgba(238,245,250,0.22)_52%,rgba(219,232,242,0.32)_100%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(124,173,211,0.2),transparent_30%),linear-gradient(180deg,transparent,rgba(191,212,230,0.2))]" />
        <div className="w-full max-w-md overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="mb-6 lg:hidden">
            <div className="inline-flex items-center gap-3 rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/90 px-4 py-2 shadow-xl shadow-[rgba(0,65,106,0.08)]">
              <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl border border-[rgba(0,65,106,0.08)] bg-white/90 p-1 shadow-[0_8px_18px_rgba(0,65,106,0.08)] sm:h-10 sm:w-10">
                <img
                  src={unilaborIcon}
                  alt="Icono Unilabor"
                  className="h-full w-full object-contain"
                />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.30em] text-[var(--unilabor-neutral)]">UNILABOR</p>
                <h1 className="text-lg font-semibold text-[var(--color-brand-700)]">Gestion Documental</h1>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-3xl border border-[rgba(0,65,106,0.1)] bg-white/88 shadow-2xl shadow-[rgba(0,65,106,0.12)] backdrop-blur-xl">
            <div className="h-2 w-full bg-[linear-gradient(90deg,#00416a_0%,#0069a6_48%,#7cadd3_100%)]" />
            <div className="p-8 sm:p-9">
              <div>
                <p className="text-sm uppercase tracking-[0.30em] text-[var(--color-brand-300)]">Bienvenido</p>
                <h2 className="mt-3 text-3xl font-bold tracking-tight text-[var(--color-brand-700)]">Iniciar sesion</h2>
                <p className="mt-3 text-sm leading-6 text-[var(--unilabor-neutral)]">
                  Accede al portal centralizado para administrar documentos, politicas, procedimientos y registros de calidad.
                </p>
              </div>

              <form
                onSubmit={handleSubmit}
                onInvalidCapture={validation.handleInvalid}
                onChangeCapture={validation.handleChange}
                className="mt-6 space-y-4.5"
              >
                {infoMessage && (
                  <div className="rounded-2xl border border-[rgba(124,173,211,0.24)] bg-[rgba(191,212,230,0.24)] px-4 py-3 text-sm text-[var(--color-brand-700)]">
                    {infoMessage}
                  </div>
                )}

                {error && (
                  <div className="rounded-2xl border border-red-500/20 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <div>
                  <label className="mb-2 block text-sm font-medium text-[var(--color-brand-700)]">
                    Correo institucional <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <Mail
                      className={`pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 ${
                        emailError ? 'text-rose-500' : 'text-slate-500'
                      }`}
                      size={18}
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
                      className={`w-full rounded-2xl border py-3.5 pl-11 pr-4 text-sm text-[var(--unilabor-ink)] outline-none transition ${
                        emailError
                          ? 'border-rose-300 bg-rose-50 placeholder:text-rose-300 focus:border-rose-400 focus:ring-2 focus:ring-rose-500/20'
                          : 'border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]'
                      }`}
                    />
                  </div>
                  <FormFieldError id="email-error" message={emailError} />
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <label className="block text-sm font-medium text-[var(--color-brand-700)]">
                      Contrasena <span className="text-rose-500">*</span>
                    </label>
                    <Link
                      to="/forgot-password"
                      className="text-sm text-[var(--color-brand-500)] transition hover:text-[var(--color-brand-700)]"
                    >
                      Olvide mi contrasena
                    </Link>
                  </div>
                  <div className="relative">
                    <Lock
                      className={`pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 ${
                        passwordError ? 'text-rose-500' : 'text-slate-500'
                      }`}
                      size={18}
                    />
                    <input
                      type="password"
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="************"
                      data-value-missing="Ingresa tu contrasena."
                      {...validation.getFieldProps('password')}
                      className={`w-full rounded-2xl border py-3.5 pl-11 pr-4 text-sm text-[var(--unilabor-ink)] outline-none transition ${
                        passwordError
                          ? 'border-rose-300 bg-rose-50 placeholder:text-rose-300 focus:border-rose-400 focus:ring-2 focus:ring-rose-500/20'
                          : 'border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]'
                      }`}
                    />
                  </div>
                  <FormFieldError id="password-error" message={passwordError} />
                </div>


                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="w-full rounded-2xl bg-[linear-gradient(135deg,#00416a_0%,#0069a6_58%,#7cadd3_100%)] px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-[rgba(0,65,106,0.24)] transition hover:-translate-y-0.5 hover:brightness-105 disabled:cursor-not-allowed disabled:translate-y-0 disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none"
                >
                  {loading ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 size={18} className="animate-spin" /> Validando acceso...
                    </span>
                  ) : (
                    'Entrar al sistema'
                  )}
                </button>
              </form>

              <div className="mt-6 grid grid-cols-3 gap-3">
                {['ISO-15189', 'Trazabilidad', 'Control'].map((item) => (
                  <div
                    key={item}
                    className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-[linear-gradient(180deg,rgba(191,212,230,0.34),rgba(255,255,255,0.95))] px-3 py-4 text-center transition-all duration-300 hover:border-[rgba(124,173,211,0.35)]"
                  >
                    <p className="text-xs font-semibold text-[var(--color-brand-700)]">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <p className="mt-4 text-center text-xs leading-5 text-[var(--unilabor-neutral)]">
            Copyright 2026 UNILABOR. Plataforma de gestion documental para entornos regulados, clinicos y administrativos.
          </p>
        </div>
      </section>
    </div>
  );
};
