import { useEffect, useRef, type RefObject } from 'react';
import { imageFromPaste } from '../utils/clipboard-image';

const ZONE_ATTRIBUTE = 'data-image-paste-zone';

/** La zona bajo el puntero; si no hay, la que tiene el foco. Solo una recibe el pegado. */
const currentZone = (): Element | null =>
  document.querySelector(`[${ZONE_ATTRIBUTE}]:hover`) ?? document.activeElement?.closest(`[${ZONE_ATTRIBUTE}]`) ?? null;

const isEditable = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA'].includes(target.tagName));

/** Entrega la imagen pegada con Ctrl+V / Cmd+V cuando `zoneRef` esta bajo el puntero o con el foco. */
export const useImagePaste = (zoneRef: RefObject<HTMLElement | null>, enabled: boolean, onImage: (file: File) => void): void => {
  const handler = useRef(onImage);
  useEffect(() => {
    handler.current = onImage;
  });

  useEffect(() => {
    const zone = zoneRef.current;
    if (!enabled || !zone) return undefined;
    zone.setAttribute(ZONE_ATTRIBUTE, '');
    const handlePaste = (event: ClipboardEvent) => {
      if (currentZone() !== zone) return;
      // Pegar texto en un campo sigue siendo pegar texto, aunque venga con imagen (Word, Excel).
      if (isEditable(event.target) && event.clipboardData?.types.includes('text/plain')) return;
      const file = imageFromPaste(event.clipboardData);
      if (!file) return;
      event.preventDefault();
      handler.current(file);
    };
    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
      zone.removeAttribute(ZONE_ATTRIBUTE);
    };
  }, [zoneRef, enabled]);
};
