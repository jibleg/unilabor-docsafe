import { describe, expect, it } from 'vitest';
import { FRAME_HEIGHT, FRAME_WIDTH, baseScale, clampCrop, imageBox, sourceRect, zoomTo } from './faceCrop';

describe('faceCrop', () => {
  it('la imagen cubre el marco a zoom 1 (vertical y horizontal)', () => {
    expect(baseScale(600, 800) * 600).toBeGreaterThanOrEqual(FRAME_WIDTH);
    expect(baseScale(1600, 900) * 900).toBeGreaterThanOrEqual(FRAME_HEIGHT);
    const box = imageBox(1600, 900, { zoom: 1, x: 0, y: 0 });
    expect(box.height).toBeCloseTo(FRAME_HEIGHT);
    expect(box.width).toBeGreaterThan(FRAME_WIDTH);
  });

  it('limita zoom y desplazamiento para no dejar huecos', () => {
    const clamped = clampCrop(1600, 900, { zoom: 9, x: 99999, y: -99999 });
    expect(clamped.zoom).toBe(4);
    const box = imageBox(1600, 900, clamped);
    expect(box.left).toBeLessThanOrEqual(0);
    expect(box.left + box.width).toBeGreaterThanOrEqual(FRAME_WIDTH);
    expect(box.top).toBeLessThanOrEqual(0);
    expect(box.top + box.height).toBeGreaterThanOrEqual(FRAME_HEIGHT);
    expect(clampCrop(600, 800, { zoom: 0.2, x: 50, y: 50 }).zoom).toBe(1);
  });

  it('el rectangulo origen es 3:4 y queda dentro de la imagen', () => {
    const rect = sourceRect(1200, 1600, { zoom: 2, x: 0, y: 0 });
    expect(rect.sw / rect.sh).toBeCloseTo(FRAME_WIDTH / FRAME_HEIGHT);
    expect(rect.sx).toBeGreaterThanOrEqual(0);
    expect(rect.sy).toBeGreaterThanOrEqual(0);
    expect(rect.sx + rect.sw).toBeLessThanOrEqual(1200 + 1e-6);
    expect(rect.sy + rect.sh).toBeLessThanOrEqual(1600 + 1e-6);
    // zoom mayor => recorte mas pequeno
    expect(sourceRect(1200, 1600, { zoom: 1, x: 0, y: 0 }).sw).toBeGreaterThan(rect.sw);
  });

  it('zoomTo conserva el centro proporcionalmente', () => {
    const base = clampCrop(1200, 1600, { zoom: 2, x: 20, y: -30 });
    const next = zoomTo(1200, 1600, base, 3);
    expect(next.zoom).toBe(3);
    expect(next.x).toBeCloseTo(base.x * 1.5);
    expect(next.y).toBeCloseTo(base.y * 1.5);
  });
});
