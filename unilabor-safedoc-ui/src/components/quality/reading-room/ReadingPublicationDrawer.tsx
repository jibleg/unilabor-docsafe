import { useMemo, useState } from 'react';
import { FileCheck2, Loader2, Lock, Search, UserPlus, X } from 'lucide-react';
import type { AssignReadersPayload } from '../../../api/service.api-quality-reading';
import {
  READER_STATUS_LABEL,
  READER_STATUS_STYLE,
  formatStamp,
  signedPercent,
} from '../../../pages/QualityReadingRoomPage.helpers';
import type { AcknowledgementStatus, AssignableArea, ReadingAssignment, ReadingPublication } from '../../../types/models';
import { DrawerShell } from '../../attendance/schedule/DrawerShell';
import { Pagination } from '../../Pagination';

interface ReadingPublicationDrawerProps {
  open: boolean;
  /** null mientras carga (o si no se pudo abrir). */
  detail: { publication: ReadingPublication; readers: ReadingAssignment[] } | null;
  areas: AssignableArea[];
  assigning: boolean;
  onClose: () => void;
  onAssign: (payload: AssignReadersPayload) => void;
  onCancelReader: (reader: ReadingAssignment) => void;
  onOpenSignedCopy: (reader: ReadingAssignment) => void;
  onClosePublication: (publication: ReadingPublication) => void;
}

const STATUS_FILTERS: Array<{ value: AcknowledgementStatus | 'all'; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'in_progress', label: 'En lectura' },
  { value: 'read', label: 'Falta firmar' },
  { value: 'signed', label: 'Firmados' },
  { value: 'expired', label: 'Vencidos' },
];

const PAGE_SIZE_OPTIONS = [30, 50, 70];

const normalize = (value: string): string => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const pagesPercent = (reader: ReadingAssignment): number =>
  reader.pages_total > 0 ? Math.min(100, Math.round((reader.pages_seen_count / reader.pages_total) * 100)) : 0;

const formatDuration = (seconds: number): string => {
  if (seconds <= 0) return '0 min';
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${Math.max(1, minutes)} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
};

const BAR_TONE: Record<AcknowledgementStatus, string> = {
  pending: 'bg-slate-300',
  in_progress: 'bg-amber-500',
  read: 'bg-sky-500',
  signed: 'bg-emerald-500',
  expired: 'bg-rose-500',
  cancelled: 'bg-slate-300',
};

const Stat = ({ label, value, tone }: { label: string; value: number; tone: string }) => (
  <div className={`rounded-xl px-3 py-2 text-center ${tone}`}>
    <span className="block text-lg font-bold leading-none">{value}</span>
    <span className="mt-1 block text-[10px] font-semibold uppercase tracking-wide">{label}</span>
  </div>
);

/**
 * Panel de una publicación de la Sala de Lectura: avance de lectura y firma de
 * cada colaborador asignado, asignación de lectores y acciones por lector.
 */
export const ReadingPublicationDrawer = ({
  open,
  detail,
  areas,
  assigning,
  onClose,
  onAssign,
  onCancelReader,
  onOpenSignedCopy,
  onClosePublication,
}: ReadingPublicationDrawerProps) => {
  const [assignMode, setAssignMode] = useState<'all' | 'area'>('all');
  const [assignArea, setAssignArea] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<AcknowledgementStatus | 'all'>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]!);

  const readers = useMemo(() => {
    const needle = normalize(search.trim());
    return (detail?.readers ?? []).filter(
      (reader) =>
        (status === 'all' || reader.status === status) &&
        (!needle || normalize(`${reader.user_name} ${reader.employee_area ?? ''} ${reader.user_email}`).includes(needle)),
    );
  }, [detail, search, status]);

  const totalPages = Math.max(1, Math.ceil(readers.length / pageSize));
  // Si el filtro o una recarga dejan menos páginas, se muestra la última que exista.
  const currentPage = Math.min(page, totalPages);
  const pageReaders = readers.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const publication = detail?.publication ?? null;
  const total = detail?.readers.length ?? 0;
  const count = (value: AcknowledgementStatus) => detail?.readers.filter((reader) => reader.status === value).length ?? 0;

  return (
    <DrawerShell
      open={open}
      onClose={onClose}
      widthClass="max-w-3xl"
      title={publication?.title_snapshot ?? 'Lectura'}
      subtitle={
        publication
          ? `${publication.pages_total} pág. · mín. ${publication.min_seconds_per_page} s/pág · publicada ${formatStamp(publication.published_at)}${
              publication.published_by_name ? ` por ${publication.published_by_name}` : ''
            }`
          : 'Cargando…'
      }
    >
      {!publication ? (
        <div className="flex justify-center py-16">
          <Loader2 size={22} className="animate-spin text-[var(--unilabor-neutral)]" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${publication.status === 'open' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
              {publication.status === 'open' ? 'Abierta' : `Cerrada ${formatStamp(publication.closed_at)}`}
            </span>
            <div className="min-w-[140px] flex-1">
              <div className="h-2 w-full overflow-hidden rounded-full bg-[rgba(0,65,106,0.08)]">
                <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${signedPercent(publication)}%` }} />
              </div>
            </div>
            <span className="text-xs font-bold text-[var(--color-brand-700)]">{signedPercent(publication)}% firmado</span>
            {publication.status === 'open' ? (
              <button
                type="button"
                onClick={() => onClosePublication(publication)}
                title="Cerrar la publicación: no admite lectores nuevos"
                className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(0,65,106,0.15)] px-3 py-1.5 text-xs font-semibold text-[var(--unilabor-neutral)] hover:bg-[rgba(0,65,106,0.05)]"
              >
                <Lock size={13} /> Cerrar
              </button>
            ) : null}
          </div>

          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            <Stat label="Asignados" value={total} tone="bg-slate-100 text-slate-700" />
            <Stat label="Pendientes" value={count('pending')} tone="bg-slate-100 text-slate-700" />
            <Stat label="En lectura" value={count('in_progress')} tone="bg-amber-100 text-amber-800" />
            <Stat label="Falta firmar" value={count('read')} tone="bg-sky-100 text-sky-800" />
            <Stat label="Firmados" value={count('signed')} tone="bg-emerald-100 text-emerald-800" />
            <Stat label="Vencidos" value={count('expired')} tone="bg-rose-100 text-rose-800" />
          </div>

          {publication.status === 'open' ? (
            <div className="flex flex-wrap items-end gap-2 rounded-xl bg-[rgba(0,65,106,0.04)] p-3">
              <label className="text-xs font-semibold text-[var(--unilabor-neutral)]">
                Asignar a
                <select
                  value={assignMode}
                  onChange={(event) => setAssignMode(event.target.value as 'all' | 'area')}
                  className="mt-1 block rounded-xl border border-[rgba(0,65,106,0.15)] bg-white px-3 py-1.5 text-sm text-[var(--color-brand-700)]"
                >
                  <option value="all">Todos los colaboradores</option>
                  <option value="area">Un área</option>
                </select>
              </label>
              {/* Siempre montado (solo se deshabilita) para que el bloque no salte al cambiar el modo. */}
              <label className={`text-xs font-semibold text-[var(--unilabor-neutral)] ${assignMode === 'area' ? '' : 'opacity-40'}`}>
                Área
                <select
                  value={assignArea}
                  disabled={assignMode !== 'area'}
                  onChange={(event) => setAssignArea(event.target.value)}
                  className="mt-1 block rounded-xl border border-[rgba(0,65,106,0.15)] bg-white px-3 py-1.5 text-sm text-[var(--color-brand-700)]"
                >
                  <option value="">Selecciona…</option>
                  {areas.map((area) => (
                    <option key={area.area} value={area.area}>
                      {area.area} ({area.total})
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={assigning || (assignMode === 'area' && !assignArea)}
                onClick={() => onAssign(assignMode === 'all' ? { mode: 'all' } : { mode: 'area', area: assignArea })}
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-brand-700)] px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
              >
                {assigning ? <Loader2 size={13} className="animate-spin" /> : <UserPlus size={13} />} Asignar
              </button>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <label className="relative min-w-[200px] flex-1">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--unilabor-neutral)]" />
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Buscar colaborador o área"
                aria-label="Buscar colaborador o área"
                className="w-full rounded-xl border border-[rgba(0,65,106,0.15)] bg-white py-1.5 pl-8 pr-3 text-sm text-[var(--unilabor-ink)] outline-none focus:border-[var(--color-brand-300)]"
              />
            </label>
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as AcknowledgementStatus | 'all');
                setPage(1);
              }}
              aria-label="Estado de la lectura"
              className="rounded-xl border border-[rgba(0,65,106,0.15)] bg-white px-3 py-1.5 text-sm text-[var(--color-brand-700)]"
            >
              {STATUS_FILTERS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <span className="text-xs text-[var(--unilabor-neutral)]">
              {readers.length} de {total}
            </span>
          </div>

          {total === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--unilabor-neutral)]">Aún no hay lectores asignados.</p>
          ) : readers.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--unilabor-neutral)]">Ningún lector coincide con el filtro.</p>
          ) : (
            <ul className="space-y-2">
              {pageReaders.map((reader) => (
                <li key={reader.id} className="rounded-xl border border-[rgba(0,65,106,0.1)] bg-white px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[var(--color-brand-700)]">{reader.user_name}</p>
                      <p className="truncate text-xs text-[var(--unilabor-neutral)]">{reader.employee_area ?? 'Sin área'}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${READER_STATUS_STYLE[reader.status]}`}>{READER_STATUS_LABEL[reader.status]}</span>
                    {reader.status === 'signed' ? (
                      <button
                        type="button"
                        onClick={() => onOpenSignedCopy(reader)}
                        title="Abrir la hoja de acuse firmada (no incluye el documento)"
                        aria-label={`Ver hoja de acuse de ${reader.user_name}`}
                        className="rounded-full border border-emerald-200 p-1.5 text-emerald-700 hover:bg-emerald-50"
                      >
                        <FileCheck2 size={14} />
                      </button>
                    ) : reader.status !== 'cancelled' ? (
                      <button
                        type="button"
                        onClick={() => onCancelReader(reader)}
                        title="Cancelar la lectura asignada"
                        aria-label={`Cancelar la lectura de ${reader.user_name}`}
                        className="rounded-full border border-rose-200 p-1.5 text-rose-700 hover:bg-rose-50"
                      >
                        <X size={14} />
                      </button>
                    ) : null}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-[rgba(0,65,106,0.08)]">
                      <div className={`h-full rounded-full transition-all ${BAR_TONE[reader.status]}`} style={{ width: `${pagesPercent(reader)}%` }} />
                    </div>
                    <span className="w-28 text-right text-xs font-semibold tabular-nums text-[var(--color-brand-700)]">
                      {reader.pages_seen_count}/{reader.pages_total} pág. · {pagesPercent(reader)}%
                    </span>
                  </div>
                  <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-[var(--unilabor-neutral)]">
                    <span>Asignada {formatStamp(reader.assigned_at)}</span>
                    <span>Vence {formatStamp(reader.deadline_at)}</span>
                    {reader.started_at ? <span>Inició {formatStamp(reader.started_at)}</span> : <span>Sin iniciar</span>}
                    {reader.active_seconds > 0 ? <span>Tiempo de lectura {formatDuration(reader.active_seconds)}</span> : null}
                    {reader.read_completed_at ? <span>Terminó de leer {formatStamp(reader.read_completed_at)}</span> : null}
                    {reader.signed_at ? <span className="font-semibold text-emerald-700">Firmó {formatStamp(reader.signed_at)}</span> : null}
                  </p>
                </li>
              ))}
            </ul>
          )}

          {readers.length > PAGE_SIZE_OPTIONS[0]! ? (
            <Pagination
              compact
              page={currentPage}
              totalPages={totalPages}
              total={readers.length}
              pageSize={pageSize}
              onPageChange={setPage}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          ) : null}
        </div>
      )}
    </DrawerShell>
  );
};
