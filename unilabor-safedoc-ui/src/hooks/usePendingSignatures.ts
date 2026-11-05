import { usePendingSignaturesStore } from '../store/usePendingSignaturesStore';

/**
 * Número de listas que esperan la firma del usuario en su Buzón de firmas.
 * Lee del store compartido; el refresco lo dispara MainLayout en cada
 * navegación de RH y el Buzón al firmar.
 */
export const usePendingSignatures = (enabled = true): number => {
  const count = usePendingSignaturesStore((state) => state.count);
  return enabled ? count : 0;
};
