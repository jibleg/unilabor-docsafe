import { ArrowRight, Building2, FlaskConical } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import type { ModuleAccess, ModuleCode } from '../types/models';
import { getModuleHomePath } from '../utils/modules';

const moduleVisuals: Record<
  ModuleCode,
  {
    icon: typeof FlaskConical;
    eyebrow: string;
    description: string;
  }
> = {
  QUALITY: {
    icon: FlaskConical,
    eyebrow: 'Modulo Quality',
    description: 'Gestion documental institucional, control de calidad y trazabilidad operativa.',
  },
  RH: {
    icon: Building2,
    eyebrow: 'Modulo RH',
    description: 'Expediente digital del colaborador, seguimiento documental y gestion de personal.',
  },
};

const ModuleCard = ({
  moduleAccess,
  onSelect,
}: {
  moduleAccess: ModuleAccess;
  onSelect: (moduleCode: ModuleCode) => void;
}) => {
  const visual = moduleVisuals[moduleAccess.code];
  const Icon = visual.icon;

  return (
    <button
      type="button"
      onClick={() => onSelect(moduleAccess.code)}
      className="group flex w-full flex-col rounded-3xl border border-[rgba(0,65,106,0.1)] bg-white/92 p-6 text-left shadow-xl shadow-[rgba(0,65,106,0.08)] transition hover:-translate-y-1 hover:border-[rgba(124,173,211,0.34)] hover:bg-[rgba(248,251,253,0.98)]"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[rgba(0,65,106,0.08)] bg-[rgba(191,212,230,0.26)] text-[var(--color-brand-700)]">
          <Icon size={22} />
        </div>
        <span className="rounded-full border border-[rgba(0,65,106,0.1)] bg-[rgba(239,245,250,0.9)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--color-brand-700)]">
          {moduleAccess.role}
        </span>
      </div>

      <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-brand-500)]">
        {visual.eyebrow}
      </p>
      <h2 className="mt-2 text-2xl font-black text-[var(--color-brand-700)]">{moduleAccess.name}</h2>
      <p className="mt-3 text-sm leading-7 text-[var(--unilabor-neutral)]">{visual.description}</p>

      <div className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-brand-700)]">
        Entrar al modulo
        <ArrowRight
          size={16}
          className="transition-transform group-hover:translate-x-1"
        />
      </div>
    </button>
  );
};

export const ModuleSelectorPage = () => {
  const navigate = useNavigate();
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const availableModules = useAuthStore((state) => state.availableModules);
  const activeModule = useAuthStore((state) => state.activeModule);
  const setActiveModule = useAuthStore((state) => state.setActiveModule);

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (availableModules.length === 0) {
    return <Navigate to="/login" replace state={{ message: 'Tu cuenta no tiene modulos habilitados.' }} />;
  }

  if (availableModules.length === 1) {
    const uniqueModule = availableModules[0].code;
    if (activeModule !== uniqueModule) {
      setActiveModule(uniqueModule);
    }
    return <Navigate to={getModuleHomePath(uniqueModule)} replace />;
  }

  const displayName = user?.full_name ?? user?.name ?? 'Usuario';

  const handleSelectModule = (moduleCode: ModuleCode) => {
    setActiveModule(moduleCode);
    navigate(getModuleHomePath(moduleCode), { replace: true });
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fbfd_0%,#eef5fa_52%,#dbe8f2_100%)] px-6 py-10 text-[var(--unilabor-ink)]">
      <div className="mx-auto max-w-5xl">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--color-brand-500)]">
            SafeDoc UniLabor
          </p>
          <h1 className="mt-4 text-4xl font-black leading-tight text-[var(--color-brand-700)]">
            Selecciona el modulo al que deseas ingresar
          </h1>
          <p className="mt-4 text-base leading-8 text-[var(--unilabor-neutral)]">
            {displayName}, tu cuenta tiene acceso a mas de un espacio de trabajo. Elige el modulo con el que deseas continuar.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {availableModules.map((moduleAccess) => (
            <ModuleCard
              key={moduleAccess.code}
              moduleAccess={moduleAccess}
              onSelect={handleSelectModule}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
