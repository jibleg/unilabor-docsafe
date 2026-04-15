import { useCallback, useMemo, useState } from 'react';
import type { FormEvent } from 'react';

type FormFieldElement = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

const isFormFieldElement = (target: EventTarget | null): target is FormFieldElement =>
  target instanceof HTMLInputElement ||
  target instanceof HTMLSelectElement ||
  target instanceof HTMLTextAreaElement;

const getFieldKey = (field: FormFieldElement): string =>
  field.name || field.id || field.getAttribute('data-field-key') || '';

const getValueMissingMessage = (field: FormFieldElement): string => {
  if (field instanceof HTMLSelectElement) {
    return 'Selecciona una opcion.';
  }

  if (field.type === 'file') {
    return 'Adjunta un archivo.';
  }

  return 'Completa este campo.';
};

const getValidationMessage = (field: FormFieldElement): string => {
  const { dataset, validity } = field;

  if (validity.valueMissing) {
    return dataset.valueMissing || getValueMissingMessage(field);
  }

  if (validity.typeMismatch) {
    if (field.type === 'email') {
      return dataset.typeMismatch || 'Ingresa un correo electronico valido.';
    }

    return dataset.typeMismatch || 'Ingresa un valor valido.';
  }

  if (
    validity.tooShort &&
    (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) &&
    field.minLength > 0
  ) {
    return dataset.tooShort || `Ingresa al menos ${field.minLength} caracteres.`;
  }

  if (
    validity.tooLong &&
    (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) &&
    field.maxLength > 0
  ) {
    return dataset.tooLong || `No excedas ${field.maxLength} caracteres.`;
  }

  if (validity.patternMismatch) {
    return dataset.patternMismatch || 'Revisa el formato de este campo.';
  }

  if (validity.rangeUnderflow && field instanceof HTMLInputElement && field.min) {
    return dataset.rangeUnderflow || `El valor minimo permitido es ${field.min}.`;
  }

  if (validity.rangeOverflow && field instanceof HTMLInputElement && field.max) {
    return dataset.rangeOverflow || `El valor maximo permitido es ${field.max}.`;
  }

  return dataset.invalidMessage || field.validationMessage || 'Revisa este campo.';
};

export const useNativeFormValidation = () => {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const clearErrors = useCallback(() => {
    setErrors((currentErrors) => {
      if (Object.keys(currentErrors).length === 0) {
        return currentErrors;
      }

      return {};
    });
  }, []);

  const clearFieldError = useCallback((fieldKey: string) => {
    setErrors((currentErrors) => {
      if (!(fieldKey in currentErrors)) {
        return currentErrors;
      }

      const nextErrors = { ...currentErrors };
      delete nextErrors[fieldKey];
      return nextErrors;
    });
  }, []);

  const setFieldError = useCallback((field: FormFieldElement) => {
    const key = getFieldKey(field);
    if (!key) {
      return;
    }

    const nextMessage = getValidationMessage(field);

    setErrors((currentErrors) => {
      if (currentErrors[key] === nextMessage) {
        return currentErrors;
      }

      return {
        ...currentErrors,
        [key]: nextMessage,
      };
    });
  }, []);

  const handleInvalid = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      const field = isFormFieldElement(event.target) ? event.target : null;
      if (!field) {
        return;
      }

      event.preventDefault();
      setFieldError(field);
    },
    [setFieldError],
  );

  const handleChange = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      const field = isFormFieldElement(event.target) ? event.target : null;
      if (!field) {
        return;
      }

      const key = getFieldKey(field);
      if (!key) {
        return;
      }

      if (field.validity.valid) {
        clearFieldError(key);
        return;
      }

      setErrors((currentErrors) => {
        if (!(key in currentErrors)) {
          return currentErrors;
        }

        const nextMessage = getValidationMessage(field);
        if (currentErrors[key] === nextMessage) {
          return currentErrors;
        }

        return {
          ...currentErrors,
          [key]: nextMessage,
        };
      });
    },
    [clearFieldError],
  );

  const getFieldError = useCallback(
    (fieldKey: string) => errors[fieldKey],
    [errors],
  );

  const getFieldProps = useCallback(
    (fieldKey: string) => {
      const error = errors[fieldKey];

      return {
        name: fieldKey,
        'aria-invalid': error ? 'true' : 'false',
        'aria-describedby': error ? `${fieldKey}-error` : undefined,
      } as const;
    },
    [errors],
  );

  return useMemo(
    () => ({
      clearErrors,
      getFieldError,
      getFieldProps,
      handleChange,
      handleInvalid,
    }),
    [clearErrors, getFieldError, getFieldProps, handleChange, handleInvalid],
  );
};
