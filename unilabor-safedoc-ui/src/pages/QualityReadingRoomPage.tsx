import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Lock,
  RefreshCw,
  UserPlus,
  X,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { getApiErrorMessage } from '../api/service.parsers';
import { confirmAction } from '../utils/confirm';
import { listDocuments } from '../api/service.api-helpdesk';
import {
  assignReaders,
  cancelReadingAssignment,
  closeReadingPublication,
  getReadingPublication,
  listAssignableAreas,
  listReadingPublications,
  listRepublishCandidates,
  publishReading,
  republishForNewVersion,
  type AssignReadersPayload,
} from '../api/service.api-quality-reading';
import type {
  AssignableArea,
  Document,
  ReadingAssignment,
  ReadingPublication,
  ReadingPublicationStatus,
  RepublishCandidate,
} from '../types/models';
import {
  READER_STATUS_LABEL,
  READER_STATUS_STYLE,
  formatStamp,
  signedPercent,
} from './QualityReadingRoomPage.helpers';

const ProgressBar = ({ percent }: { percent: number }) => (
  <div className="h-2 w-full overflow-hidden rounded-full bg-[rgba(0,65,106,0.08)]">
    <div
      className="h-full rounded-full bg-emerald-500 transition-all"
      style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
    />
  </div>
);

const SummaryPill = ({ label, value, tone }: { label: string; value: number; tone: string }) => (
  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone}`}>
    {value} {label}
  </span>
);

const FILTERS: Array<{ value: ReadingPublicationStatus | 'all'; label: string }> = [
  { value: 'all', label: 'Todas' },
  { value: 'open', label: 'Abiertas' },
  { value: 'closed', label: 'Cerradas' },
];

export const QualityReadingRoomPage = () => {
  const [publications, setPublications] = useState<ReadingPublication[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ReadingPublicationStatus | 'all'>('all');

  const [publishOpen, setPublishOpen] = useState(false);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [documentId, setDocumentId] = useState('');
  const [deadlineHours, setDeadlineHours] = useState(72);
  const [publishing, setPublishing] = useState(false);

  const [detail, setDetail] = useState<{
    publication: ReadingPublication;
    readers: ReadingAssignment[];
  } | null>(null);
  const [areas, setAreas] = useState<AssignableArea[]>([]);
  const [assignMode, setAssignMode] = useState<'all' | 'area'>('all');
  const [assignArea, setAssignArea] = useState('');
  const [assigning, setAssigning] = useState(false);

  const [candidates, setCandidates] = useState<RepublishCandidate[]>([]);
  const [republishing, setRepublishing] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPublications(await listReadingPublications(filter === 'all' ? undefined : filter));
      setLoadError(null);
      // Documentos que ya tienen version nueva vigente sin publicar. Se
      // proponen; republicar es decision de Calidad, no automatico.
      setCandidates(await listRepublishCandidates());
    } catch (error) {
      const message = getApiErrorMessage(error, 'No se pudo cargar la sala de lectura.');
      setPublications([]);
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const openPublishModal = async () => {
    setPublishOpen(true);
    try {
      // Solo los vigentes: un documento derogado no se pone a leer.
      setDocuments((await listDocuments()).filter((doc) => doc.status === 'active'));
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudieron cargar los documentos del SGC.'));
    }
  };

  const handlePublish = async () => {
    if (!documentId) {
      toast.error('Elige el documento del SGC que se va a leer.');
      return;
    }
    setPublishing(true);
    try {
      const publication = await publishReading({
        document_id: documentId,
        deadline_hours: deadlineHours,
      });
      toast.success(`"${publication.title_snapshot}" publicado a lectura.`);
      setPublishOpen(false);
      setDocumentId('');
      await load();
      await openDetail(publication.id);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo publicar el documento.'));
    } finally {
      setPublishing(false);
    }
  };

  const openDetail = async (publicationId: number) => {
    try {
      setDetail(await getReadingPublication(publicationId));
      if (areas.length === 0) {
        setAreas(await listAssignableAreas());
      }
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo abrir la publicación.'));
    }
  };

  const handleAssign = async () => {
    if (!detail) {
      return;
    }
    if (assignMode === 'area' && !assignArea) {
      toast.error('Elige el área a la que se le asignará la lectura.');
      return;
    }

    const payload: AssignReadersPayload =
      assignMode === 'all' ? { mode: 'all' } : { mode: 'area', area: assignArea };

    setAssigning(true);
    try {
      const result = await assignReaders(detail.publication.id, payload);
      // Los omitidos no son un error: ya tenían la lectura asignada o firmada.
      toast.success(
        `${result.created.length} lector(es) asignado(s).` +
          (result.skipped_user_ids.length > 0
            ? ` ${result.skipped_user_ids.length} ya la tenían.`
            : ''),
      );
      await openDetail(detail.publication.id);
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudieron asignar los lectores.'));
    } finally {
      setAssigning(false);
    }
  };

  const handleCancelReader = async (reader: ReadingAssignment) => {
    if (!detail) {
      return;
    }
    const confirmed = await confirmAction(
      'Cancelar lectura',
      `¿Cancelar la lectura asignada a ${reader.user_name}?`,
      'Cancelar lectura',
    );
    if (!confirmed) {
      return;
    }

    try {
      await cancelReadingAssignment(detail.publication.id, reader.id);
      toast.success('Lectura cancelada.');
      await openDetail(detail.publication.id);
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo cancelar la lectura.'));
    }
  };

  const handleRepublish = async (candidate: RepublishCandidate) => {
    const confirmed = await confirmAction(
      'Publicar la versión nueva',
      `Se abrirá la lectura de "${candidate.new_title}" y se asignará a los ${candidate.signed_readers} lector(es) que firmaron la versión anterior. Las firmas de la versión anterior se conservan.`,
      'Publicar',
    );
    if (!confirmed) {
      return;
    }

    setRepublishing(candidate.publication_id);
    try {
      const result = await republishForNewVersion(candidate.publication_id);
      toast.success(
        `"${result.publication.title_snapshot}" publicado a ${result.created.length} lector(es).`,
      );
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo publicar la versión nueva.'));
    } finally {
      setRepublishing(null);
    }
  };

  const handleClose = async (publication: ReadingPublication) => {
    const confirmed = await confirmAction(
      'Cerrar publicación',
      `¿Cerrar la lectura de "${publication.title_snapshot}"? No se podrán asignar lectores nuevos. Las firmas ya recabadas se conservan.`,
      'Cerrar',
    );
    if (!confirmed) {
      return;
    }

    try {
      await closeReadingPublication(publication.id);
      toast.success('Publicación cerrada.');
      setDetail(null);
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo cerrar la publicación.'));
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-brand-700)]">Sala de lectura</h1>
          <p className="mt-1 text-sm text-[var(--unilabor-neutral)]">
            Publica documentos vigentes del SGC para su lectura y firma, y da seguimiento al avance.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="flex items-center gap-1.5 rounded-full border border-[rgba(0,65,106,0.15)] px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] hover:bg-[rgba(0,65,106,0.05)]"
          >
            <RefreshCw size={14} /> Actualizar
          </button>
          <button
            type="button"
            onClick={() => void openPublishModal()}
            className="flex items-center gap-1.5 rounded-full bg-[var(--color-brand-700)] px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90"
          >
            <BookOpen size={14} /> Publicar a lectura
          </button>
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setFilter(option.value)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              filter === option.value
                ? 'bg-[var(--color-brand-700)] text-white'
                : 'border border-[rgba(0,65,106,0.15)] text-[var(--color-brand-700)]'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {candidates.length > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/70 px-5 py-4">
          <div className="flex items-center gap-2">
            <RefreshCw size={16} className="text-amber-700" />
            <h2 className="text-sm font-bold text-amber-900">
              Documentos con versión nueva sin publicar
            </h2>
          </div>
          <p className="mt-1 text-xs text-amber-800">
            El documento fue reemplazado en el SGC y su lectura anterior se cerró sola. Quienes ya
            firmaron conservan su constancia; publica la nueva ronda si deben leer la versión vigente.
          </p>
          <ul className="mt-3 space-y-2">
            {candidates.map((candidate) => (
              <li
                key={candidate.publication_id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white/80 px-4 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--color-brand-700)]">
                    {candidate.new_title}
                  </p>
                  <p className="truncate text-xs text-[var(--unilabor-neutral)]">
                    Reemplaza a "{candidate.previous_title}" · {candidate.signed_readers} firmaron la
                    versión anterior
                  </p>
                </div>
                <button
                  type="button"
                  disabled={republishing === candidate.publication_id}
                  onClick={() => void handleRepublish(candidate)}
                  className="rounded-full bg-amber-600 px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
                >
                  {republishing === candidate.publication_id
                    ? 'Publicando…'
                    : 'Publicar nueva ronda'}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {loading && <p className="text-sm text-[var(--unilabor-neutral)]">Cargando…</p>}

      {!loading && loadError && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/80 px-5 py-6 text-center">
          <AlertTriangle className="mx-auto text-rose-500" size={28} />
          <p className="mt-2 text-sm font-medium text-rose-800">{loadError}</p>
        </div>
      )}

      {!loading && !loadError && publications.length === 0 && (
        <div className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/92 px-5 py-8 text-center">
          <BookOpen className="mx-auto text-[var(--color-brand-500)]" size={28} />
          <p className="mt-2 text-sm text-[var(--unilabor-neutral)]">
            Todavía no hay documentos publicados a lectura.
          </p>
        </div>
      )}

      <div className="grid gap-3">
        {publications.map((publication) => (
          <article
            key={publication.id}
            className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/92 px-5 py-4 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate font-semibold text-[var(--color-brand-700)]">
                    {publication.title_snapshot}
                  </h2>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      publication.status === 'open'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {publication.status === 'open' ? 'Abierta' : 'Cerrada'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[var(--unilabor-neutral)]">
                  {publication.pages_total} pág. · mín. {publication.min_seconds_per_page} s/pág ·
                  publicada {formatStamp(publication.published_at)}
                  {publication.published_by_name ? ` por ${publication.published_by_name}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void openDetail(publication.id)}
                  className="flex items-center gap-1.5 rounded-full border border-[rgba(0,65,106,0.15)] px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] hover:bg-[rgba(0,65,106,0.05)]"
                >
                  <UserPlus size={14} /> Lectores
                </button>
                {publication.status === 'open' && (
                  <button
                    type="button"
                    onClick={() => void handleClose(publication)}
                    className="flex items-center gap-1.5 rounded-full border border-[rgba(0,65,106,0.15)] px-3 py-1.5 text-xs font-semibold text-[var(--unilabor-neutral)] hover:bg-[rgba(0,65,106,0.05)]"
                  >
                    <Lock size={14} /> Cerrar
                  </button>
                )}
              </div>
            </div>

            <div className="mt-3 space-y-2">
              <ProgressBar percent={signedPercent(publication)} />
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-[var(--color-brand-700)]">
                  {signedPercent(publication)}% firmado
                </span>
                <SummaryPill
                  label="asignados"
                  value={publication.readers_total}
                  tone="bg-slate-100 text-slate-700"
                />
                <SummaryPill
                  label="firmados"
                  value={publication.readers_signed}
                  tone="bg-emerald-100 text-emerald-800"
                />
                <SummaryPill
                  label="en curso"
                  value={publication.readers_in_progress}
                  tone="bg-amber-100 text-amber-800"
                />
                {publication.readers_expired > 0 && (
                  <SummaryPill
                    label="vencidos"
                    value={publication.readers_expired}
                    tone="bg-rose-100 text-rose-800"
                  />
                )}
              </div>
            </div>
          </article>
        ))}
      </div>

      {publishOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-lg font-bold text-[var(--color-brand-700)]">
                Publicar documento a lectura
              </h2>
              <button type="button" onClick={() => setPublishOpen(false)} aria-label="Cerrar">
                <X size={18} className="text-[var(--unilabor-neutral)]" />
              </button>
            </div>

            <label className="mt-4 block text-xs font-semibold text-[var(--unilabor-neutral)]">
              Documento vigente del SGC
              <select
                value={documentId}
                onChange={(event) => setDocumentId(event.target.value)}
                className="mt-1 w-full rounded-xl border border-[rgba(0,65,106,0.15)] px-3 py-2 text-sm text-[var(--color-brand-700)]"
              >
                <option value="">Selecciona un documento…</option>
                {documents.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.title}
                  </option>
                ))}
              </select>
            </label>

            <label className="mt-3 block text-xs font-semibold text-[var(--unilabor-neutral)]">
              Plazo para leer y firmar (horas)
              <input
                type="number"
                min={1}
                max={8760}
                value={deadlineHours}
                onChange={(event) => setDeadlineHours(Number(event.target.value))}
                className="mt-1 w-full rounded-xl border border-[rgba(0,65,106,0.15)] px-3 py-2 text-sm text-[var(--color-brand-700)]"
              />
            </label>

            <p className="mt-3 text-xs text-[var(--unilabor-neutral)]">
              Al publicar se sella la huella del archivo y su número de páginas: la evidencia queda
              anclada a esta versión exacta del documento.
            </p>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPublishOpen(false)}
                className="rounded-full border border-[rgba(0,65,106,0.15)] px-4 py-1.5 text-xs font-semibold text-[var(--unilabor-neutral)]"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={publishing}
                onClick={() => void handlePublish()}
                className="rounded-full bg-[var(--color-brand-700)] px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
              >
                {publishing ? 'Publicando…' : 'Publicar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8">
          <div className="flex max-h-full w-full max-w-3xl flex-col rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-bold text-[var(--color-brand-700)]">
                  {detail.publication.title_snapshot}
                </h2>
                <p className="text-xs text-[var(--unilabor-neutral)]">
                  {detail.readers.length} lector(es) · {detail.publication.readers_signed} firmado(s)
                </p>
              </div>
              <button type="button" onClick={() => setDetail(null)} aria-label="Cerrar">
                <X size={18} className="text-[var(--unilabor-neutral)]" />
              </button>
            </div>

            {detail.publication.status === 'open' && (
              <div className="mt-4 flex flex-wrap items-end gap-2 rounded-xl bg-[rgba(0,65,106,0.04)] p-3">
                <label className="text-xs font-semibold text-[var(--unilabor-neutral)]">
                  Asignar a
                  <select
                    value={assignMode}
                    onChange={(event) => setAssignMode(event.target.value as 'all' | 'area')}
                    className="mt-1 block rounded-xl border border-[rgba(0,65,106,0.15)] px-3 py-1.5 text-sm text-[var(--color-brand-700)]"
                  >
                    <option value="all">Todos los colaboradores</option>
                    <option value="area">Un área</option>
                  </select>
                </label>

                {assignMode === 'area' && (
                  <label className="text-xs font-semibold text-[var(--unilabor-neutral)]">
                    Área
                    <select
                      value={assignArea}
                      onChange={(event) => setAssignArea(event.target.value)}
                      className="mt-1 block rounded-xl border border-[rgba(0,65,106,0.15)] px-3 py-1.5 text-sm text-[var(--color-brand-700)]"
                    >
                      <option value="">Selecciona…</option>
                      {areas.map((area) => (
                        <option key={area.area} value={area.area}>
                          {area.area} ({area.total})
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <button
                  type="button"
                  disabled={assigning}
                  onClick={() => void handleAssign()}
                  className="rounded-full bg-[var(--color-brand-700)] px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                >
                  {assigning ? 'Asignando…' : 'Asignar'}
                </button>
              </div>
            )}

            <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
              {detail.readers.length === 0 && (
                <p className="py-6 text-center text-sm text-[var(--unilabor-neutral)]">
                  Aún no hay lectores asignados.
                </p>
              )}

              <ul className="divide-y divide-[rgba(0,65,106,0.08)]">
                {detail.readers.map((reader) => (
                  <li key={reader.id} className="flex flex-wrap items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--color-brand-700)]">
                        {reader.user_name}
                      </p>
                      <p className="truncate text-xs text-[var(--unilabor-neutral)]">
                        {reader.employee_area ?? 'Sin área'} · vence {formatStamp(reader.deadline_at)}
                        {reader.status === 'signed' ? ` · firmó ${formatStamp(reader.signed_at)}` : ''}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        READER_STATUS_STYLE[reader.status]
                      }`}
                    >
                      {READER_STATUS_LABEL[reader.status]}
                    </span>
                    <span className="text-xs text-[var(--unilabor-neutral)]">
                      {reader.pages_seen_count}/{reader.pages_total} pág.
                    </span>
                    {reader.status !== 'signed' && reader.status !== 'cancelled' && (
                      <button
                        type="button"
                        onClick={() => void handleCancelReader(reader)}
                        className="rounded-full border border-rose-200 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                      >
                        Cancelar
                      </button>
                    )}
                    {reader.status === 'signed' && (
                      <CheckCircle2 size={16} className="text-emerald-500" />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
