import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, ScanLine } from 'lucide-react';

// El decodificador (@zxing) es pesado: se carga bajo demanda al encender la
// camara para no inflar el chunk de la pagina.
type ScannerControls = { stop: () => void };

interface BarcodeScannerProps {
  // Se dispara con cada codigo leido (escaner fisico o camara). Codigos 1D y 2D.
  onScan: (code: string) => void;
  disabled?: boolean;
}

// Cotejo por codigo: soporta lector fisico (teclado-emulado, campo de texto que
// captura hasta Enter) y camara del dispositivo (ZXing, decodifica Code128/QR y
// otros formatos 1D/2D). Ambos desembocan en onScan.
export const BarcodeScanner = ({ onScan, disabled = false }: BarcodeScannerProps) => {
  const [manualValue, setManualValue] = useState('');
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<ScannerControls | null>(null);
  const lastScan = useRef<{ code: string; at: number }>({ code: '', at: 0 });

  const emit = (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) {
      return;
    }
    // Anti-rebote: ignora el mismo codigo dentro de 1.5 s (la camara lee en bucle).
    const now = Date.now();
    if (lastScan.current.code === trimmed && now - lastScan.current.at < 1500) {
      return;
    }
    lastScan.current = { code: trimmed, at: now };
    onScan(trimmed);
  };

  const stopCamera = () => {
    controlsRef.current?.stop();
    controlsRef.current = null;
  };

  useEffect(() => {
    if (!cameraOn) {
      stopCamera();
      return;
    }
    let cancelled = false;
    setCameraError(null);
    void (async () => {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: 'environment' } },
          videoRef.current ?? undefined,
          (result) => {
            if (result) {
              emit(result.getText());
            }
          },
        );
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
      } catch {
        if (!cancelled) {
          setCameraError('No se pudo acceder a la cámara. Revisa los permisos del navegador.');
          setCameraOn(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraOn]);

  const handleManualKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      emit(manualValue);
      setManualValue('');
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-white px-3 py-2">
          <ScanLine size={16} className="text-[var(--color-brand-700)]" />
          <input
            value={manualValue}
            onChange={(event) => setManualValue(event.target.value)}
            onKeyDown={handleManualKeyDown}
            disabled={disabled}
            placeholder="Escanea con lector físico o escribe el código y Enter"
            className="w-full bg-transparent text-sm text-[var(--unilabor-ink)] outline-none disabled:opacity-50"
            autoFocus
          />
        </div>
        <button
          type="button"
          onClick={() => setCameraOn((value) => !value)}
          disabled={disabled}
          className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition disabled:opacity-50 ${
            cameraOn
              ? 'bg-[#b02a2a] text-white hover:opacity-90'
              : 'border border-[rgba(0,65,106,0.14)] text-[var(--color-brand-700)] hover:bg-[rgba(191,212,230,0.28)]'
          }`}
        >
          {cameraOn ? <CameraOff size={16} /> : <Camera size={16} />}
          {cameraOn ? 'Apagar cámara' : 'Usar cámara'}
        </button>
      </div>

      {cameraOn ? (
        <div className="overflow-hidden rounded-xl border border-[rgba(0,65,106,0.14)] bg-black">
          <video ref={videoRef} className="max-h-64 w-full object-contain" muted playsInline />
        </div>
      ) : null}

      {cameraError ? (
        <p className="rounded-lg border border-[rgba(176,42,42,0.2)] bg-[rgba(176,42,42,0.06)] px-3 py-2 text-xs text-[#b02a2a]">
          {cameraError}
        </p>
      ) : null}
    </div>
  );
};
