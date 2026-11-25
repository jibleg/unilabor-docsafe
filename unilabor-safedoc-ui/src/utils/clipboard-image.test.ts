import { afterEach, describe, expect, it, vi } from 'vitest';
import { imageFromPaste, readClipboardImage } from './clipboard-image';

const pasteData = (items: unknown[]) => ({ items }) as unknown as DataTransfer;

describe('imagen del portapapeles', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('toma la imagen aunque venga acompañada de texto', () => {
    const image = new File(['x'], 'image.png', { type: 'image/png' });
    const file = imageFromPaste(pasteData([{ kind: 'string', type: 'text/html' }, { kind: 'file', type: 'image/png', getAsFile: () => image }]));
    expect(file?.type).toBe('image/png');
    expect(file?.name).toBe('portapapeles.png');
  });

  it('ignora texto y archivos que no son imagen', () => {
    expect(imageFromPaste(null)).toBeNull();
    expect(imageFromPaste(pasteData([{ kind: 'string', type: 'text/plain' }, { kind: 'file', type: 'application/pdf', getAsFile: () => null }]))).toBeNull();
  });

  it('el botón lee la imagen del portapapeles', async () => {
    const read = async () => [{ types: ['text/html', 'image/png'], getType: async () => new Blob(['x'], { type: 'image/png' }) }];
    vi.stubGlobal('navigator', { clipboard: { read } });
    expect((await readClipboardImage()).type).toBe('image/png');
  });

  it('el botón explica por qué no pudo pegar', async () => {
    vi.stubGlobal('navigator', {});
    await expect(readClipboardImage()).rejects.toThrow('Ctrl+V');
    vi.stubGlobal('navigator', { clipboard: { read: async () => Promise.reject(new Error('denied')) } });
    await expect(readClipboardImage()).rejects.toThrow('Permite el acceso');
    vi.stubGlobal('navigator', { clipboard: { read: async () => [{ types: ['text/plain'] }] } });
    await expect(readClipboardImage()).rejects.toThrow('no contiene una imagen');
  });
});
