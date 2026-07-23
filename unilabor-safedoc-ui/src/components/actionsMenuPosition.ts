// Calculo de la posicion del menu de acciones dentro del viewport.
// Vive aparte del componente porque la regla de fast-refresh no permite que un
// archivo de componentes exporte tambien funciones.

export const MENU_WIDTH = 200;

/** Aire minimo contra los bordes de la ventana. */
export const VIEWPORT_MARGIN = 8;

/**
 * Coloca el menu dentro del viewport. Se abre hacia abajo salvo que no quepa:
 * en las ultimas filas de una tabla larga eso lo dejaba cortado por el borde
 * inferior, y como el scroll cierra el menu, quedaba inalcanzable.
 *
 * Se calcula con el alto REAL del menu ya renderizado, no estimado, para que
 * siga funcionando aunque una fila tenga mas acciones que otra.
 */
export const resolveMenuPosition = (
  button: { top: number; bottom: number; right: number },
  menuHeight: number,
  viewport: { width: number; height: number },
): { top: number; left: number } => {
  const below = button.bottom + 4;
  const fitsBelow = below + menuHeight <= viewport.height - VIEWPORT_MARGIN;
  const above = button.top - menuHeight - 4;

  let top: number;
  if (fitsBelow) {
    top = below;
  } else if (above >= VIEWPORT_MARGIN) {
    top = above;
  } else {
    // No cabe ni arriba ni abajo (ventana muy baja): se pega al borde y el
    // propio menu hace scroll interno.
    top = Math.max(VIEWPORT_MARGIN, viewport.height - menuHeight - VIEWPORT_MARGIN);
  }

  const left = Math.max(
    VIEWPORT_MARGIN,
    Math.min(button.right - MENU_WIDTH, viewport.width - MENU_WIDTH - VIEWPORT_MARGIN),
  );

  return { top, left };
};

