import type { CSSProperties } from 'react';

/**
 * Animación de felicitación de la campana de notificaciones: explosión de iconos
 * y globo que invita a revisar las que siguen sin leer. Cada icono del globo lanza
 * su propia lluvia. Misma pieza en Contigo+ y DocSafe; los estilos `bell-*` viven
 * en la hoja global de cada sistema y respetan 'reducir movimiento'.
 */

const ICONOS = [
  { icono: '⭐', etiqueta: 'estrellas' },
  { icono: '🏆', etiqueta: 'trofeos' },
  { icono: '👏', etiqueta: 'aplausos' },
  { icono: '💙', etiqueta: 'corazones' },
];
const TODOS = ['🎉', ...ICONOS.map((i) => i.icono)];
const PIEZAS = 16;

export function IconBurst({ icono, rondas = 1 }: { icono?: string; rondas?: number }) {
  return (
    <span aria-hidden='true' className='pointer-events-none absolute left-1/2 top-1/2 z-50'>
      {Array.from({ length: PIEZAS }, (_, i) => {
        const angulo = (i / PIEZAS) * 2 * Math.PI;
        const distancia = i % 2 === 0 ? 62 : 40;
        return (
          <span
            key={i}
            className='bell-burst-piece'
            style={
              {
                '--burst-x': `${Math.round(Math.cos(angulo) * distancia)}px`,
                '--burst-y': `${Math.round(Math.sin(angulo) * distancia)}px`,
                animationDelay: `${(i % 4) * 40}ms`,
                animationIterationCount: rondas,
              } as CSSProperties
            }
          >
            {icono ?? TODOS[i % TODOS.length]}
          </span>
        );
      })}
    </span>
  );
}

export function CelebrationBubble({
  unread,
  onOpen,
  onIcon,
}: {
  unread: number;
  onOpen: () => void;
  onIcon: (icono: string) => void;
}) {
  return (
    <div className='bell-bubble absolute right-0 top-[calc(100%+0.6rem)] z-50 w-max max-w-[16rem] rounded-2xl bg-[#00416a] p-2 text-white shadow-xl shadow-[rgba(0,65,106,0.28)]'>
      <button type='button' onClick={onOpen} className='flex w-full items-center gap-2 rounded-xl px-1 py-0.5 text-left hover:bg-white/10'>
        <span aria-hidden='true' className='text-lg leading-none'>🎉</span>
        <span className='text-xs leading-4'>
          <span className='block font-bold'>¡Tienes buenas noticias!</span>
          <span className='block text-white/85'>
            Toca para ver {unread === 1 ? 'tu mensaje' : `tus ${unread > 99 ? '99+' : unread} mensajes`}
          </span>
        </span>
      </button>
      <div className='mt-1.5 flex items-center justify-between gap-1 border-t border-white/15 pt-1.5'>
        <span className='pl-1 text-[11px] font-semibold text-white/85'>¡Celébralo!</span>
        <span className='flex'>
          {ICONOS.map(({ icono, etiqueta }) => (
            <button
              key={icono}
              type='button'
              aria-label={`Lanzar ${etiqueta}`}
              onClick={() => onIcon(icono)}
              onMouseEnter={() => onIcon(icono)}
              className='bell-icon-btn inline-flex h-8 w-8 items-center justify-center rounded-lg text-base leading-none'
            >
              {icono}
            </button>
          ))}
        </span>
      </div>
    </div>
  );
}
