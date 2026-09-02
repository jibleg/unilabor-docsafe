import { useEffect, useRef, useState } from 'react';
import { FileText, Loader2, Search } from 'lucide-react';
import { toast } from 'react-toastify';
import { searchDocuments, type DocumentSearchResult } from '../../api/service.api-rh-position';
import { getApiErrorMessage } from '../../api/service.parsers';

interface DocumentSearchPickerProps {
  /** IDs de documentos que ya estan ligados y no deben ofrecerse de nuevo. */
  excludeIds?: string[];
  onPick: (document: DocumentSearchResult) => Promise<void> | void;
  placeholder?: string;
}

/**
 * Buscador de documentos vigentes del SGC con listado desplegable: al enfocar
 * muestra el inicio del catalogo y al escribir filtra por codigo o titulo
 * (busqueda en servidor, con debounce). Clic en un resultado lo entrega a
 * `onPick` y limpia la busqueda.
 */
export const DocumentSearchPicker = ({
  excludeIds = [],
  onPick,
  placeholder = 'Buscar documento por código o título...',
}: DocumentSearchPickerProps) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DocumentSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [picking, setPicking] = useState(false);
  const requestSeq = useRef(0);

  useEffect(() => {
    if (!open) return;
    const seq = ++requestSeq.current;
    setSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const found = await searchDocuments(query);
        if (requestSeq.current === seq) setResults(found);
      } catch (error) {
        if (requestSeq.current === seq) {
          setResults([]);
          toast.error(getApiErrorMessage(error, 'No se pudo buscar documentos.'));
        }
      } finally {
        if (requestSeq.current === seq) setSearching(false);
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query, open]);

  const visible = results.filter((document) => !excludeIds.includes(document.id));

  const handlePick = async (document: DocumentSearchResult) => {
    setPicking(true);
    try {
      await onPick(document);
      setQuery('');
      setOpen(false);
    } finally {
      setPicking(false);
    }
  };

  return (
    <div className="relative" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);
    }}>
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--unilabor-neutral)]" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpen(false);
          }}
          placeholder={placeholder}
          className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] py-2 pl-9 pr-9 text-sm text-[var(--unilabor-ink)] outline-none focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
        />
        {searching || picking ? (
          <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-[var(--unilabor-neutral)]" />
        ) : null}
      </div>

      {open ? (
        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-[rgba(0,65,106,0.14)] bg-white shadow-xl shadow-[rgba(0,65,106,0.12)]">
          {visible.length === 0 ? (
            <p className="px-3 py-3 text-xs text-[var(--unilabor-neutral)]">
              {searching ? 'Buscando...' : 'Sin documentos vigentes que coincidan.'}
            </p>
          ) : (
            visible.map((document) => (
              <button
                key={document.id}
                type="button"
                disabled={picking}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => void handlePick(document)}
                className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition hover:bg-[rgba(191,212,230,0.25)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <FileText size={14} className="mt-0.5 shrink-0 text-[var(--color-brand-500)]" />
                <span className="min-w-0">
                  {document.code ? (
                    <span className="mr-1.5 font-bold text-[var(--color-brand-700)]">{document.code}</span>
                  ) : null}
                  <span className="text-[var(--unilabor-ink)]">{document.title}</span>
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
};
