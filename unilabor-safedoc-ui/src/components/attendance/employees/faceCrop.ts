/** Geometria del recorte de rostro (puro): marco 3:4 sobre la imagen, con zoom y desplazamiento. */

/** Marco de recorte en pantalla (px) y salida exportada (px), ambos 3:4. */
export const FRAME_WIDTH = 270;
export const FRAME_HEIGHT = 360;
export const OUTPUT_WIDTH = 480;
export const OUTPUT_HEIGHT = 640;
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;
/** El reloj acepta fotos pequenas; el servidor rechaza mas de 400 KB. */
export const MAX_OUTPUT_BYTES = 380 * 1024;

export interface CropState {
  zoom: number;
  /** Desplazamiento del centro de la imagen respecto al centro del marco (px de pantalla). */
  x: number;
  y: number;
}

export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** Escala que hace que la imagen cubra el marco (zoom 1). */
export const baseScale = (imageWidth: number, imageHeight: number): number =>
  Math.max(FRAME_WIDTH / imageWidth, FRAME_HEIGHT / imageHeight);

/** Limita zoom y desplazamiento para que la imagen siempre cubra el marco. */
export const clampCrop = (imageWidth: number, imageHeight: number, state: CropState): CropState => {
  const zoom = clamp(state.zoom, MIN_ZOOM, MAX_ZOOM);
  const scale = baseScale(imageWidth, imageHeight) * zoom;
  const maxX = Math.max(0, (imageWidth * scale - FRAME_WIDTH) / 2);
  const maxY = Math.max(0, (imageHeight * scale - FRAME_HEIGHT) / 2);
  return { zoom, x: clamp(state.x, -maxX, maxX), y: clamp(state.y, -maxY, maxY) };
};

/** Cambia el zoom conservando el punto central visible y respetando los limites. */
export const zoomTo = (imageWidth: number, imageHeight: number, state: CropState, nextZoom: number): CropState => {
  const nextClamped = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
  const ratio = nextClamped / state.zoom;
  return clampCrop(imageWidth, imageHeight, { zoom: nextClamped, x: state.x * ratio, y: state.y * ratio });
};

/** Rectangulo de la imagen original (px) que queda dentro del marco. */
export const sourceRect = (imageWidth: number, imageHeight: number, state: CropState) => {
  const scale = baseScale(imageWidth, imageHeight) * state.zoom;
  const width = FRAME_WIDTH / scale;
  const height = FRAME_HEIGHT / scale;
  return {
    sx: imageWidth / 2 - state.x / scale - width / 2,
    sy: imageHeight / 2 - state.y / scale - height / 2,
    sw: width,
    sh: height,
  };
};

/** Posicion y tamano (px de pantalla) con que se dibuja la imagen dentro del marco. */
export const imageBox = (imageWidth: number, imageHeight: number, state: CropState) => {
  const scale = baseScale(imageWidth, imageHeight) * state.zoom;
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return { width, height, left: FRAME_WIDTH / 2 - width / 2 + state.x, top: FRAME_HEIGHT / 2 - height / 2 + state.y };
};

const toBlob = (canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> =>
  new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));

/** Exporta el recorte a JPEG 480x640, bajando la calidad hasta quedar bajo el limite de tamano. */
export const exportFaceJpeg = async (image: HTMLImageElement, state: CropState): Promise<Blob> => {
  const canvas = document.createElement('canvas');
  canvas.width = OUTPUT_WIDTH;
  canvas.height = OUTPUT_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('El navegador no pudo preparar la imagen.');
  const { sx, sy, sw, sh } = sourceRect(image.naturalWidth, image.naturalHeight, state);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
  context.drawImage(image, sx, sy, sw, sh, 0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
  for (let quality = 0.92; quality >= 0.4; quality -= 0.08) {
    const blob = await toBlob(canvas, quality);
    if (blob && blob.size <= MAX_OUTPUT_BYTES) return blob;
  }
  throw new Error('No se pudo reducir la fotografía por debajo de 400 KB.');
};
