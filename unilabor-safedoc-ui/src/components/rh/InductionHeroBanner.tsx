import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, BookOpenCheck, GraduationCap } from 'lucide-react';
import { getMyInductionProgress } from '../../api/service.api-rh-induction';
import type { RhInductionProgressItem } from '../../types/models';

/**
 * Hero de máxima prioridad para el colaborador en inducción: al entrar al
 * módulo RH le muestra la fase en curso y lo manda directo a lo que sigue
 * (leer y firmar en Sala de Lectura, o presentar la evaluación). No renderiza
 * nada si el usuario no tiene inducción activa o ya aprobó todas sus fases.
 */
export const InductionHeroBanner = () => {
  const navigate = useNavigate();
  const [current, setCurrent] = useState<RhInductionProgressItem | null>(null);

  useEffect(() => {
    let active = true;
    getMyInductionProgress()
      .then((progress) => {
        if (!active) return;
        const pending = progress
          .filter((item) => item.evaluation_status !== 'passed')
          .sort((a, b) => a.phase_number - b.phase_number)[0];
        setCurrent(pending ?? null);
      })
      .catch(() => {
        // Sin colaborador vinculado o sin permiso: el hero simplemente no aparece.
      });
    return () => {
      active = false;
    };
  }, []);

  if (!current) {
    return null;
  }

  const readingPending = !current.reading_completed_at && !current.evaluation_assignment_id;
  const evaluationReady =
    current.evaluation_assignment_id !== null &&
    current.evaluation_status !== 'passed' &&
    current.evaluation_status !== 'failed';
  const deadline = current.reading_deadline_at ? new Date(current.reading_deadline_at) : null;
  const deadlineExpired = deadline !== null && deadline < new Date();

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#00416A] to-[#00588B] p-6 text-white shadow-xl shadow-[rgba(0,65,106,0.25)]">
      <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/10" />
      <div className="pointer-events-none absolute -bottom-16 right-24 h-40 w-40 rounded-full bg-white/5" />

      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#BFD4E6]">
        Tu programa de inducción
      </p>
      <h2 className="mt-1 text-2xl font-bold">
        Fase {current.phase_number}: {current.phase_name}
      </h2>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[#DCE9F3]">
        {readingPending ? (
          <>
            <span className="inline-flex items-center gap-1.5">
              <BookOpenCheck size={15} />
              Lectura: {current.reading_signed}/{current.reading_total} documentos firmados
            </span>
            {deadline ? (
              <span className={`inline-flex items-center gap-1.5 font-semibold ${deadlineExpired ? 'text-rose-200' : 'text-amber-200'}`}>
                <AlertTriangle size={14} />
                {deadlineExpired ? 'Plazo de lectura vencido' : 'Fecha límite de lectura: '}
                {deadlineExpired
                  ? ''
                  : deadline.toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' })}
              </span>
            ) : null}
          </>
        ) : evaluationReady ? (
          <span className="inline-flex items-center gap-1.5">
            <GraduationCap size={15} />
            Lectura lista: tu evaluación de la fase te está esperando.
          </span>
        ) : (
          <span>RH revisará tu avance y te indicará los siguientes pasos.</span>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {readingPending ? (
          <button
            type="button"
            onClick={() => navigate('/quality/my-readings')}
            className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-[#00416A] transition hover:bg-[#EAF2F8]"
          >
            Ir a la lectura de la fase
            <ArrowRight size={16} />
          </button>
        ) : evaluationReady ? (
          <button
            type="button"
            onClick={() => navigate(`/rh/my-evaluations/${current.evaluation_assignment_id}`)}
            className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-[#00416A] transition hover:bg-[#EAF2F8]"
          >
            Realizar la evaluación
            <ArrowRight size={16} />
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => navigate('/rh/my-induction')}
          className="text-sm font-semibold text-[#BFD4E6] underline-offset-2 hover:underline"
        >
          Ver todo mi progreso
        </button>
      </div>
    </div>
  );
};
