-- =============================================================================
-- RH/Induccion - Copia firmada de los documentos de la fase al expediente.
-- Cada documento de una fase puede mapearse (configurable por RH, sin nada fijo
-- en codigo) a un tipo documental del expediente: al firmar la lectura, la copia
-- firmada se archiva como nueva version de ese tipo en el expediente del
-- colaborador (la version previa queda 'superseded', nunca se borra).
-- Semilla inicial (decision RH 2026-09-29): Fase 1 -> RIT, CDC y PCE.
-- =============================================================================

ALTER TABLE public.rh_induction_phase_documents
  ADD COLUMN IF NOT EXISTS expedient_document_type_id BIGINT NULL
    REFERENCES public.document_types(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.rh_induction_phase_documents.expedient_document_type_id IS
  'Tipo documental del expediente donde se archiva la copia firmada de la lectura (NULL = no se archiva).';

CREATE INDEX IF NOT EXISTS idx_rh_induction_phase_documents_expedient_type
  ON public.rh_induction_phase_documents (expedient_document_type_id)
  WHERE expedient_document_type_id IS NOT NULL;

-- Semilla: los 3 documentos de la Fase 1 acordados con RH (por codigo, solo si existen).
UPDATE public.rh_induction_phase_documents pd
   SET expedient_document_type_id = dt.id
  FROM public.rh_induction_phases ph,
       public.documents d,
       public.document_types dt
 WHERE ph.id = pd.phase_id
   AND ph.phase_number = 1
   AND d.id = pd.document_id
   AND pd.expedient_document_type_id IS NULL
   AND dt.is_active = TRUE
   AND (
        (d.code = 'REH-INS-001' AND dt.code = 'RIT')
     OR (d.code = 'REH-REG-009' AND dt.code = 'CDC')
     OR (d.code = 'REH-REG-010' AND dt.code = 'PCE')
   );
