import { History } from 'lucide-react';
import { InductionSection as Section } from './InductionSection';
import type { InductionAuditEntry } from '../../../types/models';
import { formatDateTime } from '../../../utils/inductionDashboard';

const AUDIT_LABEL: Array<[string, string]> = [
  ['RH_INDUCTION_RETRY_AUTHORIZED', 'Nuevo intento autorizado'],
  ['RH_INDUCTION_READING_REOPENED', 'Lectura reabierta'],
  ['RH_INDUCTION_ATTEMPT_RESET', 'Intento truncado reabierto'],
  ['RH_INDUCTION_ADVANCED', 'Avance manual de fase'],
  ['RH_INDUCTION_CERTIFICATE_ISSUED', 'Constancia emitida'],
  ['RH_INDUCTION_NOTICE_RESENT', 'Aviso SMS reenviado'],
  ['RH_EVAL_AUTHORIZE_LATE', 'Autorización extemporánea'],
  ['RH_EVAL_MANUAL_CLOSE', 'Cierre manual de evaluación'],
  ['RH_INDUCTION_GRACE_ENDED', 'Descanso terminado por RH'],
  ['RH_INDUCTION_COMPETENCY_STARTED', 'Evaluación de competencia (Fase 7) abierta'],
  ['RH_INDUCTION_PRACTICAL_CAPTURED', 'Evaluación práctica capturada'],
];

const auditLabel = (action: string): string => AUDIT_LABEL.find(([prefix]) => action.startsWith(prefix))?.[1] ?? action;

/** Bitácora de acciones de RH sobre la inducción del colaborador. */
export const InductionAuditLog = ({ audit }: { audit: InductionAuditEntry[] }) => (
  <Section icon={History} title="Bitácora de gestión">
    {audit.length === 0 ? (
      <p className="text-xs text-[var(--unilabor-neutral)]">Sin acciones de RH registradas.</p>
    ) : (
      <ul className="space-y-1">
        {audit.map((entry) => (
          <li key={entry.id} className="flex items-start justify-between gap-3 rounded-lg bg-white px-3 py-1.5 text-xs">
            <div>
              <p className="font-semibold text-[var(--unilabor-ink)]">{auditLabel(entry.action)}</p>
              {entry.metadata && typeof entry.metadata.note === 'string' && entry.metadata.note ? (
                <p className="text-[11px] italic text-[var(--unilabor-neutral)]">“{entry.metadata.note}”</p>
              ) : null}
            </div>
            <div className="shrink-0 text-right text-[10px] text-[var(--unilabor-neutral)]">
              <p>{formatDateTime(entry.occurred_at)}</p>
              <p>{entry.actor_name ?? 'Sistema'}</p>
            </div>
          </li>
        ))}
      </ul>
    )}
  </Section>
);
