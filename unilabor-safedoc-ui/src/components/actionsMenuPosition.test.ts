import { describe, expect, it } from 'vitest';
import { resolveMenuPosition } from './actionsMenuPosition';

const VIEWPORT = { width: 1440, height: 900 };
const MENU_HEIGHT = 180;
const MENU_WIDTH = 200;

describe('resolveMenuPosition', () => {
  it('se abre hacia abajo cuando hay espacio', () => {
    const button = { top: 300, bottom: 324, right: 1200 };

    expect(resolveMenuPosition(button, MENU_HEIGHT, VIEWPORT).top).toBe(328);
  });

  it('se abre hacia ARRIBA cuando no cabe abajo', () => {
    // Regresion: una fila al final de la tabla dejaba el menu cortado por el
    // borde inferior, y como el scroll lo cierra, quedaba inalcanzable.
    const button = { top: 840, bottom: 864, right: 1200 };

    const { top } = resolveMenuPosition(button, MENU_HEIGHT, VIEWPORT);

    expect(top).toBe(840 - MENU_HEIGHT - 4);
    expect(top + MENU_HEIGHT).toBeLessThanOrEqual(VIEWPORT.height);
  });

  it('nunca se sale por abajo, sea cual sea la fila', () => {
    for (let bottom = 100; bottom < VIEWPORT.height; bottom += 25) {
      const { top } = resolveMenuPosition(
        { top: bottom - 24, bottom, right: 1200 },
        MENU_HEIGHT,
        VIEWPORT,
      );
      expect(top).toBeGreaterThanOrEqual(8);
      expect(top + MENU_HEIGHT).toBeLessThanOrEqual(VIEWPORT.height);
    }
  });

  it('en una ventana mas baja que el menu lo pega al borde superior', () => {
    // El menu hace scroll interno; lo importante es que no arranque fuera.
    const { top } = resolveMenuPosition(
      { top: 60, bottom: 84, right: 400 },
      300,
      { width: 800, height: 200 },
    );

    expect(top).toBe(8);
  });

  it('no se sale por la derecha cuando el boton esta pegado al borde', () => {
    const { left } = resolveMenuPosition(
      { top: 100, bottom: 124, right: VIEWPORT.width },
      MENU_HEIGHT,
      VIEWPORT,
    );

    expect(left + MENU_WIDTH).toBeLessThanOrEqual(VIEWPORT.width);
  });

  it('no se sale por la izquierda en pantallas angostas', () => {
    const { left } = resolveMenuPosition(
      { top: 100, bottom: 124, right: 120 },
      MENU_HEIGHT,
      { width: 360, height: 640 },
    );

    expect(left).toBeGreaterThanOrEqual(8);
  });
});
