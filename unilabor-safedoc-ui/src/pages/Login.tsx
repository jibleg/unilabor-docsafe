import { useEffect, useState } from 'react';
import { Loader2, Lock, Mail, ShieldCheck } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { getApiErrorMessage, login } from '../api/service';
import { FormFieldError } from '../components/FormFieldError';
import { useNativeFormValidation } from '../hooks/useNativeFormValidation';
import { useAuthStore } from '../store/useAuthStore';

const featureCards = [
  {
    title: 'Versionado controlado',
    text: 'Manten historial, vigencia, cambios y responsables por cada documento.',
  },
  {
    title: 'Trazabilidad completa',
    text: 'Consulta aprobaciones, revisiones, descargas y evidencia de uso.',
  },
  {
    title: 'Acceso por roles',
    text: 'Permisos por area, perfil y criticidad documental.',
  },
  {
    title: 'Cumplimiento normativo',
    text: 'Ideal para laboratorios, calidad, TI y procesos regulados.',
  },
] as const;

const quickStats = [
  ['+10k', 'Documentos administrados'],
  ['99.9%', 'Disponibilidad esperada'],
  ['24/7', 'Acceso en la nube sin interrupciones'],
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
  const [rememberSession, setRememberSession] = useState(true);
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
      const { token, user } = await login({ email, password });
      setAuth(token, user);
      navigate(user.mustChangePassword ? '/change-password' : '/dashboard');
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Error al conectar con el servidor'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-dvh overflow-hidden bg-slate-950 text-white flex">
      <section className="relative hidden overflow-hidden bg-gradient-to-br from-cyan-600 via-sky-700 to-slate-900 lg:flex lg:h-dvh lg:w-1/2">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.18),transparent_25%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.10),transparent_30%)] animate-pulse" />

        <div className="relative z-10 flex h-full w-full flex-col justify-between overflow-y-auto p-8 xl:p-10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div>
            <div className="inline-flex items-center gap-3 rounded-2xl border border-white/20 bg-white/10 px-4 py-2 backdrop-blur-md shadow-2xl transition-all duration-300 hover:-translate-y-0.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-sky-700 font-black text-lg">
                U
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.30em] text-cyan-100/80">UNILABOR</p>
                <h1 className="text-xl font-semibold">Gestion Documental</h1>
              </div>
            </div>

            <div className="mt-8 max-w-xl">
              <p className="text-sm uppercase tracking-[0.35em] text-cyan-100/70">Plataforma SaaS</p>
              <h2 className="mt-4 text-4xl xl:text-5xl font-black leading-tight">
                Control inteligente de documentos clinicos y operativos.
              </h2>
              <p className="mt-6 text-base xl:text-lg text-cyan-50/85 leading-8">
                Centraliza procedimientos, formatos, evidencias, versiones y aprobaciones en una sola plataforma segura, moderna y trazable.
              </p>
            </div>

            <div className="mt-8 grid max-w-2xl grid-cols-1 gap-4 md:grid-cols-2">
              {featureCards.map((item) => (
                <div
                  key={item.title}
                  className="rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur-md shadow-xl transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/15"
                >
                  <h3 className="text-lg font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm text-cyan-50/80 leading-6">{item.text}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 max-w-xl">
            {quickStats.map(([value, label]) => (
              <div
                key={label}
                className="rounded-2xl border border-white/15 bg-black/20 px-4 py-5 backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5"
              >
                <p className="text-2xl font-black">{value}</p>
                <p className="mt-1 text-xs text-cyan-100/75 leading-5">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="flex h-dvh w-full items-center justify-center overflow-hidden bg-slate-950 px-6 py-6 sm:px-10 lg:w-1/2 lg:py-8">
        <div className="w-full max-w-md overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="mb-6 lg:hidden">
            <div className="inline-flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900 px-4 py-2 shadow-xl">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500 text-slate-950 font-black text-lg">
                U
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.30em] text-slate-400">UNILABOR</p>
                <h1 className="text-lg font-semibold">Gestion Documental</h1>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl backdrop-blur-xl sm:p-9">
            <div>
              <p className="text-sm uppercase tracking-[0.30em] text-cyan-400">Bienvenido</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight">Iniciar sesion</h2>
              <p className="mt-3 text-sm text-slate-400 leading-6">
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
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
                  {infoMessage}
                </div>
              )}

              {error && (
                <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                  {error}
                </div>
              )}

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">
                  Correo institucional <span className="text-rose-300">*</span>
                </label>
                <div className="relative">
                  <Mail
                    className={`pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 ${
                      emailError ? 'text-rose-300' : 'text-slate-500'
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
                    className={`w-full rounded-2xl border pl-11 pr-4 py-3.5 text-sm outline-none transition ${
                      emailError
                        ? 'border-rose-500/60 bg-rose-950/20 text-slate-50 placeholder:text-rose-200/40 focus:border-rose-400 focus:ring-2 focus:ring-rose-500/20'
                        : 'border-slate-700 bg-slate-950 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20'
                    }`}
                  />
                </div>
                <FormFieldError id="email-error" message={emailError} />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="block text-sm font-medium text-slate-300">
                    Contrasena <span className="text-rose-300">*</span>
                  </label>
                  <Link
                    to="/forgot-password"
                    className="text-sm text-cyan-400 transition hover:text-cyan-300"
                  >
                    Olvide mi contrasena
                  </Link>
                </div>
                <div className="relative">
                  <Lock
                    className={`pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 ${
                      passwordError ? 'text-rose-300' : 'text-slate-500'
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
                    className={`w-full rounded-2xl border pl-11 pr-4 py-3.5 text-sm outline-none transition ${
                      passwordError
                        ? 'border-rose-500/60 bg-rose-950/20 text-slate-50 placeholder:text-rose-200/40 focus:border-rose-400 focus:ring-2 focus:ring-rose-500/20'
                        : 'border-slate-700 bg-slate-950 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20'
                    }`}
                  />
                </div>
                <FormFieldError id="password-error" message={passwordError} />
              </div>

              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center gap-3 text-slate-400">
                  <input
                    type="checkbox"
                    checked={rememberSession}
                    onChange={(event) => setRememberSession(event.target.checked)}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-cyan-500"
                  />
                  Recordar sesion
                </label>
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300 inline-flex items-center gap-1.5">
                  <ShieldCheck size={14} /> Acceso seguro
                </span>
              </div>

              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full rounded-2xl bg-cyan-500 px-4 py-3.5 text-sm font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:-translate-y-0.5 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:translate-y-0 disabled:bg-slate-700 disabled:text-slate-400 disabled:shadow-none"
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
              {['ISO', 'Trazabilidad', 'Control'].map((item) => (
                <div
                  key={item}
                  className="rounded-2xl border border-slate-800 bg-slate-950 px-3 py-4 text-center transition-all duration-300 hover:border-cyan-500/40"
                >
                  <p className="text-xs font-semibold text-slate-300">{item}</p>
                </div>
              ))}
            </div>
          </div>

          <p className="mt-4 text-center text-xs text-slate-500 leading-5">
            Copyright 2026 UNILABOR. Plataforma de gestion documental para entornos regulados, clinicos y administrativos.
          </p>
        </div>
      </section>
    </div>
  );
};
