#!/usr/bin/env bash
# Reemite las constancias de la Fase 2 de Induccion (plantilla de firmas corregida) para TODOS los
# colaboradores aprobados, y las archiva como version nueva en el expediente. La constancia anterior
# NO se borra: queda como version superada (status 'superseded', is_current = FALSE).
#
# Uso en el VPS (root@unilabor-app.com):
#   bash SCRIPT_PROD_20260925_REEMITIR_CONSTANCIAS_FASE2.sh --dry-run   # solo lista
#   bash SCRIPT_PROD_20260925_REEMITIR_CONSTANCIAS_FASE2.sh             # ejecuta
# Requiere /tmp/safedoc.env (DB_*), el dist desplegado (dist/scripts/issue-certificate.js) y node 22.
set -euo pipefail
PHASE="${PHASE:-2}"
DRY_RUN=0; [[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1
cd /root/projects/unilabor-safedoc
set -a; source /tmp/safedoc.env; set +a
NODE=/root/.nvm/versions/node/v22.22.3/bin/node
export PGPASSWORD="$DB_PASSWORD"
psqlq() { psql -h "$DB_HOST" -p "${DB_PORT:-5432}" -U "$DB_USER" -d "$DB_NAME" -At -v ON_ERROR_STOP=1 -c "$1"; }
STAMP=$(date +%Y%m%d_%H%M%S)
LIST=/root/reemision_fase${PHASE}_${STAMP}_antes.txt
LOG=/root/reemision_fase${PHASE}_${STAMP}.log

echo "== Firmas vigentes de la plantilla de la Fase $PHASE:"
psqlq "select s.sort_order||' | '||s.signatory_name||' | '||s.role from rh_induction_phases p join certificate_templates ct on ct.training_course_id=p.training_course_id join certificate_template_signatures s on s.certificate_template_id=ct.id where p.phase_number=$PHASE order by s.sort_order"

psqlq "select a.id||'|'||a.certificate_document_id||'|'||emp.full_name from rh_induction_enrollments e join rh_induction_phases p on p.id=e.phase_id join evaluation_assignments a on a.id=e.evaluation_assignment_id join employees emp on emp.id=e.employee_id where p.phase_number=$PHASE and a.status='passed' and a.certificate_document_id is not null order by emp.full_name" > "$LIST"
TOTAL=$(wc -l < "$LIST" | tr -d ' ')
echo "== $TOTAL constancias a reemitir (respaldo de punteros: $LIST)"
cat "$LIST"
if [[ $DRY_RUN -eq 1 ]]; then echo "[dry-run] sin cambios"; exit 0; fi

OK=0; FAIL=0
while IFS='|' read -r AID DOCID NAME; do
  [[ -z "$AID" ]] && continue
  echo "--- $NAME (evaluacion $AID, constancia anterior $DOCID)" | tee -a "$LOG"
  psqlq "update evaluation_assignments set certificate_document_id=null, updated_at=now() where id=$AID and certificate_document_id=$DOCID" >/dev/null
  if "$NODE" dist/scripts/issue-certificate.js --assignment "$AID" >> "$LOG" 2>&1; then
    NEW=$(psqlq "select certificate_document_id from evaluation_assignments where id=$AID")
    if [[ -n "$NEW" && "$NEW" != "$DOCID" ]]; then OK=$((OK+1)); echo "    nueva constancia $NEW (anterior $DOCID superada)" | tee -a "$LOG"
    else FAIL=$((FAIL+1)); echo "    !! sin constancia nueva; restaurando puntero $DOCID" | tee -a "$LOG"; psqlq "update evaluation_assignments set certificate_document_id=$DOCID where id=$AID and certificate_document_id is null" >/dev/null; fi
  else
    FAIL=$((FAIL+1)); echo "    !! fallo la emision; restaurando puntero $DOCID" | tee -a "$LOG"
    psqlq "update evaluation_assignments set certificate_document_id=$DOCID where id=$AID and certificate_document_id is null" >/dev/null
  fi
done < "$LIST"

echo "== Resultado: $OK reemitidas, $FAIL fallidas. Log: $LOG"
echo "== Verificacion (aprobadas / con constancia / con version 2 vigente):"
psqlq "select count(*)||' / '||count(a.certificate_document_id)||' / '||count(*) filter (where d.version>=2 and d.is_current) from rh_induction_enrollments e join rh_induction_phases p on p.id=e.phase_id join evaluation_assignments a on a.id=e.evaluation_assignment_id left join employee_documents d on d.id=a.certificate_document_id where p.phase_number=$PHASE and a.status='passed'"
