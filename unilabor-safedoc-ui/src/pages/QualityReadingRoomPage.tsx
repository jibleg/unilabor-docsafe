import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BookOpen, FileClock, RefreshCw, Search, X } from 'lucide-react';
import { toast } from 'react-toastify';
import { getApiErrorMessage } from '../api/service.parsers';
import { confirmAction } from '../utils/confirm';
import {
  assignReaders,
  cancelReadingAssignment,
  closeReadingPublication,
  getReaderSignedCopyUrl,
  getReadingPublication,
  listAssignableAreas,
  listAssignableUsers,
  listReadingPublications,
  listRepublishCandidates,
  republishForNewVersion,
  type AssignReadersPayload,
} from '../api/service.api-quality-reading';
import { Pagination } from '../components/Pagination';
import { PublishReadingModal } from '../components/quality/reading-room/PublishReadingModal';
import { ReadingPublicationDrawer } from '../components/quality/reading-room/ReadingPublicationDrawer';
import { RepublishCandidatesPanel } from '../components/quality/reading-room/RepublishCandidatesPanel';
import { ExpedientTabs } from '../components/rh/ExpedientTabs';
import type {
  AssignableArea,
  AssignableUser,
  ReadingAssignment,
  ReadingPublication,
  ReadingPublicationStatus,
  RepublishCandidate,
} from '../types/models';
import { formatStamp, signedPercent } from './QualityReadingRoomPage.helpers';

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

const PAGE_SIZE_OPTIONS = [30, 50, 70];

type RoomTab = 'publications' | 'candidates';

const paginate = <T,>(items: T[], page: number, pageSize: number) => {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(page, totalPages);
  return { totalPages, current, slice: items.slice((current - 1) * pageSize, current * pageSize) };
};

// Sin mayusculas ni acentos, para que "tecnico" encuentre "Técnico".
const normalizeText = (value: string | null | undefined) =>
  (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

export const QualityReadingRoomPage = () => {
  const [publications, setPublications] = useState<ReadingPublication[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ReadingPublicationStatus | 'all'>('all');
  const [tab, setTab] = useState<RoomTab>('publications');
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]!);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [candidatesPage, setCandidatesPage] = useState(1);

  const [publishOpen, setPublishOpen] = useState(false);

  // El drawer se abre al instante (con spinner) y `detail` llega despues.
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [detail, setDetail] = useState<{ publication: ReadingPublication; readers: ReadingAssignment[] } | null>(null);
  const [areas, setAreas] = useState<AssignableArea[]>([]);
  const [users, setUsers] = useState<AssignableUser[]>([]);
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

  const refreshDetail = async (publicationId: number) => {
    try {
      setDetail(await getReadingPublication(publicationId));
      if (areas.length === 0 || users.length === 0) {
        const [nextAreas, nextUsers] = await Promise.all([listAssignableAreas(), listAssignableUsers()]);
        setAreas(nextAreas);
        setUsers(nextUsers);
      }
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo abrir la publicación.'));
      setDrawerOpen(false);
    }
  };

  const openDetail = (publicationId: number) => {
    setDetail(null);
    setDrawerOpen(true);
    void refreshDetail(publicationId);
  };

  const handleAssign = async (payload: AssignReadersPayload) => {
    if (!detail) {
      return;
    }
    setAssigning(true);
    try {
      const result = await assignReaders(detail.publication.id, payload);
      // Los omitidos no son un error: ya tenían la lectura asignada o firmada.
      toast.success(
        `${result.created.length} lector(es) asignado(s).` +
          (result.skipped_user_ids.length > 0 ? ` ${result.skipped_user_ids.length} ya la tenían.` : ''),
      );
      await refreshDetail(detail.publication.id);
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudieron asignar los lectores.'));
    } finally {
      setAssigning(false);
    }
  };

  // La evidencia firmada completa la custodia Calidad en disco; por HTTP solo
  // se sirve la hoja de acuse (el documento controlado nunca sale del visor).
  const handleOpenSignedCopy = async (reader: ReadingAssignment) => {
    try {
      const url = await getReaderSignedCopyUrl(reader.publication_id, reader.id);
      window.open(url, '_blank', 'noopener');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo abrir el acuse firmado.'));
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
      await refreshDetail(detail.publication.id);
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
      setDrawerOpen(false);
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo cerrar la publicación.'));
    }
  };

  // Busqueda en el cliente: todas las palabras escritas deben aparecer en el
  // titulo publicado o en el titulo del documento.
  const visiblePublications = useMemo(() => {
    const words = normalizeText(search).split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      return publications;
    }
    return publications.filter((publication) => {
      const haystack = `${normalizeText(publication.title_snapshot)} ${normalizeText(publication.document_title)}`;
      return words.every((word) => haystack.includes(word));
    });
  }, [publications, search]);
  const hasSearch = search.trim().length > 0;
  const changeSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const publicationPages = useMemo(() => paginate(visiblePublications, page, pageSize), [visiblePublications, page, pageSize]);
  const candidatePages = useMemo(() => paginate(candidates, candidatesPage, pageSize), [candidates, candidatesPage, pageSize]);
  const changePageSize = (size: number) => {
    setPageSize(size);
    setPage(1);
    setCandidatesPage(1);
  };

  const tabs = [
    { key: 'publications', label: 'Publicados a lectura', icon: <BookOpen size={15} />, badge: String(publications.length) },
    {
      key: 'candidates',
      label: 'Documentos con versión nueva sin publicar',
      icon: <FileClock size={15} />,
      badge: String(candidates.length),
      attention: candidates.length > 0 ? ('warning' as const) : null,
    },
  ];

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
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Actualizar
          </button>
          <button
            type="button"
            onClick={() => setPublishOpen(true)}
            className="flex items-center gap-1.5 rounded-full bg-[var(--color-brand-700)] px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90"
          >
            <BookOpen size={14} /> Publicar a lectura
          </button>
        </div>
      </header>

      <ExpedientTabs tabs={tabs} active={tab} onChange={(key) => setTab(key as RoomTab)} ariaLabel="Secciones de la sala de lectura" />

      {!loading && loadError && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/80 px-5 py-6 text-center">
          <AlertTriangle className="mx-auto text-rose-500" size={28} />
          <p className="mt-2 text-sm font-medium text-rose-800">{loadError}</p>
        </div>
      )}

      {tab === 'candidates' ? (
        <>
          <RepublishCandidatesPanel
            candidates={candidatePages.slice}
            total={candidates.length}
            republishingId={republishing}
            onRepublish={(candidate) => void handleRepublish(candidate)}
          />
          {candidates.length > PAGE_SIZE_OPTIONS[0]! ? (
            <Pagination
              page={candidatePages.current}
              totalPages={candidatePages.totalPages}
              total={candidates.length}
              pageSize={pageSize}
              onPageChange={setCandidatesPage}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
              onPageSizeChange={changePageSize}
            />
          ) : null}
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {FILTERS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  setFilter(option.value);
                  setPage(1);
                }}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  filter === option.value
                    ? 'bg-[var(--color-brand-700)] text-white'
                    : 'border border-[rgba(0,65,106,0.15)] text-[var(--color-brand-700)]'
                }`}
              >
                {option.label}
              </button>
            ))}
            <label className="relative min-w-[220px] max-w-md flex-1">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--unilabor-neutral)]" />
              <input
                value={search}
                onChange={(event) => changeSearch(event.target.value)}
                placeholder="Buscar documento"
                aria-label="Buscar documento"
                className="w-full rounded-xl border border-[rgba(0,65,106,0.14)] bg-white py-2 pl-9 pr-9 text-sm text-[var(--unilabor-ink)] outline-none focus:border-[var(--color-brand-300)]"
              />
              <button
                type="button"
                onClick={() => changeSearch('')}
                title="Limpiar búsqueda"
                aria-label="Limpiar búsqueda"
                className={`absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-[var(--unilabor-neutral)] hover:bg-[rgba(0,65,106,0.05)] hover:text-[var(--color-brand-700)] ${
                  search ? '' : 'invisible'
                }`}
              >
                <X size={14} />
              </button>
            </label>
            <span className={`ml-auto text-xs text-[var(--unilabor-neutral)] ${hasSearch ? '' : 'invisible'}`} aria-live="polite">
              {visiblePublications.length} de {publications.length}
            </span>
          </div>

          {loading && publications.length === 0 && <p className="text-sm text-[var(--unilabor-neutral)]">Cargando…</p>}

          {!loading && !loadError && publications.length === 0 && (
            <div className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/92 px-5 py-8 text-center">
              <BookOpen className="mx-auto text-[var(--color-brand-500)]" size={28} />
              <p className="mt-2 text-sm text-[var(--unilabor-neutral)]">Todavía no hay documentos publicados a lectura.</p>
            </div>
          )}

          {hasSearch && publications.length > 0 && visiblePublications.length === 0 && (
            <div className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/92 px-5 py-8 text-center">
              <Search className="mx-auto text-[var(--color-brand-500)]" size={28} />
              <p className="mt-2 text-sm text-[var(--unilabor-neutral)]">Ningún documento coincide con la búsqueda.</p>
            </div>
          )}

          <div className="grid gap-3">
            {publicationPages.slice.map((publication) => (
              <article key={publication.id}>
                <button
                  type="button"
                  onClick={() => openDetail(publication.id)}
                  title="Ver el avance de lectura de cada colaborador"
                  className="w-full rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/92 px-5 py-4 text-left shadow-sm transition hover:border-[var(--color-brand-300)] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[rgba(124,173,211,0.4)]"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate font-semibold text-[var(--color-brand-700)]">{publication.title_snapshot}</h2>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        publication.status === 'open' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {publication.status === 'open' ? 'Abierta' : 'Cerrada'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--unilabor-neutral)]">
                    {publication.pages_total} pág. · mín. {publication.min_seconds_per_page} s/pág · publicada{' '}
                    {formatStamp(publication.published_at)}
                    {publication.published_by_name ? ` por ${publication.published_by_name}` : ''}
                  </p>

                  <div className="mt-3 space-y-2">
                    <ProgressBar percent={signedPercent(publication)} />
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-[var(--color-brand-700)]">{signedPercent(publication)}% firmado</span>
                      <SummaryPill label="asignados" value={publication.readers_total} tone="bg-slate-100 text-slate-700" />
                      <SummaryPill label="firmados" value={publication.readers_signed} tone="bg-emerald-100 text-emerald-800" />
                      <SummaryPill label="en curso" value={publication.readers_in_progress} tone="bg-amber-100 text-amber-800" />
                      {publication.readers_expired > 0 && (
                        <SummaryPill label="vencidos" value={publication.readers_expired} tone="bg-rose-100 text-rose-800" />
                      )}
                    </div>
                  </div>
                </button>
              </article>
            ))}
          </div>

          {visiblePublications.length > PAGE_SIZE_OPTIONS[0]! ? (
            <Pagination
              page={publicationPages.current}
              totalPages={publicationPages.totalPages}
              total={visiblePublications.length}
              pageSize={pageSize}
              onPageChange={setPage}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
              onPageSizeChange={changePageSize}
            />
          ) : null}
        </>
      )}

      {publishOpen && (
        <PublishReadingModal
          onClose={() => setPublishOpen(false)}
          onPublished={(publication) => {
            setTab('publications');
            void load();
            openDetail(publication.id);
          }}
        />
      )}

      <ReadingPublicationDrawer
        open={drawerOpen}
        detail={detail}
        areas={areas}
        users={users}
        assigning={assigning}
        onClose={() => setDrawerOpen(false)}
        onAssign={(payload) => void handleAssign(payload)}
        onCancelReader={(reader) => void handleCancelReader(reader)}
        onOpenSignedCopy={(reader) => void handleOpenSignedCopy(reader)}
        onClosePublication={(publication) => void handleClose(publication)}
      />
    </div>
  );
};
