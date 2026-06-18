import { useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import type { Category, ModuleAccess, ModuleCode } from '../../types/models';
import {
  ROLE_OPTIONS,
  normalizeRoleValue,
  type RoleValue,
  type UserFormState,
} from '../../pages/UsersPage.helpers';

type UserFormTab = 'info' | 'categories';

interface UserFormModalProps {
  title: string;
  form: UserFormState;
  setForm: Dispatch<SetStateAction<UserFormState>>;
  onUpdateRole: (role: RoleValue) => void;
  onToggleModule: (moduleCode: ModuleCode) => void;
  onToggleCategory: (categoryId: number) => void;
  moduleOptions: ModuleAccess[];
  categories: Category[];
  loadingModules: boolean;
  loadingCategories: boolean;
  modulesHelpText: string;
  showCredentialsNote?: boolean;
  submitting: boolean;
  submitLabel: string;
  submittingLabel: string;
  submitIcon: ReactNode;
  onSubmit: () => void;
  onClose: () => void;
}

const inputClassName =
  'w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]';

const labelClassName =
  'mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]';

const optionClassName =
  'inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[rgba(0,65,106,0.08)] bg-white/90 px-3 py-2 text-xs text-[var(--unilabor-ink)] transition hover:border-[rgba(124,173,211,0.35)] hover:bg-[rgba(191,212,230,0.2)]';

export const UserFormModal = ({
  title,
  form,
  setForm,
  onUpdateRole,
  onToggleModule,
  onToggleCategory,
  moduleOptions,
  categories,
  loadingModules,
  loadingCategories,
  modulesHelpText,
  showCredentialsNote = false,
  submitting,
  submitLabel,
  submittingLabel,
  submitIcon,
  onSubmit,
  onClose,
}: UserFormModalProps) => {
  const [activeTab, setActiveTab] = useState<UserFormTab>('info');
  const [categorySearch, setCategorySearch] = useState('');

  const filteredCategories = useMemo(() => {
    const term = categorySearch.trim().toLowerCase();
    if (term.length === 0) {
      return categories;
    }
    return categories.filter((category) => category.name.toLowerCase().includes(term));
  }, [categories, categorySearch]);

  const categoriesHelpText =
    form.role === 'VIEWER' && form.moduleCodes.includes('QUALITY')
      ? 'El usuario VIEWER debe tener al menos una categoría para visualizar documentos.'
      : 'La asignación de categorías es opcional para este rol.';

  const tabBaseClassName =
    'flex-1 rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wide transition';
  const tabActiveClassName = 'bg-white text-[var(--color-brand-700)] shadow-sm';
  const tabIdleClassName =
    'text-[var(--unilabor-neutral)] hover:text-[var(--color-brand-700)]';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(11,34,53,0.28)] p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/95 shadow-2xl shadow-[rgba(0,65,106,0.16)]">
        <div className="border-b border-[rgba(0,65,106,0.08)] px-4 py-3">
          <h2 className="text-base font-bold text-[var(--color-brand-700)]">{title}</h2>
        </div>

        <div className="px-4 pt-3">
          <div className="flex gap-1 rounded-xl bg-[rgba(239,245,250,0.95)] p-1">
            <button
              type="button"
              onClick={() => setActiveTab('info')}
              className={`${tabBaseClassName} ${activeTab === 'info' ? tabActiveClassName : tabIdleClassName}`}
            >
              Empleado y módulos
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('categories')}
              className={`${tabBaseClassName} ${activeTab === 'categories' ? tabActiveClassName : tabIdleClassName}`}
            >
              Categorías{form.categoryIds.length > 0 ? ` (${form.categoryIds.length})` : ''}
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {activeTab === 'info' ? (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className={labelClassName}>Nombre completo</label>
                  <input
                    value={form.full_name}
                    onChange={(event) =>
                      setForm((currentForm) => ({ ...currentForm, full_name: event.target.value }))
                    }
                    className={inputClassName}
                    placeholder="Nombre Apellido"
                  />
                </div>

                <div>
                  <label className={labelClassName}>Correo</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(event) =>
                      setForm((currentForm) => ({ ...currentForm, email: event.target.value }))
                    }
                    className={inputClassName}
                    placeholder="usuario@unilabor.mx"
                  />
                </div>
              </div>

              <div>
                <label className={labelClassName}>Rol</label>
                <select
                  value={form.role}
                  onChange={(event) => onUpdateRole(normalizeRoleValue(event.target.value))}
                  className={inputClassName}
                >
                  {ROLE_OPTIONS.map((roleOption) => (
                    <option key={roleOption.value} value={roleOption.value}>
                      {roleOption.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.95)] p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                  Módulos habilitados
                </p>
                <p className="mb-3 text-xs text-[var(--unilabor-neutral)]">{modulesHelpText}</p>

                {loadingModules ? (
                  <p className="text-xs text-[var(--unilabor-neutral)]">Cargando módulos...</p>
                ) : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {moduleOptions.map((moduleOption) => {
                      const selected = form.moduleCodes.includes(moduleOption.code);
                      return (
                        <label key={moduleOption.code} className={optionClassName}>
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => onToggleModule(moduleOption.code)}
                            className="h-4 w-4 rounded border-[rgba(0,65,106,0.18)] bg-white text-[var(--color-brand-500)]"
                          />
                          <span className={selected ? 'font-semibold text-[var(--color-brand-700)]' : ''}>
                            {moduleOption.name}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {showCredentialsNote && (
                <div className="rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.28)] px-3 py-2 text-xs text-[var(--color-brand-700)]">
                  Al crear el usuario, el sistema envía por correo una contraseña temporal y se fuerza el cambio en el primer inicio de sesión.
                </div>
              )}
            </>
          ) : (
            <div className="rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.95)] p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                Categorías asignadas
              </p>
              <p className="mb-3 text-xs text-[var(--unilabor-neutral)]">{categoriesHelpText}</p>

              {loadingCategories ? (
                <p className="text-xs text-[var(--unilabor-neutral)]">Cargando categorías...</p>
              ) : categories.length === 0 ? (
                <p className="text-xs text-[var(--unilabor-neutral)]">No hay categorías disponibles.</p>
              ) : (
                <>
                  <input
                    value={categorySearch}
                    onChange={(event) => setCategorySearch(event.target.value)}
                    className={`${inputClassName} mb-3`}
                    placeholder="Buscar categoría..."
                  />
                  {filteredCategories.length === 0 ? (
                    <p className="text-xs text-[var(--unilabor-neutral)]">
                      Ninguna categoría coincide con la búsqueda.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {filteredCategories.map((category) => {
                        const selected = form.categoryIds.includes(category.id);
                        return (
                          <label key={category.id} className={optionClassName}>
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => onToggleCategory(category.id)}
                              className="h-4 w-4 rounded border-[rgba(0,65,106,0.18)] bg-white text-[var(--color-brand-500)]"
                            />
                            <span className={selected ? 'font-semibold text-[var(--color-brand-700)]' : ''}>
                              {category.name}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-[rgba(0,65,106,0.08)] px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-xl border border-[rgba(0,65,106,0.12)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? (
              <>
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                {submittingLabel}
              </>
            ) : (
              <>
                {submitIcon}
                {submitLabel}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
