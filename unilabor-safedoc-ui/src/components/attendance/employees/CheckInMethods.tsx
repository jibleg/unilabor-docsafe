import { CheckCircle2, Fingerprint, ScanFace, type LucideIcon } from 'lucide-react';
import type { AttendanceEmployee } from '../../../api/service.api-attendance-employees';

interface MethodProps {
  Icon: LucideIcon;
  label: string;
  active: boolean;
  /** Mismos colores que en la pantalla de Checadas: huella violeta, rostro verde. */
  background: string;
  color: string;
  border: string;
  emptyLabel: string;
}

const Method = ({ Icon, label, active, background, color, border, emptyLabel }: MethodProps) => (
  <li
    className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold"
    style={active ? { backgroundColor: background, color, borderColor: border } : { borderStyle: 'dashed', borderColor: '#cbd5e1', color: '#64748b' }}
    title={active ? `${label}: registrada` : emptyLabel}
  >
    <Icon size={14} aria-hidden="true" />
    {active ? label : emptyLabel}
    {active ? <CheckCircle2 size={12} aria-hidden="true" /> : null}
  </li>
);

/** Con que metodos puede checar el colaborador: huella y/o rostro registrados. */
export const CheckInMethods = ({ employee }: { employee: AttendanceEmployee }) => {
  const { fingerprint, face } = employee.biometrics;
  const summary = fingerprint && face
    ? 'Puede checar con huella y con rostro.'
    : fingerprint
      ? 'Puede checar con huella.'
      : face
        ? 'Puede checar con rostro.'
        : 'Aún no tiene huella ni rostro registrados en el reloj.';
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Métodos para checar</p>
      <ul className="flex flex-wrap gap-2" aria-label="Métodos para checar">
        <Method Icon={Fingerprint} label="Huella" active={fingerprint} background="#ede9fe" color="#5b21b6" border="#c4b5fd" emptyLabel="Sin huella" />
        <Method Icon={ScanFace} label="Rostro" active={face} background="#d1fae5" color="#065f46" border="#6ee7b7" emptyLabel="Sin rostro" />
      </ul>
      <p className="mt-1 text-xs text-[var(--unilabor-neutral)]">{summary}</p>
    </div>
  );
};
