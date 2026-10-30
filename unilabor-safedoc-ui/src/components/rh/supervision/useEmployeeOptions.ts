import { useEffect, useState } from 'react';
import { listEmployees } from '../../../api/service.api-core';
import { getApiErrorMessage } from '../../../api/service.parsers';
import type { SearchableOption } from '../../SearchableSelect';
import { notifyError } from '../../../utils/notify';

let cache: Promise<SearchableOption[]> | null = null;

const loadOptions = (): Promise<SearchableOption[]> => {
  cache ??= listEmployees()
    .then((employees) =>
      employees
        .filter((employee) => employee.is_active)
        .map((employee) => ({
          value: String(employee.id),
          label: employee.full_name,
          hint: [employee.employee_code, employee.area].filter(Boolean).join(' · ') || undefined,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    )
    .catch((error) => {
      cache = null;
      throw error;
    });
  return cache;
};

/** Colaboradores activos como opciones de una lista con buscador (supervisor, responsable del área). */
export const useEmployeeOptions = (): SearchableOption[] => {
  const [options, setOptions] = useState<SearchableOption[]>([]);
  useEffect(() => {
    let alive = true;
    loadOptions()
      .then((loaded) => alive && setOptions(loaded))
      .catch((error) => notifyError(getApiErrorMessage(error, 'No se pudo cargar la lista de colaboradores.')));
    return () => {
      alive = false;
    };
  }, []);
  return options;
};
