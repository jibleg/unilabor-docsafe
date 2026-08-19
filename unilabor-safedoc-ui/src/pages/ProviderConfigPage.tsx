import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { getApiErrorMessage, listLinkableUsers } from '../api/service';
import {
  addProviderNotificationRecipient,
  listProviderNotificationRecipients,
  removeProviderNotificationRecipient,
} from '../api/service.api-providers';
import type { LinkableUser, ProviderNotificationRecipient } from '../types/models';
import { notifyError, notifySuccess, notifyWarning } from '../utils/notify';
import { confirmAction } from '../utils/confirm';
import { SearchableSelect } from '../components/SearchableSelect';

export const ProviderConfigPage = () => {
  const [recipients, setRecipients] = useState<ProviderNotificationRecipient[]>([]);
  const [users, setUsers] = useState<LinkableUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [recipientsData, usersData] = await Promise.all([
        listProviderNotificationRecipients(),
        listLinkableUsers(),
      ]);
      setRecipients(recipientsData);
      setUsers(usersData);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo cargar la configuración de alertas.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const recipientUserIds = useMemo(() => new Set(recipients.map((recipient) => recipient.user_id)), [recipients]);

  const availableUserOptions = useMemo(
    () =>
      users
        .filter((user) => !recipientUserIds.has(user.id))
        .map((user) => ({ value: user.id, label: user.full_name || user.email, hint: user.email })),
    [users, recipientUserIds],
  );

  const handleAdd = async () => {
    if (!selectedUserId) {
      notifyWarning('Selecciona un usuario para agregar.');
      return;
    }

    setAdding(true);
    try {
      await addProviderNotificationRecipient(selectedUserId);
      notifySuccess('Destinatario agregado correctamente.');
      setSelectedUserId('');
      await loadData();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo agregar el destinatario.'));
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (recipient: ProviderNotificationRecipient) => {
    const confirmed = await confirmAction(
      'Quitar destinatario',
      `${recipient.full_name || recipient.email || 'Este usuario'} dejará de recibir alertas de vencimiento de documentos de proveedor.`,
      'Quitar',
      'primary',
    );
    if (!confirmed) {
      return;
    }

    setRemovingId(recipient.id);
    try {
      await removeProviderNotificationRecipient(recipient.id);
      notifySuccess('Destinatario eliminado correctamente.');
      await loadData();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo quitar el destinatario.'));
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-brand-700)]">Alertas de vencimiento</h1>
          <p className="text-sm text-[var(--unilabor-neutral)]">
            Usuarios que reciben aviso por correo cuando un documento de proveedor está por vencer.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadData()}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-[rgba(0,65,106,0.12)] bg-white/90 px-4 py-2.5 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Recargar
        </button>
      </div>

      <div className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/88 p-4 shadow-xl shadow-[rgba(0,65,106,0.08)] backdrop-blur-xl">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
              Agregar destinatario
            </label>
            <SearchableSelect
              value={selectedUserId}
              options={availableUserOptions}
              onChange={setSelectedUserId}
              placeholder="Selecciona un usuario..."
              searchPlaceholder="Buscar por nombre o correo..."
            />
          </div>
          <button
            type="button"
            onClick={() => void handleAdd()}
            disabled={adding || !selectedUserId}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-4 py-2.5 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Plus size={16} />
            {adding ? 'Agregando...' : 'Agregar'}
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/88 shadow-xl shadow-[rgba(0,65,106,0.08)] backdrop-blur-xl">
        {loading ? (
          <div className="p-10 text-center text-sm text-[var(--unilabor-neutral)]">Cargando destinatarios...</div>
        ) : recipients.length === 0 ? (
          <div className="p-10 text-center text-sm text-[var(--unilabor-neutral)]">
            No hay destinatarios configurados. Nadie recibirá alertas de vencimiento hasta que agregues al menos uno.
          </div>
        ) : (
          <div className="divide-y divide-[rgba(0,65,106,0.08)]">
            {recipients.map((recipient) => (
              <div key={recipient.id} className="flex items-center justify-between gap-4 px-6 py-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(191,212,230,0.26)] text-[var(--color-brand-700)]">
                    <Bell size={16} />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-[var(--color-brand-700)]">
                      {recipient.full_name || 'Sin nombre'}
                    </p>
                    <p className="text-xs text-[var(--unilabor-neutral)]">{recipient.email || 'Sin correo'}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleRemove(recipient)}
                  disabled={removingId === recipient.id}
                  className="inline-flex items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Trash2 size={14} />
                  {removingId === recipient.id ? 'Quitando...' : 'Quitar'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
