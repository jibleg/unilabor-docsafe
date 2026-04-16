import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Eye,
  EyeOff,
  ImagePlus,
  Loader2,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import {
  changePassword,
  deleteMyAvatar,
  getApiErrorMessage,
  uploadMyAvatar,
} from '../api/service';
import { useAuthStore } from '../store/useAuthStore';
import { notifyError, notifySuccess, notifyWarning } from '../utils/notify';
import { normalizeRole } from '../utils/roles';
import { useUserAvatar } from '../hooks/useUserAvatar';

interface PasswordRule {
  label: string;
  valid: boolean;
}

const ALLOWED_AVATAR_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

const getRoleLabel = (role?: string | null): string => {
  const normalized = normalizeRole(role);
  if (normalized === 'ADMIN') {
    return 'Administrador';
  }
  if (normalized === 'EDITOR') {
    return 'Editor';
  }
  if (normalized === 'VIEWER') {
    return 'Visualizador';
  }
  return normalized || 'Usuario';
};

const getPasswordStrengthLabel = (score: number): string => {
  if (score <= 1) {
    return 'Muy debil';
  }
  if (score === 2) {
    return 'Debil';
  }
  if (score === 3) {
    return 'Aceptable';
  }
  if (score === 4) {
    return 'Fuerte';
  }
  return 'Muy fuerte';
};

const getPasswordStrengthColor = (score: number): string => {
  if (score <= 1) {
    return 'bg-[linear-gradient(90deg,#fda4af_0%,#fb7185_100%)]';
  }
  if (score === 2) {
    return 'bg-[linear-gradient(90deg,#f9c98b_0%,#f59e0b_100%)]';
  }
  if (score === 3) {
    return 'bg-[linear-gradient(90deg,#c9dff0_0%,#7cadd3_100%)]';
  }
  if (score === 4) {
    return 'bg-[linear-gradient(90deg,#7cadd3_0%,#0069a6_100%)]';
  }
  return 'bg-[linear-gradient(90deg,#00416a_0%,#0069a6_58%,#7cadd3_100%)]';
};

const loadImageFromBlob = (blob: Blob): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(blob);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('No se pudo abrir la imagen'));
    };

    image.src = objectUrl;
  });

const buildAvatarFile = async (blob: Blob): Promise<File> => {
  const image = await loadImageFromBlob(blob);
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 640;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('No se pudo preparar la imagen del avatar');
  }

  const shortestEdge = Math.min(image.width, image.height);
  const sourceX = Math.floor((image.width - shortestEdge) / 2);
  const sourceY = Math.floor((image.height - shortestEdge) / 2);

  context.drawImage(
    image,
    sourceX,
    sourceY,
    shortestEdge,
    shortestEdge,
    0,
    0,
    canvas.width,
    canvas.height,
  );

  const avatarBlob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', 0.9);
  });

  if (!avatarBlob) {
    throw new Error('No se pudo convertir la imagen del avatar');
  }

  return new File([avatarBlob], `avatar-${Date.now()}.jpg`, {
    type: 'image/jpeg',
  });
};

export const ProfilePage = () => {
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const { avatarUrl, loading: avatarLoading } = useUserAvatar();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [avatarSubmitting, setAvatarSubmitting] = useState(false);
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [capturingFromCamera, setCapturingFromCamera] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const captureInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const displayName = useMemo(
    () => user?.full_name ?? user?.name ?? 'Usuario',
    [user?.full_name, user?.name],
  );
  const displayEmail = user?.email ?? 'sin-correo@local';
  const roleLabel = getRoleLabel(user?.role);

  const avatarInitials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((chunk) => chunk[0]?.toUpperCase() ?? '')
    .join('');

  const stopCameraStream = () => {
    const activeStream = streamRef.current;
    if (!activeStream) {
      return;
    }

    activeStream.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  useEffect(
    () => () => {
      stopCameraStream();
    },
    [],
  );

  useEffect(() => {
    if (!isCameraModalOpen || !videoRef.current || !streamRef.current) {
      return;
    }

    const videoElement = videoRef.current;
    videoElement.srcObject = streamRef.current;

    const playPromise = videoElement.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => undefined);
    }

    return () => {
      videoElement.srcObject = null;
    };
  }, [isCameraModalOpen]);

  const passwordRules = useMemo<PasswordRule[]>(() => {
    const emailLocalPart = displayEmail.split('@')[0]?.toLowerCase() ?? '';
    return [
      { label: 'Minimo 12 caracteres', valid: newPassword.length >= 12 },
      { label: 'Al menos una mayuscula', valid: /[A-Z]/.test(newPassword) },
      { label: 'Al menos una minuscula', valid: /[a-z]/.test(newPassword) },
      { label: 'Al menos un numero', valid: /\d/.test(newPassword) },
      {
        label: 'Al menos un simbolo (@$!%*?&._-)',
        valid: /[^A-Za-z0-9]/.test(newPassword),
      },
      { label: 'Sin espacios en blanco', valid: !/\s/.test(newPassword) },
      {
        label: 'No debe incluir tu correo',
        valid:
          emailLocalPart.length === 0 ||
          !newPassword.toLowerCase().includes(emailLocalPart),
      },
    ];
  }, [newPassword, displayEmail]);

  const passwordScore = passwordRules.filter((rule) => rule.valid).length;
  const passwordsMatch =
    confirmPassword.length > 0 && newPassword === confirmPassword;
  const allRulesValid = passwordRules.every((rule) => rule.valid);
  const canSubmit =
    !submitting &&
    newPassword.length > 0 &&
    confirmPassword.length > 0 &&
    allRulesValid &&
    passwordsMatch;

  const uploadAvatarFromBlob = async (blob: Blob) => {
    const normalizedType = blob.type.trim().toLowerCase();
    if (!ALLOWED_AVATAR_MIME_TYPES.has(normalizedType)) {
      notifyWarning('Formato no permitido. Usa JPG, PNG o WEBP');
      return;
    }

    if ('size' in blob && blob.size > 5 * 1024 * 1024) {
      notifyWarning('La imagen no debe superar 5MB');
      return;
    }

    setAvatarSubmitting(true);
    try {
      const avatarFile = await buildAvatarFile(blob);
      const updatedProfile = await uploadMyAvatar(avatarFile);
      const mergedUser = user
        ? { ...user, ...updatedProfile, mustChangePassword: user.mustChangePassword }
        : updatedProfile;

      setUser(mergedUser);
      notifySuccess('Foto de perfil actualizada correctamente');
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo actualizar la foto de perfil'));
    } finally {
      setAvatarSubmitting(false);
    }
  };

  const handleAvatarInputChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const selectedFile = event.target.files?.[0];
    event.target.value = '';

    if (!selectedFile) {
      return;
    }

    await uploadAvatarFromBlob(selectedFile);
  };

  const openCameraModal = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      notifyWarning('La camara en vivo no esta disponible en este navegador');
      return;
    }

    setCameraLoading(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;
      setIsCameraModalOpen(true);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo abrir la camara'));
    } finally {
      setCameraLoading(false);
    }
  };

  const closeCameraModal = () => {
    stopCameraStream();
    setIsCameraModalOpen(false);
    setCapturingFromCamera(false);
  };

  const captureCameraPhoto = async () => {
    const videoElement = videoRef.current;
    if (!videoElement || videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
      notifyWarning('La camara aun no esta lista');
      return;
    }

    setCapturingFromCamera(true);
    try {
      const squareSize = Math.min(videoElement.videoWidth, videoElement.videoHeight);
      const sourceX = Math.floor((videoElement.videoWidth - squareSize) / 2);
      const sourceY = Math.floor((videoElement.videoHeight - squareSize) / 2);

      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 640;

      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('No se pudo inicializar la captura');
      }

      context.drawImage(
        videoElement,
        sourceX,
        sourceY,
        squareSize,
        squareSize,
        0,
        0,
        canvas.width,
        canvas.height,
      );

      const capturedBlob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/jpeg', 0.9);
      });

      if (!capturedBlob) {
        throw new Error('No se pudo capturar la foto');
      }

      await uploadAvatarFromBlob(capturedBlob);
      closeCameraModal();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo capturar la foto'));
    } finally {
      setCapturingFromCamera(false);
    }
  };

  const handleRemoveAvatar = async () => {
    if (!user?.avatar_path) {
      notifyWarning('No tienes una foto de perfil configurada');
      return;
    }

    setAvatarSubmitting(true);
    try {
      await deleteMyAvatar();
      setUser({ ...user, avatar_path: '' });
      notifySuccess('Foto de perfil eliminada correctamente');
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo eliminar la foto de perfil'));
    } finally {
      setAvatarSubmitting(false);
    }
  };

  const handleChangePassword = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!allRulesValid) {
      notifyWarning('La nueva contrasena no cumple con la politica de seguridad');
      return;
    }

    if (!passwordsMatch) {
      notifyWarning('La confirmacion de contrasena no coincide');
      return;
    }

    setSubmitting(true);
    try {
      await changePassword(newPassword);
      setNewPassword('');
      setConfirmPassword('');
      setShowNewPassword(false);
      setShowConfirmPassword(false);
      notifySuccess('Contrasena actualizada correctamente');
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo actualizar la contrasena'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp"
        className="hidden"
        onChange={(event) => void handleAvatarInputChange(event)}
      />
      <input
        ref={captureInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp"
        capture="user"
        className="hidden"
        onChange={(event) => void handleAvatarInputChange(event)}
      />

      <div className="space-y-6">
        <section className="relative overflow-hidden rounded-3xl border border-[rgba(0,65,106,0.08)] bg-[linear-gradient(135deg,#ffffff_0%,#eef5fa_56%,#dbe8f2_100%)] p-6 shadow-2xl shadow-[rgba(0,65,106,0.1)] backdrop-blur-xl lg:p-8">
          <div className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full bg-[rgba(124,173,211,0.22)] blur-3xl" />
          <div className="pointer-events-none absolute -left-10 -bottom-20 h-56 w-56 rounded-full bg-[rgba(191,212,230,0.28)] blur-3xl" />

          <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="h-24 w-24 overflow-hidden rounded-3xl border border-[rgba(0,65,106,0.12)] bg-[linear-gradient(135deg,#bfd4e6_0%,#7cadd3_55%,#00416a_100%)] shadow-xl shadow-[rgba(0,65,106,0.18)]">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={`Avatar de ${displayName}`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-2xl font-black text-white">
                      {avatarInitials || 'U'}
                    </div>
                  )}

                  {avatarLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-[rgba(11,34,53,0.42)]">
                      <Loader2 size={18} className="animate-spin text-white" />
                    </div>
                  )}
                </div>
                <span className="absolute -bottom-2 -right-2 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/90 bg-white text-[var(--color-brand-700)] shadow-lg shadow-[rgba(0,65,106,0.16)]">
                  <ShieldCheck size={14} />
                </span>
              </div>

              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-[var(--color-brand-500)]">Perfil personal</p>
                <h1 className="mt-1 text-2xl font-black tracking-tight text-[var(--color-brand-700)]">
                  {displayName}
                </h1>
                <p className="mt-1 text-sm text-[var(--unilabor-neutral)]">{displayEmail}</p>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <div className="inline-flex items-center gap-2 self-start rounded-full border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.34)] px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-700)]">
                <ShieldCheck size={14} />
                Acceso activo: {roleLabel}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={avatarSubmitting}
                  className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-2 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <ImagePlus size={14} />
                  Subir foto
                </button>
                <button
                  type="button"
                  onClick={() => void openCameraModal()}
                  disabled={cameraLoading || avatarSubmitting}
                  className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.12)] bg-white/92 px-3 py-2 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {cameraLoading ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
                  Camara en vivo
                </button>
                <button
                  type="button"
                  onClick={() => void handleRemoveAvatar()}
                  disabled={avatarSubmitting || !user?.avatar_path}
                  className="inline-flex items-center gap-2 rounded-xl border border-[rgba(151,163,172,0.28)] bg-[rgba(151,163,172,0.16)] px-3 py-2 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(151,163,172,0.24)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Trash2 size={14} />
                  Quitar foto
                </button>
              </div>
              <p className="text-[11px] text-[var(--unilabor-neutral)]">
                Tu avatar se guarda de forma segura en el servidor y se sincroniza entre dispositivos.
              </p>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <section className="rounded-3xl border border-[rgba(0,65,106,0.08)] bg-white/88 p-6 shadow-xl shadow-[rgba(0,65,106,0.08)] backdrop-blur-xl xl:col-span-1">
            <h2 className="text-base font-bold uppercase tracking-wide text-[var(--color-brand-700)]">
              Informacion de cuenta
            </h2>
            <div className="mt-5 space-y-4">
              <div className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.92)] p-4">
                <p className="text-[11px] uppercase tracking-wide text-[var(--unilabor-neutral)]">Nombre</p>
                <p className="mt-1 text-sm font-semibold text-[var(--color-brand-700)]">{displayName}</p>
              </div>
              <div className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.92)] p-4">
                <p className="text-[11px] uppercase tracking-wide text-[var(--unilabor-neutral)]">Correo institucional</p>
                <p className="mt-1 inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-brand-700)]">
                  <Mail size={14} className="text-[var(--color-brand-500)]" />
                  {displayEmail}
                </p>
              </div>
              <div className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.92)] p-4">
                <p className="text-[11px] uppercase tracking-wide text-[var(--unilabor-neutral)]">Rol</p>
                <p className="mt-1 inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-brand-700)]">
                  <UserRound size={14} />
                  {roleLabel}
                </p>
              </div>
              <div className="rounded-2xl border border-[rgba(124,173,211,0.2)] bg-[rgba(191,212,230,0.24)] p-4">
                <p className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--color-brand-700)]">
                  <AlertTriangle size={14} />
                  Recomendacion de seguridad
                </p>
                <p className="mt-2 text-xs leading-5 text-[var(--unilabor-ink)]">
                  Actualiza tu contrasena periodicamente y evita reutilizar claves de otros sistemas.
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-[rgba(0,65,106,0.08)] bg-white/88 p-6 shadow-xl shadow-[rgba(0,65,106,0.08)] backdrop-blur-xl xl:col-span-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-base font-bold uppercase tracking-wide text-[var(--color-brand-700)]">
                Seguridad y contrasena
              </h2>
              <span className="text-xs text-[var(--unilabor-neutral)]">
                La clave debe cumplir politica corporativa de complejidad
              </span>
            </div>

            <form onSubmit={handleChangePassword} className="mt-6 space-y-5">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-[var(--color-brand-700)]">Nueva contrasena</label>
                  <div className="relative">
                    <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--unilabor-neutral)]" size={16} />
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      placeholder="NuevaClaveSegura123*"
                      className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] py-2.5 pl-10 pr-11 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((value) => !value)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--unilabor-neutral)] transition hover:text-[var(--color-brand-700)]"
                      aria-label={showNewPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}
                    >
                      {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-[var(--color-brand-700)]">Confirmar contrasena</label>
                  <div className="relative">
                    <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--unilabor-neutral)]" size={16} />
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      placeholder="Repite la nueva contrasena"
                      className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] py-2.5 pl-10 pr-11 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((value) => !value)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--unilabor-neutral)] transition hover:text-[var(--color-brand-700)]"
                      aria-label={showConfirmPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}
                    >
                      {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.95)] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                    Fortaleza de contrasena
                  </p>
                  <p className="text-xs font-bold text-[var(--color-brand-700)]">
                    {getPasswordStrengthLabel(passwordScore)}
                  </p>
                </div>
                <div className="h-2 rounded-full bg-[rgba(191,212,230,0.55)]">
                  <div
                    className={`h-full rounded-full transition-all ${getPasswordStrengthColor(passwordScore)}`}
                    style={{ width: `${(passwordScore / passwordRules.length) * 100}%` }}
                  />
                </div>
                <div className="mt-4 grid grid-cols-1 gap-2 lg:grid-cols-2">
                  {passwordRules.map((rule) => (
                    <p
                      key={rule.label}
                      className={`inline-flex items-center gap-2 text-xs ${
                        rule.valid ? 'text-[var(--color-brand-700)]' : 'text-[var(--unilabor-neutral)]'
                      }`}
                    >
                      <CheckCircle2 size={14} />
                      {rule.label}
                    </p>
                  ))}
                  <p
                    className={`inline-flex items-center gap-2 text-xs ${
                      passwordsMatch ? 'text-[var(--color-brand-700)]' : 'text-[var(--unilabor-neutral)]'
                    }`}
                  >
                    <CheckCircle2 size={14} />
                    Confirmacion coincide
                  </p>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="inline-flex min-w-56 items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,#00416a_0%,#0069a6_58%,#7cadd3_100%)] px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-[rgba(0,65,106,0.24)] transition hover:-translate-y-0.5 hover:brightness-105 disabled:cursor-not-allowed disabled:translate-y-0 disabled:bg-[rgba(191,212,230,0.9)] disabled:text-[var(--color-brand-700)] disabled:shadow-none"
                >
                  {submitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Actualizando...
                    </>
                  ) : (
                    'Actualizar contrasena'
                  )}
                </button>
              </div>
            </form>
          </section>
        </div>
      </div>

      {isCameraModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(11,34,53,0.28)] p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-[rgba(0,65,106,0.1)] bg-white/95 shadow-2xl shadow-[rgba(0,65,106,0.16)]">
            <div className="flex items-center justify-between border-b border-[rgba(0,65,106,0.08)] px-4 py-3">
              <div>
                <p className="text-sm font-bold text-[var(--color-brand-700)]">Captura de avatar</p>
                <p className="text-xs text-[var(--unilabor-neutral)]">Alinea tu rostro al centro y toma la foto</p>
              </div>
              <button
                type="button"
                onClick={closeCameraModal}
                className="rounded-lg p-2 text-[var(--unilabor-neutral)] transition hover:bg-[rgba(191,212,230,0.28)] hover:text-[var(--color-brand-700)]"
                aria-label="Cerrar camara"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4 p-4">
              <div className="overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.92)]">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="h-full max-h-[60vh] w-full object-cover"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeCameraModal}
                  className="rounded-xl border border-[rgba(0,65,106,0.12)] px-4 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void captureCameraPhoto()}
                  disabled={capturingFromCamera || avatarSubmitting}
                  className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-4 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {capturingFromCamera ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Camera size={16} />
                  )}
                  Capturar foto
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
