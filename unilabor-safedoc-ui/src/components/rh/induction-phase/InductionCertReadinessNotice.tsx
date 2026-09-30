import type { RhInductionCertificateReadiness } from '../../../api/service.api-rh-induction';
import { certReadinessIssues } from '../../../utils/inductionCertReadiness';
import { sectionTitleClass } from './styles';

/** Radiografía de la constancia de la fase: qué falta para que salga completa. */
export const InductionCertReadinessNotice = ({ readiness }: { readiness: RhInductionCertificateReadiness }) => {
  const issues = certReadinessIssues(readiness);
  return (
    <div>
      <h3 className={sectionTitleClass}>Preparación de la constancia</h3>
      {issues.length === 0 ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-700">
          ✓ Constancia completa: puesto, sucursal, duración y firmas están capturados para los {readiness.pending_enrollments} inscrito(s)
          pendientes de aprobar.
        </div>
      ) : (
        <div className="space-y-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
          <p className="font-bold">⚠ Las constancias de esta fase saldrían incompletas — falta información:</p>
          {issues.map((issue) => (
            <p key={issue}>• {issue}</p>
          ))}
        </div>
      )}
    </div>
  );
};
