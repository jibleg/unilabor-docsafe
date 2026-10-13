import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Loader2, RefreshCw, Smartphone, X } from 'lucide-react';
import { notifyError } from '../../../utils/notify';
import { FRAME_HEIGHT, FRAME_WIDTH } from './faceCrop';
import { primaryButtonClass, secondaryButtonClass } from './ui';

interface Props {
  /** Foto tomada (JPEG sin recortar); sigue al paso de encuadre y zoom. */
  onCapture: (file: File) => void;
  onCancel: () => void;
}

type Facing = 'user' | 'environment';

const cameraErrorMessage = (error: unknown): string => {
  const name = (error as { name?: string })?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'El navegador no tiene permiso para usar la cámara. Permítelo en la barra de direcciones y vuelve a intentar.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No se encontró una cámara en este equipo.';
  if (name === 'NotReadableError') return 'La cámara está siendo usada por otra aplicación.';
  return 'No se pudo abrir la cámara.';
};

/** Toma de foto con la camara de la PC o del celular (getUserMedia); requiere HTTPS o localhost. */
export const FaceCameraCapture = ({ onCapture, onCancel }: Props) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const [facing, setFacing] = useState<Facing>('user');
  const [status, setStatus] = useState<'starting' | 'ready' | 'error'>('starting');
  const [message, setMessage] = useState('');
  const [hasSeveralCameras, setHasSeveralCameras] = useState(false);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async (mode: Facing) => {
    stop();
    setStatus('starting');
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage('Este navegador no permite abrir la cámara desde esta dirección: se requiere conexión segura (HTTPS) o localhost. En el celular usa "Cámara del celular".');
      setStatus('error');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode, width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => undefined);
      }
      setStatus('ready');
      navigator.mediaDevices.enumerateDevices().then((devices) => setHasSeveralCameras(devices.filter((d) => d.kind === 'videoinput').length > 1)).catch(() => undefined);
    } catch (error) {
      setMessage(cameraErrorMessage(error));
      setStatus('error');
    }
  }, [stop]);

  useEffect(() => {
    void start(facing);
    return stop;
  }, [facing, start, stop]);

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return notifyError('La cámara aún no está lista.');
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) return notifyError('El navegador no pudo preparar la imagen.');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return notifyError('No se pudo tomar la fotografía.');
      stop();
      onCapture(new File([blob], 'camara.jpg', { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.92);
  };

  return (
    <div className="space-y-3">
      <input
        ref={phoneInputRef}
        type="file"
        accept="image/*"
        capture="user"
        className="sr-only"
        aria-label="Tomar foto con la cámara del celular"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) {
            stop();
            onCapture(file);
          }
        }}
      />
      <div className="flex justify-center">
        <div className="relative overflow-hidden rounded-xl bg-slate-900" style={{ width: FRAME_WIDTH, height: FRAME_HEIGHT }}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            aria-label="Vista previa de la cámara"
            className="h-full w-full object-cover"
            style={{ transform: facing === 'user' ? 'scaleX(-1)' : undefined }}
          />
          {status === 'starting' && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/70 text-white" role="status">
              <Loader2 className="animate-spin" size={28} aria-label="Abriendo la cámara" />
            </div>
          )}
          {status === 'error' && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/85 p-4 text-center text-xs text-white" role="alert">
              {message}
            </div>
          )}
          {status === 'ready' && (
            <svg className="pointer-events-none absolute inset-0" width={FRAME_WIDTH} height={FRAME_HEIGHT} aria-hidden="true">
              <ellipse cx={FRAME_WIDTH / 2} cy={FRAME_HEIGHT * 0.45} rx={FRAME_WIDTH * 0.34} ry={FRAME_HEIGHT * 0.34} fill="none" stroke="white" strokeWidth="2" strokeDasharray="6 5" />
            </svg>
          )}
        </div>
      </div>
      <p className="text-center text-xs text-[var(--unilabor-neutral)]">
        Coloca el rostro de frente dentro del óvalo, con buena luz. En el siguiente paso podrás ajustar el zoom y el encuadre.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" className={primaryButtonClass} onClick={capture} disabled={status !== 'ready'}>
          <Camera size={15} aria-hidden="true" /> Tomar foto
        </button>
        {hasSeveralCameras && (
          <button type="button" className={secondaryButtonClass} onClick={() => setFacing((mode) => (mode === 'user' ? 'environment' : 'user'))} title="Cambiar de cámara">
            <RefreshCw size={15} aria-hidden="true" /> Cambiar cámara
          </button>
        )}
        <button type="button" className={secondaryButtonClass} onClick={() => phoneInputRef.current?.click()} title="Abre la cámara nativa del celular">
          <Smartphone size={15} aria-hidden="true" /> Cámara del celular
        </button>
        <button type="button" className={secondaryButtonClass} onClick={() => { stop(); onCancel(); }}>
          <X size={15} aria-hidden="true" /> Cerrar cámara
        </button>
      </div>
    </div>
  );
};
