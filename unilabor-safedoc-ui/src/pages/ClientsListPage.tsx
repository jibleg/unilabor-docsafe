import { Link } from 'react-router-dom';
import { Building2, ChevronRight, RefreshCw, Search } from 'lucide-react';
import { getApiErrorMessage } from '../api/service';
import { listClientsPaginated } from '../api/service.api-clients';
import type { ClientSummary } from '../types/models';
import { notifyError } from '../utils/notify';
import { usePaginatedList } from '../hooks/usePaginatedList';
import { Pagination } from '../components/Pagination';

export const ClientsListPage = () => {
  const {
    items: clients,
    pagination,
    page,
    setPage,
    search: query,
    setSearch: setQuery,
    loading,
    reload: loadClients,
  } = usePaginatedList<ClientSummary>(
    (q) => listClientsPaginated({ page: q.page, limit: q.limit, search: q.search }),
    {
      pageSize: 20,
      onError: (error) => notifyError(getApiErrorMessage(error, 'No se pudieron cargar los clientes.')),
    },
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-brand-700)]">Acuerdos con los Clientes</h1>
          <p className="text-sm text-[var(--unilabor-neutral)]">
            Gestión documental de contratos, convenios y pólizas por cliente.
          </p>
        </div>
        <button
          type="button"
          onClick={() => loadClients()}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-[rgba(0,65,106,0.12)] bg-white/90 px-4 py-2.5 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Recargar
        </button>
      </div>

      <div className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/88 p-4 shadow-xl shadow-[rgba(0,65,106,0.08)] backdrop-blur-xl">
        <div className="relative lg:max-w-md">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--unilabor-neutral)]" />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nombre o RFC..."
            className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] py-2.5 pl-9 pr-4 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/88 shadow-xl shadow-[rgba(0,65,106,0.08)] backdrop-blur-xl">
        {loading ? (
          <div className="p-10 text-center text-sm text-[var(--unilabor-neutral)]">Cargando clientes...</div>
        ) : clients.length === 0 ? (
          <div className="p-10 text-center text-sm text-[var(--unilabor-neutral)]">
            No hay clientes para mostrar. El catálogo se administra desde Configuración &gt; Clientes.
          </div>
        ) : (
          <div className="divide-y divide-[rgba(0,65,106,0.08)]">
            {clients.map((client) => (
              <Link
                key={client.id}
                to={`/providers/clients/${client.id}`}
                className="flex items-center justify-between gap-4 px-6 py-4 transition hover:bg-[rgba(191,212,230,0.22)]"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(191,212,230,0.26)] text-[var(--color-brand-700)]">
                    <Building2 size={18} />
                  </span>
                  <div>
                    <p className="text-sm font-bold text-[var(--color-brand-700)]">{client.name}</p>
                    <p className="text-xs text-[var(--unilabor-neutral)]">
                      {client.rfc ? `RFC: ${client.rfc}` : 'Sin RFC registrado'}
                      {client.contact ? ` · ${client.contact}` : ''}
                    </p>
                  </div>
                </div>
                <ChevronRight size={16} className="shrink-0 text-[var(--unilabor-neutral)]" />
              </Link>
            ))}
          </div>
        )}
        <Pagination
          page={page}
          totalPages={pagination.totalPages}
          total={pagination.total}
          pageSize={pagination.limit}
          onPageChange={setPage}
          loading={loading}
        />
      </div>
    </div>
  );
};
