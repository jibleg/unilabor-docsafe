import { useCallback, useEffect, useState } from 'react';
import { Edit3, EyeOff, Info, Plus, RefreshCw, Star, Trash2 } from 'lucide-react';
import { getApiErrorMessage } from '../api/service';
import {
  createClientCatalog,
  createClientContact,
  deactivateClientCatalog,
  deleteClientContact,
  listClientContacts,
  listClientsPaginated,
  updateClientCatalog,
  updateClientContact,
} from '../api/service.api-clients';
import { listClassifications } from '../api/service.api-classifications';
import type { ClientContact, ClientSummary, Classification } from '../types/models';
import { notifyError, notifySuccess, notifyWarning } from '../utils/notify';
import { confirmAction } from '../utils/confirm';
import { usePaginatedList } from '../hooks/usePaginatedList';
import { Pagination } from '../components/Pagination';
import { SearchableSelect } from '../components/SearchableSelect';

type ClientModalTab = 'general' | 'address' | 'contacts';

interface ClientFormState {
  name: string;
  description: string;
  rfc: string;
  website: string;
  notes: string;
  classification_id: number | '';
  address_street: string;
  address_neighborhood: string;
  address_city: string;
  address_state: string;
  address_zip: string;
  address_country: string;
}

interface ContactFormState {
  name: string;
  position: string;
  phone: string;
  email: string;
  is_primary: boolean;
}

const EMPTY_FORM: ClientFormState = {
  name: '',
  description: '',
  rfc: '',
  website: '',
  notes: '',
  classification_id: '',
  address_street: '',
  address_neighborhood: '',
  address_city: '',
  address_state: '',
  address_zip: '',
  address_country: '',
};

const EMPTY_CONTACT_FORM: ContactFormState = {
  name: '',
  position: '',
  phone: '',
  email: '',
  is_primary: false,
};

const TABS: { key: ClientModalTab; label: string }[] = [
  { key: 'general', label: 'Datos generales' },
  { key: 'address', label: 'Domicilio' },
  { key: 'contacts', label: 'Contactos' },
];

const inputClass =
  'w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]';
const labelClass = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]';

export const ClientsCatalogPage = () => {
  const [classificationFilter, setClassificationFilter] = useState('');

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
    (q) =>
      listClientsPaginated({
        page: q.page,
        limit: q.limit,
        search: q.search,
        includeInactive: true,
        classificationId: q.filters.classificationId ? Number(q.filters.classificationId) : undefined,
      }),
    {
      pageSize: 20,
      filters: { classificationId: classificationFilter },
      onError: (error) => notifyError(getApiErrorMessage(error, 'No se pudieron cargar los clientes.')),
    },
  );

  const [classifications, setClassifications] = useState<Classification[]>([]);

  useEffect(() => {
    listClassifications({ type: 'CLIENT', includeInactive: false })
      .then(setClassifications)
      .catch((error) => notifyError(getApiErrorMessage(error, 'No se pudieron cargar las clasificaciones.')));
  }, []);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ClientModalTab>('general');
  const [editingClient, setEditingClient] = useState<ClientSummary | null>(null);
  const [form, setForm] = useState<ClientFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [contacts, setContacts] = useState<ClientContact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [contactForm, setContactForm] = useState<ContactFormState>(EMPTY_CONTACT_FORM);
  const [editingContactId, setEditingContactId] = useState<number | null>(null);
  const [savingContact, setSavingContact] = useState(false);
  const [busyContactId, setBusyContactId] = useState<number | null>(null);

  const loadContacts = useCallback(async (clientId: number) => {
    setLoadingContacts(true);
    try {
      const data = await listClientContacts(clientId);
      setContacts(data);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudieron cargar los contactos.'));
    } finally {
      setLoadingContacts(false);
    }
  }, []);

  const openCreateModal = () => {
    setEditingClient(null);
    setForm(EMPTY_FORM);
    setContacts([]);
    setContactForm(EMPTY_CONTACT_FORM);
    setEditingContactId(null);
    setActiveTab('general');
    setIsModalOpen(true);
  };

  const openEditModal = (client: ClientSummary) => {
    setEditingClient(client);
    setForm({
      name: client.name,
      description: client.description ?? '',
      rfc: client.rfc ?? '',
      website: client.website ?? '',
      notes: client.notes ?? '',
      classification_id: client.classification_id ?? '',
      address_street: client.address_street ?? '',
      address_neighborhood: client.address_neighborhood ?? '',
      address_city: client.address_city ?? '',
      address_state: client.address_state ?? '',
      address_zip: client.address_zip ?? '',
      address_country: client.address_country ?? '',
    });
    setContactForm(EMPTY_CONTACT_FORM);
    setEditingContactId(null);
    setActiveTab('general');
    setIsModalOpen(true);
    void loadContacts(client.id);
  };

  const closeModal = () => {
    if (saving) {
      return;
    }
    setIsModalOpen(false);
    setEditingClient(null);
    setForm(EMPTY_FORM);
    setContacts([]);
    setContactForm(EMPTY_CONTACT_FORM);
    setEditingContactId(null);
  };

  const submitForm = async () => {
    const name = form.name.trim();
    if (!name) {
      notifyWarning('El nombre del cliente es obligatorio.');
      return;
    }

    const payload = {
      name,
      description: form.description.trim() || null,
      rfc: form.rfc.trim() || null,
      website: form.website.trim() || null,
      notes: form.notes.trim() || null,
      classification_id: form.classification_id === '' ? null : form.classification_id,
      address_street: form.address_street.trim() || null,
      address_neighborhood: form.address_neighborhood.trim() || null,
      address_city: form.address_city.trim() || null,
      address_state: form.address_state.trim() || null,
      address_zip: form.address_zip.trim() || null,
      address_country: form.address_country.trim() || null,
    };

    setSaving(true);
    try {
      if (editingClient) {
        await updateClientCatalog(editingClient.id, payload);
        notifySuccess('Cliente actualizado correctamente.');
        closeModal();
        loadClients();
      } else {
        const created = await createClientCatalog(payload);
        notifySuccess('Cliente creado correctamente. Ya puedes agregarle contactos.');
        loadClients();
        // Se queda en el modal, ahora en modo edicion, para poder agregar
        // contactos de inmediato (necesitan el id del cliente ya creado).
        setEditingClient(created);
        setActiveTab('contacts');
      }
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo guardar el cliente.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (client: ClientSummary) => {
    const confirmed = await confirmAction(
      `Desactivar: ${client.name}`,
      'Dejará de estar disponible para nuevos documentos. Los documentos y registros existentes no se ven afectados.',
      'Desactivar',
      'primary',
    );
    if (!confirmed) {
      return;
    }

    setBusyId(client.id);
    try {
      await deactivateClientCatalog(client.id);
      notifySuccess('Cliente desactivado correctamente.');
      loadClients();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo desactivar el cliente.'));
    } finally {
      setBusyId(null);
    }
  };

  const openAddContact = () => {
    setEditingContactId(null);
    setContactForm(EMPTY_CONTACT_FORM);
  };

  const openEditContact = (contact: ClientContact) => {
    setEditingContactId(contact.id);
    setContactForm({
      name: contact.name,
      position: contact.position ?? '',
      phone: contact.phone ?? '',
      email: contact.email ?? '',
      is_primary: contact.is_primary,
    });
  };

  const submitContactForm = async () => {
    if (!editingClient) {
      return;
    }
    const name = contactForm.name.trim();
    if (!name) {
      notifyWarning('El nombre del contacto es obligatorio.');
      return;
    }

    const payload = {
      name,
      position: contactForm.position.trim() || null,
      phone: contactForm.phone.trim() || null,
      email: contactForm.email.trim() || null,
      is_primary: contactForm.is_primary,
    };

    setSavingContact(true);
    try {
      if (editingContactId) {
        await updateClientContact(editingContactId, payload);
        notifySuccess('Contacto actualizado correctamente.');
      } else {
        await createClientContact(editingClient.id, payload);
        notifySuccess('Contacto agregado correctamente.');
      }
      openAddContact();
      await loadContacts(editingClient.id);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo guardar el contacto.'));
    } finally {
      setSavingContact(false);
    }
  };

  const handleDeleteContact = async (contact: ClientContact) => {
    if (!editingClient) {
      return;
    }
    const confirmed = await confirmAction(
      `Eliminar contacto: ${contact.name}`,
      'Se borrará de forma definitiva.',
      'Eliminar',
      'danger',
    );
    if (!confirmed) {
      return;
    }

    setBusyContactId(contact.id);
    try {
      await deleteClientContact(contact.id);
      notifySuccess('Contacto eliminado correctamente.');
      if (editingContactId === contact.id) {
        openAddContact();
      }
      await loadContacts(editingClient.id);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo eliminar el contacto.'));
    } finally {
      setBusyContactId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-brand-700)]">Catálogo de clientes</h1>
          <p className="text-sm text-[var(--unilabor-neutral)]">Alta y edición del catálogo de clientes.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-4 py-2.5 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)]"
          >
            <Plus size={16} />
            Nuevo cliente
          </button>
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
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/88 p-4 shadow-xl shadow-[rgba(0,65,106,0.08)] backdrop-blur-xl lg:flex-row lg:items-center">
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por nombre o RFC..."
          className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-4 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)] lg:max-w-md"
        />
        <div className="lg:w-64">
          <SearchableSelect
            value={classificationFilter}
            onChange={setClassificationFilter}
            options={classifications.map((classification) => ({
              value: String(classification.id),
              label: classification.name,
            }))}
            placeholder="Todas las clasificaciones"
            emptyLabel="Todas las clasificaciones"
            searchPlaceholder="Buscar clasificación..."
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/88 shadow-xl shadow-[rgba(0,65,106,0.08)] backdrop-blur-xl">
        <table className="w-full text-left">
          <thead className="border-b border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.96)]">
            <tr>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">Cliente</th>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">RFC</th>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">Ciudad</th>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">Estado</th>
              <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgba(0,65,106,0.08)]">
            {loading ? (
              <tr>
                <td colSpan={5} className="p-10 text-center text-[var(--unilabor-neutral)]">Cargando clientes...</td>
              </tr>
            ) : clients.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-10 text-center text-[var(--unilabor-neutral)]">No hay clientes para mostrar.</td>
              </tr>
            ) : (
              clients.map((client) => {
                const isBusy = busyId === client.id;
                return (
                  <tr key={client.id} className="transition-colors hover:bg-[rgba(191,212,230,0.22)]">
                    <td className="px-6 py-4">
                      <p className="text-sm font-semibold text-[var(--color-brand-700)]">{client.name}</p>
                      {client.description ? (
                        <p className="mt-0.5 text-xs text-[var(--unilabor-neutral)]">{client.description}</p>
                      ) : null}
                    </td>
                    <td className="px-6 py-4 text-sm text-[var(--unilabor-neutral)]">{client.rfc || '—'}</td>
                    <td className="px-6 py-4 text-sm text-[var(--unilabor-neutral)]">{client.address_city || '—'}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                          client.is_active
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border-[rgba(151,163,172,0.28)] bg-[rgba(151,163,172,0.12)] text-[var(--color-brand-700)]'
                        }`}
                      >
                        {client.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(client)}
                          disabled={isBusy}
                          className="inline-flex items-center gap-1 rounded-lg border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.36)] px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Edit3 size={14} />
                          Editar
                        </button>
                        {client.is_active ? (
                          <button
                            type="button"
                            onClick={() => void handleDeactivate(client)}
                            disabled={isBusy}
                            className="inline-flex items-center gap-1 rounded-lg border border-[rgba(0,65,106,0.12)] px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <EyeOff size={14} />
                            {isBusy ? 'Procesando...' : 'Desactivar'}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        <Pagination
          page={page}
          totalPages={pagination.totalPages}
          total={pagination.total}
          pageSize={pagination.limit}
          onPageChange={setPage}
          loading={loading}
        />
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(11,34,53,0.28)] p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/95 shadow-2xl shadow-[rgba(0,65,106,0.16)]">
            <div className="border-b border-[rgba(0,65,106,0.08)] px-4 py-3">
              <h2 className="text-base font-bold text-[var(--color-brand-700)]">
                {editingClient ? 'Editar cliente' : 'Nuevo cliente'}
              </h2>
            </div>

            <div className="flex gap-1 border-b border-[rgba(0,65,106,0.08)] px-4 pt-2">
              {TABS.map((tab) => {
                const disabled = tab.key === 'contacts' && !editingClient;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => !disabled && setActiveTab(tab.key)}
                    disabled={disabled}
                    title={disabled ? 'Guarda el cliente primero para agregar contactos' : undefined}
                    className={`rounded-t-lg px-3.5 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                      activeTab === tab.key
                        ? 'border-b-2 border-[var(--color-brand-500)] text-[var(--color-brand-700)]'
                        : 'text-[var(--unilabor-neutral)] hover:text-[var(--color-brand-700)]'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {!editingClient ? (
              <div className="mx-4 mt-3 inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">
                <Info size={13} />
                El tab Contactos está deshabilitado: guarda el cliente primero para habilitarlo.
              </div>
            ) : null}

            <div className="flex-1 overflow-y-auto px-4 py-4">
              {activeTab === 'general' ? (
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label className={labelClass}>Nombre</label>
                      <input
                        value={form.name}
                        onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                        className={inputClass}
                        placeholder="Ejemplo: Laboratorios Clínicos SA de CV"
                      />
                    </div>
                    <div>
                      <label className={labelClass}>RFC</label>
                      <input
                        value={form.rfc}
                        onChange={(event) => setForm((current) => ({ ...current, rfc: event.target.value }))}
                        className={inputClass}
                        placeholder="Ejemplo: LCL010101AB1"
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Sitio web</label>
                      <input
                        value={form.website}
                        onChange={(event) => setForm((current) => ({ ...current, website: event.target.value }))}
                        className={inputClass}
                        placeholder="https://..."
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelClass}>Clasificación</label>
                      <select
                        value={form.classification_id}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            classification_id: event.target.value ? Number(event.target.value) : '',
                          }))
                        }
                        className={inputClass}
                      >
                        <option value="">Sin clasificar</option>
                        {classifications.map((classification) => (
                          <option key={classification.id} value={classification.id}>
                            {classification.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>Descripción</label>
                    <textarea
                      value={form.description}
                      onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                      rows={2}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Notas</label>
                    <textarea
                      value={form.notes}
                      onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                      rows={2}
                      className={inputClass}
                      placeholder="Observaciones internas sobre este cliente"
                    />
                  </div>
                </div>
              ) : null}

              {activeTab === 'address' ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className={labelClass}>Calle y número</label>
                    <input
                      value={form.address_street}
                      onChange={(event) => setForm((current) => ({ ...current, address_street: event.target.value }))}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Colonia</label>
                    <input
                      value={form.address_neighborhood}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, address_neighborhood: event.target.value }))
                      }
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Código postal</label>
                    <input
                      value={form.address_zip}
                      onChange={(event) => setForm((current) => ({ ...current, address_zip: event.target.value }))}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Ciudad / Municipio</label>
                    <input
                      value={form.address_city}
                      onChange={(event) => setForm((current) => ({ ...current, address_city: event.target.value }))}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Estado</label>
                    <input
                      value={form.address_state}
                      onChange={(event) => setForm((current) => ({ ...current, address_state: event.target.value }))}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>País</label>
                    <input
                      value={form.address_country}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, address_country: event.target.value }))
                      }
                      className={inputClass}
                      placeholder="México"
                    />
                  </div>
                </div>
              ) : null}

              {activeTab === 'contacts' && editingClient ? (
                <div className="space-y-4">
                  <div className="overflow-hidden rounded-xl border border-[rgba(0,65,106,0.08)]">
                    {loadingContacts ? (
                      <div className="p-6 text-center text-sm text-[var(--unilabor-neutral)]">Cargando contactos...</div>
                    ) : contacts.length === 0 ? (
                      <div className="p-6 text-center text-sm text-[var(--unilabor-neutral)]">
                        Sin contactos registrados.
                      </div>
                    ) : (
                      <div className="divide-y divide-[rgba(0,65,106,0.08)]">
                        {contacts.map((contact) => (
                          <div key={contact.id} className="flex items-center justify-between gap-3 px-4 py-3">
                            <div>
                              <p className="flex items-center gap-1.5 text-sm font-semibold text-[var(--color-brand-700)]">
                                {contact.is_primary ? (
                                  <Star size={13} className="fill-amber-400 text-amber-400" />
                                ) : null}
                                {contact.name}
                                {contact.position ? (
                                  <span className="font-normal text-[var(--unilabor-neutral)]"> · {contact.position}</span>
                                ) : null}
                              </p>
                              <p className="text-xs text-[var(--unilabor-neutral)]">
                                {[contact.phone, contact.email].filter(Boolean).join(' · ') || 'Sin teléfono ni correo'}
                              </p>
                            </div>
                            <div className="flex shrink-0 gap-2">
                              <button
                                type="button"
                                onClick={() => openEditContact(contact)}
                                disabled={busyContactId === contact.id}
                                className="inline-flex items-center gap-1 rounded-lg border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.36)] px-2.5 py-1 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                <Edit3 size={12} />
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDeleteContact(contact)}
                                disabled={busyContactId === contact.id}
                                className="inline-flex items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-500/10 px-2.5 py-1 text-xs font-semibold text-rose-600 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.5)] p-4">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                      {editingContactId ? 'Editar contacto' : 'Agregar contacto'}
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input
                        value={contactForm.name}
                        onChange={(event) => setContactForm((current) => ({ ...current, name: event.target.value }))}
                        className={inputClass}
                        placeholder="Nombre"
                      />
                      <input
                        value={contactForm.position}
                        onChange={(event) =>
                          setContactForm((current) => ({ ...current, position: event.target.value }))
                        }
                        className={inputClass}
                        placeholder="Puesto"
                      />
                      <input
                        value={contactForm.phone}
                        onChange={(event) => setContactForm((current) => ({ ...current, phone: event.target.value }))}
                        className={inputClass}
                        placeholder="Teléfono"
                      />
                      <input
                        value={contactForm.email}
                        onChange={(event) => setContactForm((current) => ({ ...current, email: event.target.value }))}
                        className={inputClass}
                        placeholder="Correo"
                        type="email"
                      />
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <label className="flex items-center gap-2 text-sm text-[var(--unilabor-ink)]">
                        <input
                          type="checkbox"
                          checked={contactForm.is_primary}
                          onChange={(event) =>
                            setContactForm((current) => ({ ...current, is_primary: event.target.checked }))
                          }
                        />
                        Marcar como principal
                      </label>
                      <div className="flex gap-2">
                        {editingContactId ? (
                          <button
                            type="button"
                            onClick={openAddContact}
                            disabled={savingContact}
                            className="rounded-xl border border-[rgba(0,65,106,0.12)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)] disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Cancelar
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => void submitContactForm()}
                          disabled={savingContact}
                          className="rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {savingContact ? 'Guardando...' : editingContactId ? 'Guardar contacto' : 'Agregar contacto'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex justify-end gap-2 border-t border-[rgba(0,65,106,0.08)] px-4 py-3">
              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                className="rounded-xl border border-[rgba(0,65,106,0.12)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {editingClient ? 'Cerrar' : 'Cancelar'}
              </button>
              <button
                type="button"
                onClick={() => void submitForm()}
                disabled={saving}
                className="rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? 'Guardando...' : 'Guardar cliente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
