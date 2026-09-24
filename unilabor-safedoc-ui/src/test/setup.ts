import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Node >= 22 define `localStorage`/`sessionStorage` como globales que valen
// undefined salvo que se arranque con --localstorage-file, y Vitest no los
// reemplaza por los de jsdom porque "ya existen". Sin esto, zustand/persist
// (store de sesion) truena con "Cannot read properties of undefined (reading
// 'setItem')" en cualquier prueba que toque el store. Se usa el Storage real
// de jsdom si esta disponible y, si no, uno en memoria con la misma API.
const createMemoryStorage = (): Storage => {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => (data.has(key) ? (data.get(key) as string) : null),
    key: (index) => Array.from(data.keys())[index] ?? null,
    removeItem: (key) => {
      data.delete(key);
    },
    setItem: (key, value) => {
      data.set(key, String(value));
    },
  };
};

for (const key of ['localStorage', 'sessionStorage'] as const) {
  if (typeof globalThis[key] === 'undefined') {
    let storage: Storage | undefined;
    try {
      storage = typeof window !== 'undefined' ? window[key] : undefined;
    } catch {
      storage = undefined;
    }
    Object.defineProperty(globalThis, key, {
      value: storage ?? createMemoryStorage(),
      configurable: true,
      writable: true,
    });
  }
}

afterEach(() => {
  cleanup();
});
