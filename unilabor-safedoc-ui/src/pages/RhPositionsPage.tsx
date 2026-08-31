import { useCallback, useEffect, useState } from 'react';
import { Briefcase, FileText, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'react-toastify';
import {
  addPositionCompetency,
  addPositionDocument,
  createPosition,
  deletePosition,
  deletePositionCompetency,
  listPositions,
  lookupDocumentByCode,
  removePositionDocument,
  type DocumentLookupResult,
} from '../api/service.api-rh-position';
import { getApiErrorMessage } from '../api/service.parsers';
import { confirmAction } from '../utils/confirm';
import type { RhPosition } from '../types/models';

const cardClass = 'rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/90 p-5 shadow-xl shadow-[rgba(0,65,106,0.08)]';
const inputClass =
  'w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2 text-sm text-[var(--unilabor-ink)] outline-none focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]';
const buttonClass =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:cursor-not-allowed disabled:opacity-50';

export const RhPositionsPage = () => {
  const [positions, setPositions] = useState<RhPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const [competencyText, setCompetencyText] = useState('');
  const [competencyCriticality, setCompetencyCriticality] = useState<'A' | 'M' | 'B'>('M');
  const [savingCompetency, setSavingCompetency] = useState(false);

  const [documentCode, setDocumentCode] = useState('');
  const [documentPreview, setDocumentPreview] = useState<DocumentLookupResult | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [savingDocument, setSavingDocument] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPositions(await listPositions(true));
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudieron cargar los puestos.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedPosition = positions.find((position) => position.id === selectedId) ?? null;

  const handleCreatePosition = async () => {
    if (!newCode.trim() || !newName.trim()) {
      toast.warning('Captura código y nombre del puesto.');
      return;
    }
    setCreating(true);
    try {
      const created = await createPosition({ code: newCode.trim(), name: newName.trim() });
      setNewCode('');
      setNewName('');
      toast.success('Puesto creado correctamente.');
      await load();
      setSelectedId(created.id);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo crear el puesto.'));
    } finally {
      setCreating(false);
    }
  };

  const handleDeletePosition = async (position: RhPosition) => {
    const confirmed = await confirmAction(
      'Eliminar puesto',
      `¿Eliminar el puesto "${position.name}"? Esta acción no se puede deshacer.`,
      'Eliminar',
      'danger',
    );
    if (!confirmed) return;
    try {
      await deletePosition(position.id);
      toast.success('Puesto eliminado correctamente.');
      if (selectedId === position.id) setSelectedId(null);
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo eliminar el puesto.'));
    }
  };

  const handleAddCompetency = async () => {
    if (!selectedPosition || !competencyText.trim()) {
      toast.warning('Captura el texto de la competencia.');
      return;
    }
    setSavingCompetency(true);
    try {
      await addPositionCompetency(selectedPosition.id, competencyText.trim(), 0, competencyCriticality);
      setCompetencyText('');
      setCompetencyCriticality('M');
      toast.success('Competencia agregada correctamente.');
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo agregar la competencia.'));
    } finally {
      setSavingCompetency(false);
    }
  };

  const handleDeleteCompetency = async (competencyId: number) => {
    try {
      await deletePositionCompetency(competencyId);
      toast.success('Competencia eliminada correctamente.');
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo eliminar la competencia.'));
    }
  };

  const handleLookupDocument = async () => {
    if (!documentCode.trim()) return;
    setLookingUp(true);
    setDocumentPreview(null);
    try {
      const found = await lookupDocumentByCode(documentCode.trim());
      if (!found) {
        toast.warning('No existe un documento vigente con ese código.');
      }
      setDocumentPreview(found);
    } finally {
      setLookingUp(false);
    }
  };

  const handleAddDocument = async () => {
    if (!selectedPosition || !documentPreview) return;
    setSavingDocument(true);
    try {
      await addPositionDocument(selectedPosition.id, documentPreview.id);
      setDocumentCode('');
      setDocumentPreview(null);
      toast.success('Documento agregado al puesto correctamente.');
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo agregar el documento.'));
    } finally {
      setSavingDocument(false);
    }
  };

  const handleRemoveDocument = async (positionDocumentId: number) => {
    try {
      await removePositionDocument(positionDocumentId);
      toast.success('Documento quitado del puesto correctamente.');
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo quitar el documento.'));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--color-brand-500)]">
          Inducción por puesto
        </p>
        <h1 className="mt-2 text-3xl font-bold text-[var(--color-brand-700)]">Catálogo de puestos</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--unilabor-neutral)]">
          Nombre, documentos obligatorios y competencias técnicas por puesto/categoría (REH-MAN-001).
          Base para las Fases 5-7 de inducción.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(280px,0.4fr)_minmax(0,1fr)]">
        <section className={cardClass}>
          <div className="mb-4 flex items-center gap-3">
            <Briefcase size={20} className="text-[var(--color-brand-700)]" />
            <h2 className="text-lg font-bold text-[var(--color-brand-700)]">Puestos</h2>
          </div>

          <div className="mb-4 space-y-2 rounded-xl border border-dashed border-[rgba(0,65,106,0.14)] p-3">
            <input value={newCode} onChange={(event) => setNewCode(event.target.value)} placeholder="Código" className={inputClass} />
            <input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Nombre del puesto" className={inputClass} />
            <button type="button" onClick={() => void handleCreatePosition()} disabled={creating} className={`${buttonClass} w-full`}>
              {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Nuevo puesto
            </button>
          </div>

          {loading ? (
            <p className="text-sm text-[var(--unilabor-neutral)]">Cargando...</p>
          ) : positions.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[rgba(0,65,106,0.14)] p-4 text-sm text-[var(--unilabor-neutral)]">
              Sin puestos registrados todavía.
            </p>
          ) : (
            <div className="space-y-2">
              {positions.map((position) => (
                <div
                  key={position.id}
                  className={`flex items-center justify-between rounded-xl border px-3 py-2 transition ${
                    selectedId === position.id
                      ? 'border-[rgba(0,65,106,0.16)] bg-[rgba(191,212,230,0.34)]'
                      : 'border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)] hover:bg-[rgba(191,212,230,0.2)]'
                  }`}
                >
                  <button type="button" onClick={() => setSelectedId(position.id)} className="flex-1 text-left">
                    <p className="text-sm font-bold text-[var(--color-brand-700)]">{position.name}</p>
                    <p className="text-xs text-[var(--unilabor-neutral)]">{position.code}</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeletePosition(position)}
                    className="rounded-lg p-1.5 text-rose-500 transition hover:bg-rose-500/10"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className={cardClass}>
          {!selectedPosition ? (
            <p className="rounded-xl border border-dashed border-[rgba(0,65,106,0.14)] p-6 text-center text-sm text-[var(--unilabor-neutral)]">
              Selecciona un puesto para ver sus competencias y documentos obligatorios.
            </p>
          ) : (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-bold text-[var(--color-brand-700)]">{selectedPosition.name}</h2>
                <p className="text-xs text-[var(--unilabor-neutral)]">{selectedPosition.code}</p>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-bold text-[var(--color-brand-700)]">
                  Competencias técnicas ({selectedPosition.competencies.length})
                </h3>
                <div className="space-y-1.5">
                  {selectedPosition.competencies.map((competency) => (
                    <div
                      key={competency.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)] px-3 py-1.5 text-sm"
                    >
                      <span className="text-[var(--unilabor-ink)]">{competency.competency_text}</span>
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            competency.criticality === 'A'
                              ? 'bg-rose-50 text-rose-700'
                              : competency.criticality === 'B'
                                ? 'bg-[rgba(151,163,172,0.14)] text-[var(--unilabor-neutral)]'
                                : 'bg-amber-50 text-amber-700'
                          }`}
                          title="Criticidad (pondera la Evaluación de competencia REH-REG-003)"
                        >
                          {competency.criticality === 'A' ? 'Alta' : competency.criticality === 'B' ? 'Baja' : 'Media'}
                        </span>
                        <button type="button" onClick={() => void handleDeleteCompetency(competency.id)} className="text-rose-500 hover:text-rose-700">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <input
                    value={competencyText}
                    onChange={(event) => setCompetencyText(event.target.value)}
                    placeholder="Ej. Manejo de espectrofotómetro"
                    className={inputClass}
                  />
                  <select
                    value={competencyCriticality}
                    onChange={(event) => setCompetencyCriticality(event.target.value as 'A' | 'M' | 'B')}
                    className={`${inputClass} w-40 shrink-0`}
                    title="Criticidad de la competencia"
                  >
                    <option value="A">A — Alta (5)</option>
                    <option value="M">M — Media (3)</option>
                    <option value="B">B — Baja (1)</option>
                  </select>
                  <button type="button" onClick={() => void handleAddCompetency()} disabled={savingCompetency} className={buttonClass}>
                    {savingCompetency ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  </button>
                </div>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-bold text-[var(--color-brand-700)]">
                  Documentos obligatorios ({selectedPosition.documents.length})
                </h3>
                <div className="space-y-1.5">
                  {selectedPosition.documents.map((document) => (
                    <div
                      key={document.id}
                      className="flex items-center justify-between rounded-lg border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)] px-3 py-1.5 text-sm"
                    >
                      <span className="inline-flex items-center gap-2 text-[var(--unilabor-ink)]">
                        <FileText size={14} className="text-[var(--color-brand-500)]" />
                        {document.code ? `${document.code} — ` : ''}
                        {document.title}
                      </span>
                      <button type="button" onClick={() => void handleRemoveDocument(document.id)} className="text-rose-500 hover:text-rose-700">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <input
                    value={documentCode}
                    onChange={(event) => {
                      setDocumentCode(event.target.value);
                      setDocumentPreview(null);
                    }}
                    placeholder="Código del documento (ej. REH-INS-001)"
                    className={inputClass}
                  />
                  <button type="button" onClick={() => void handleLookupDocument()} disabled={lookingUp} className={buttonClass}>
                    {lookingUp ? <Loader2 size={14} className="animate-spin" /> : 'Buscar'}
                  </button>
                </div>
                {documentPreview ? (
                  <div className="mt-2 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    <span>
                      Encontrado: <strong>{documentPreview.title}</strong>
                    </span>
                    <button type="button" onClick={() => void handleAddDocument()} disabled={savingDocument} className="font-semibold underline">
                      {savingDocument ? 'Agregando...' : 'Agregar al puesto'}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
