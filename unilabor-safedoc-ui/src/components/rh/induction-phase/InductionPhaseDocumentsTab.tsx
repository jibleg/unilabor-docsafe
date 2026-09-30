import { useEffect, useMemo, useState } from 'react';
import { Archive, FileText, FolderCheck, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'react-toastify';
import { listDocumentSections, listDocumentTypes } from '../../../api/service.api-helpdesk';
import { archivePhaseDocumentSignedReadings, setPhaseDocumentExpedientType } from '../../../api/service.api-rh-induction';
import type { DocumentSearchResult } from '../../../api/service.api-rh-position';
import { getApiErrorMessage } from '../../../api/service.parsers';
import type { RhInductionPhase, RhInductionPhaseDocument } from '../../../types/models';
import { confirmAction } from '../../../utils/confirm';
import { SearchableSelect, type SearchableOption } from '../../SearchableSelect';
import { DocumentSearchPicker } from '../DocumentSearchPicker';
import { rowClass, sectionTitleClass } from './styles';

interface InductionPhaseDocumentsTabProps {
  phase: RhInductionPhase;
  saving: boolean;
  onAdd: (document: DocumentSearchResult) => void;
  onRemove: (phaseDocumentId: number) => void;
  /** La configuracion de archivado cambio: recargar las fases. */
  onChanged: () => void;
}

const NO_ARCHIVE = '';

/**
 * Pestaña "Documentos obligatorios": lectura de la fase (institucional) o aviso
 * de origen (por puesto). Cada documento puede archivar su copia firmada en el
 * expediente del colaborador bajo el tipo documental que RH elija (configurable,
 * sin mapeo fijo en codigo); la version previa del mismo tipo queda en historial.
 */
export const InductionPhaseDocumentsTab = ({ phase, saving, onAdd, onRemove, onChanged }: InductionPhaseDocumentsTabProps) => {
  const [typeOptions, setTypeOptions] = useState<SearchableOption[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const institutional = phase.scope !== 'POSITION';

  useEffect(() => {
    if (!institutional) return;
    let alive = true;
    Promise.all([listDocumentSections(), listDocumentTypes({ is_active: true })])
      .then(([sections, types]) => {
        if (!alive) return;
        const sectionName = new Map(sections.map((section) => [section.id, section.name]));
        setTypeOptions(
          types.map((type) => ({
            value: String(type.id),
            label: type.name,
            hint: [sectionName.get(type.section_id) ?? '', type.code ?? ''].filter(Boolean).join(' · '),
          })),
        );
      })
      .catch((error) => toast.error(getApiErrorMessage(error, 'No se pudo cargar el catalogo del expediente.')));
    return () => {
      alive = false;
    };
  }, [institutional]);

  const mappedCount = useMemo(() => phase.documents.filter((document) => document.expedient_document_type_id).length, [phase.documents]);

  const handleSetType = async (document: RhInductionPhaseDocument, value: string) => {
    const nextId = value === NO_ARCHIVE ? null : Number(value);
    if (nextId === document.expedient_document_type_id) return;
    setBusyId(document.id);
    try {
      const result = await setPhaseDocumentExpedientType(document.id, nextId);
      toast.success(result.message);
      onChanged();
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo guardar la configuracion.'));
    } finally {
      setBusyId(null);
    }
  };

  const handleArchiveExisting = async (document: RhInductionPhaseDocument) => {
    const ok = await confirmAction(
      'Archivar firmas existentes',
      `Se copiara al expediente de cada colaborador la copia firmada de "${document.title}" que ya exista en esta fase, como "${document.expedient_document_type_name}". Si el colaborador ya tenia una version vigente de ese tipo, queda en el historial (no se borra nada). Las que ya esten archivadas se omiten.`,
      'Archivar',
      'primary',
    );
    if (!ok) return;
    setBusyId(document.id);
    try {
      const result = await archivePhaseDocumentSignedReadings(document.id);
      toast.success(result.message);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudieron archivar las firmas existentes.'));
    } finally {
      setBusyId(null);
    }
  };

  if (!institutional) {
    return (
      <div className="rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.28)] px-3 py-2 text-xs text-[var(--color-brand-700)]">
        {phase.phase_number === 5
          ? 'Los documentos a leer se toman automáticamente del catálogo del puesto del colaborador (Puestos → Documentos obligatorios).'
          : 'Esta fase no lleva lectura: al inscribir al colaborador queda lista para que RH capture la calificación práctica.'}
      </div>
    );
  }

  return (
    <div>
      <h3 className={sectionTitleClass}>
        <FileText size={14} />
        Documentos obligatorios ({phase.documents.length})
      </h3>
      <p className="mb-2 text-xs text-[var(--unilabor-neutral)]">
        En "Archivar en expediente como" eliges el tipo documental donde se guardará la copia firmada de cada lectura.
        Se archiva al momento de firmar; si el colaborador ya tenía ese documento, la versión anterior queda en su historial.
        {mappedCount > 0 ? ` ${mappedCount} documento(s) se archivan.` : ' Ninguno se archiva todavía.'}
      </p>
      <div className="space-y-1.5">
        {phase.documents.map((document) => {
          const busy = busyId === document.id;
          return (
            <div key={document.id} className={`${rowClass} flex-wrap gap-2`}>
              <span className="inline-flex min-w-0 flex-1 items-center gap-2 text-[var(--unilabor-ink)]">
                <FileText size={14} className="shrink-0 text-[var(--color-brand-500)]" />
                <span className="truncate">
                  {document.code ? `${document.code} — ` : ''}
                  {document.title}
                </span>
                {document.expedient_document_type_id ? (
                  <span
                    className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200"
                    title={`Se archiva en ${document.expedient_section_name ?? 'el expediente'} como "${document.expedient_document_type_name}"`}
                  >
                    <FolderCheck size={11} /> Expediente
                  </span>
                ) : null}
              </span>
              <div className="flex w-full items-center gap-2 sm:w-auto">
                <div className="w-full min-w-[16rem] sm:w-72">
                  <SearchableSelect
                    value={document.expedient_document_type_id ? String(document.expedient_document_type_id) : NO_ARCHIVE}
                    options={typeOptions}
                    onChange={(value) => void handleSetType(document, value)}
                    placeholder="Archivar en expediente como…"
                    emptyLabel="No archivar en expediente"
                    searchPlaceholder="Buscar tipo documental…"
                    disabled={busy}
                  />
                </div>
                {document.expedient_document_type_id ? (
                  <button
                    type="button"
                    onClick={() => void handleArchiveExisting(document)}
                    disabled={busy}
                    title="Archivar en los expedientes las firmas que ya existen de este documento (histórico)"
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[rgba(0,65,106,0.14)] bg-white px-2 py-1.5 text-[11px] font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.3)] disabled:opacity-50"
                  >
                    {busy ? <Loader2 size={12} className="animate-spin" /> : <Archive size={12} />}
                    Archivar firmas existentes
                  </button>
                ) : null}
                <button type="button" onClick={() => onRemove(document.id)} className="shrink-0 text-rose-500 hover:text-rose-700" title="Quitar de la fase">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          );
        })}
        {phase.documents.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[rgba(0,65,106,0.14)] p-4 text-sm text-[var(--unilabor-neutral)]">
            Sin documentos obligatorios todavía.
          </p>
        ) : null}
      </div>
      <div className="mt-2">
        <DocumentSearchPicker
          excludeIds={phase.documents.map((document) => document.document_id)}
          onPick={onAdd}
          placeholder="Buscar documento vigente por código o título..."
        />
        {saving ? <p className="mt-1 text-xs text-[var(--unilabor-neutral)]">Agregando documento a la fase...</p> : null}
      </div>
    </div>
  );
};
