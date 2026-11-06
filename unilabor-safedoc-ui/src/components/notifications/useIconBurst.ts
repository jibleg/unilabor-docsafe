import { useCallback, useEffect, useRef, useState } from 'react';

const DURACION_MS = 1500;

export type Burst = { key: number; icono?: string };

/** Lanza explosiones: `launch()` mezcla todos los iconos, `launch('⭐')` solo ese. */
export function useIconBurst() {
  const [burst, setBurst] = useState<Burst | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const key = useRef(0);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const launch = useCallback((icono?: string) => {
    key.current += 1;
    setBurst({ key: key.current, icono });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setBurst(null), DURACION_MS);
  }, []);

  return { burst, launch };
}
