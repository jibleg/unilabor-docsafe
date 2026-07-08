import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Loader2, MapPin, RefreshCw, Save, Search, Users } from 'lucide-react';
import { SearchableSelect } from '../components/SearchableSelect';
import {
  getApiErrorMessage,
  getHelpdeskOrgStructure,
  setHelpdeskAreaResponsibles,
  setHelpdeskUnitAreas,
} from '../api/service';
import type { HelpdeskOrgStructure } from '../types/models';
import { notifyError, notifySuccess } from '../utils/notify';

const EMPTY_STRUCTURE: HelpdeskOrgStructure = { units: [], areas: [], users: [] };

const toggleInSet = <T,>(set: Set<T>, value: T): Set<T> => {
  const next = new Set(set);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return next;
};

export const HelpdeskOrgStructurePage = () => {
  const [structure, setStructure] = useState<HelpdeskOrgStructure>(EMPTY_STRUCTURE);
  const [loading, setLoading] = useState(false);

  const [selectedUnit, setSelectedUnit] = useState('');
  const [unitAreaIds, setUnitAreaIds] = useState<Set<number>>(new Set());
  const [savingUnit, setSavingUnit] = useState(false);

  const [selectedArea, setSelectedArea] = useState('');
  const [areaUserIds, setAreaUserIds] = useState<Set<string>>(new Set());
  const [userSearch, setUserSearch] = useState('');
  const [savingArea, setSavingArea] = useState(false);

  const loadStructure = useCallback(async () => {
    setLoading(true);
    try {
      setStructure(await getHelpdeskOrgStructure());
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo cargar la estructura organizacional.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStructure();
  }, [loadStructure]);

  const unitOptions = useMemo(
    () => structure.units.map((unit) => ({ value: String(unit.id), label: unit.name, hint: unit.code ?? undefined })),
    [structure.units],
  );
  // El dropdown de "Responsables por área" solo muestra las áreas de la unidad
  // seleccionada (arriba). Sin unidad seleccionada no hay áreas que asignar.
  const areaOptions = useMemo(() => {
    const unitId = Number(selectedUnit);
    if (!unitId) {
      return [];
    }
    return structure.areas
      .filter((area) => area.unit_ids.includes(unitId))
      .map((area) => ({ value: String(area.id), label: area.name, hint: area.code ?? undefined }));
  }, [structure.areas, selectedUnit]);

  // Filtra la lista de responsables (que puede ser enorme) por nombre o correo,
  // ignorando acentos y mayúsculas. Los seleccionados que no coincidan siguen
  // marcados en areaUserIds aunque no se muestren.
  const normalize = (value: string) =>
    value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const filteredUsers = useMemo(() => {
    const term = normalize(userSearch.trim());
    if (!term) {
      return structure.users;
    }
    return structure.users.filter(
      (user) => normalize(user.full_name).includes(term) || normalize(user.email).includes(term),
    );
  }, [structure.users, userSearch]);

  // Al elegir una unidad, precargar las áreas que ya tiene asignadas. Además se
  // limpia la selección de responsables, cuyo dropdown de áreas depende de esta
  // unidad (para no quedar con un área de otra unidad).
  const handleSelectUnit = (value: string) => {
    setSelectedUnit(value);
    const unitId = Number(value);
    const assigned = structure.areas
      .filter((area) => area.unit_ids.includes(unitId))
      .map((area) => area.id);
    setUnitAreaIds(new Set(assigned));
    setSelectedArea('');
    setUserSearch('');
    setAreaUserIds(new Set());
  };

  // Al elegir un área, precargar sus responsables actuales.
  const handleSelectArea = (value: string) => {
    setSelectedArea(value);
    setUserSearch('');
    const areaId = Number(value);
    const area = structure.areas.find((item) => item.id === areaId);
    setAreaUserIds(new Set(area?.responsible_user_ids ?? []));
  };

  const handleSaveUnitAreas = async () => {
    const unitId = Number(selectedUnit);
    if (!unitId) {
      return;
    }
    setSavingUnit(true);
    try {
      await setHelpdeskUnitAreas(unitId, [...unitAreaIds]);
      notifySuccess('Áreas de la unidad actualizadas correctamente.');
      await loadStructure();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudieron actualizar las áreas de la unidad.'));
    } finally {
      setSavingUnit(false);
    }
  };

  const handleSaveAreaResponsibles = async () => {
    const areaId = Number(selectedArea);
    if (!areaId) {
      return;
    }
    setSavingArea(true);
    try {
      await setHelpdeskAreaResponsibles(areaId, [...areaUserIds]);
      notifySuccess('Responsables del área actualizados correctamente.');
      await loadStructure();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudieron actualizar los responsables del área.'));
    } finally {
      setSavingArea(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--color-brand-500)]">
            Gestión técnica
          </p>
          <h1 className="mt-2 text-3xl font-bold text-[var(--color-brand-700)]">Estructura organizacional</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--unilabor-neutral)]">
            Define qué áreas pertenecen a cada unidad y quiénes son los usuarios responsables de cada área. Estas
            relaciones alimentan los filtros en cascada y la impresión de etiquetas del inventario.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadStructure()}
          className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.12)] bg-white/90 px-4 py-2.5 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Recargar
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Áreas por unidad */}
        <section className="space-y-4 rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/90 p-5 shadow-xl shadow-[rgba(0,65,106,0.08)]">
          <div className="flex items-center gap-2">
            <Building2 size={18} className="text-[var(--color-brand-700)]" />
            <h2 className="text-lg font-bold text-[var(--color-brand-700)]">Áreas por unidad</h2>
          </div>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
              Unidad
            </span>
            <SearchableSelect
              value={selectedUnit}
              onChange={handleSelectUnit}
              options={unitOptions}
              placeholder="Selecciona una unidad"
              emptyLabel="Selecciona una unidad"
              searchPlaceholder="Buscar unidad..."
            />
          </label>

          {selectedUnit ? (
            <>
              <div className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-[rgba(0,65,106,0.1)] bg-[rgba(248,251,253,0.96)] p-2">
                {structure.areas.length === 0 ? (
                  <p className="p-3 text-sm text-[var(--unilabor-neutral)]">No hay áreas registradas.</p>
                ) : (
                  structure.areas.map((area) => (
                    <label
                      key={area.id}
                      className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm transition hover:bg-[rgba(191,212,230,0.28)]"
                    >
                      <input
                        type="checkbox"
                        checked={unitAreaIds.has(area.id)}
                        onChange={() => setUnitAreaIds((current) => toggleInSet(current, area.id))}
                        className="h-4 w-4"
                      />
                      <span className="font-semibold text-[var(--unilabor-ink)]">{area.name}</span>
                      {area.code ? <span className="text-xs text-[var(--unilabor-neutral)]">{area.code}</span> : null}
                    </label>
                  ))
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--unilabor-neutral)]">{unitAreaIds.size} área(s) seleccionada(s)</span>
                <button
                  type="button"
                  onClick={() => void handleSaveUnitAreas()}
                  disabled={savingUnit}
                  className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-brand-700)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  {savingUnit ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Guardar áreas
                </button>
              </div>
            </>
          ) : (
            <p className="rounded-xl border border-dashed border-[rgba(0,65,106,0.14)] bg-[rgba(248,251,253,0.8)] p-4 text-sm text-[var(--unilabor-neutral)]">
              Selecciona una unidad para asignar sus áreas.
            </p>
          )}
        </section>

        {/* Responsables por área */}
        <section className="space-y-4 rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/90 p-5 shadow-xl shadow-[rgba(0,65,106,0.08)]">
          <div className="flex items-center gap-2">
            <MapPin size={18} className="text-[var(--color-brand-700)]" />
            <h2 className="text-lg font-bold text-[var(--color-brand-700)]">Responsables por área</h2>
          </div>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
              Área {selectedUnit ? '(de la unidad seleccionada)' : ''}
            </span>
            <SearchableSelect
              value={selectedArea}
              onChange={handleSelectArea}
              options={areaOptions}
              placeholder={selectedUnit ? 'Selecciona un área' : 'Selecciona primero una unidad'}
              emptyLabel="Selecciona un área"
              searchPlaceholder="Buscar área..."
              disabled={!selectedUnit}
            />
            {selectedUnit && areaOptions.length === 0 ? (
              <span className="mt-1 block text-xs text-[var(--unilabor-neutral)]">
                Esta unidad aún no tiene áreas asignadas. Asígnalas en el panel de la izquierda.
              </span>
            ) : null}
          </label>

          {selectedArea ? (
            <>
              <div className="flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2">
                <Search size={16} className="text-[var(--color-brand-700)]" />
                <input
                  value={userSearch}
                  onChange={(event) => setUserSearch(event.target.value)}
                  placeholder="Buscar responsable por nombre o correo..."
                  className="w-full bg-transparent text-sm text-[var(--unilabor-ink)] outline-none"
                />
              </div>
              <div className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-[rgba(0,65,106,0.1)] bg-[rgba(248,251,253,0.96)] p-2">
                {structure.users.length === 0 ? (
                  <p className="p-3 text-sm text-[var(--unilabor-neutral)]">No hay usuarios activos.</p>
                ) : filteredUsers.length === 0 ? (
                  <p className="p-3 text-sm text-[var(--unilabor-neutral)]">
                    Sin coincidencias para “{userSearch}”.
                  </p>
                ) : (
                  filteredUsers.map((user) => (
                    <label
                      key={user.id}
                      className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm transition hover:bg-[rgba(191,212,230,0.28)]"
                    >
                      <input
                        type="checkbox"
                        checked={areaUserIds.has(user.id)}
                        onChange={() => setAreaUserIds((current) => toggleInSet(current, user.id))}
                        className="h-4 w-4"
                      />
                      <span className="min-w-0">
                        <span className="block font-semibold text-[var(--unilabor-ink)]">{user.full_name}</span>
                        <span className="block text-xs text-[var(--unilabor-neutral)]">{user.email}</span>
                      </span>
                    </label>
                  ))
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--unilabor-neutral)]">
                  <Users size={12} className="mr-1 inline" />
                  {areaUserIds.size} responsable(s) seleccionado(s)
                </span>
                <button
                  type="button"
                  onClick={() => void handleSaveAreaResponsibles()}
                  disabled={savingArea}
                  className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-brand-700)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  {savingArea ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Guardar responsables
                </button>
              </div>
            </>
          ) : (
            <p className="rounded-xl border border-dashed border-[rgba(0,65,106,0.14)] bg-[rgba(248,251,253,0.8)] p-4 text-sm text-[var(--unilabor-neutral)]">
              Selecciona un área para asignar sus responsables.
            </p>
          )}
        </section>
      </div>
    </div>
  );
};
