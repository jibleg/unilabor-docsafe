import { useCallback, useEffect, useState } from 'react';
import { Bell, Loader2, RefreshCw, Sparkles, X } from 'lucide-react';
import { getAgreementDashboard } from '../api/service.api-providers';
import { getApiErrorMessage } from '../api/service.parsers';
import { AgreementDocumentViewer } from '../components/providers/dashboard/AgreementDocumentViewer';
import { AgreementCharts } from '../components/providers/dashboard/AgreementCharts';
import { AgreementKpis } from '../components/providers/dashboard/AgreementKpis';
import { AgreementLegend } from '../components/providers/dashboard/AgreementLegend';
import { AgreementPartyCards } from '../components/providers/dashboard/AgreementPartyCards';
import { AgreementTable } from '../components/providers/dashboard/AgreementTable';
import { AgreementTimeline } from '../components/providers/dashboard/AgreementTimeline';
import type { AgreementBucket, AgreementDashboard, AgreementItem } from '../types/models';
import { BUCKET_META, formatDate } from '../utils/agreementDashboard';
import { notifyError } from '../utils/notify';

/**
 * Panorama ejecutivo de contratos y convenios (módulo Prestación de servicios):
 * KPIs, calendario de vencimientos por meses, gráficas, contrapartes y detalle.
 * Un filtro de estado (semáforo) atraviesa todos los componentes.
 */
export const ProvidersDashboardPage = () => {
  const [dashboard, setDashboard] = useState<AgreementDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeBucket, setActiveBucket] = useState<AgreementBucket | null>(null);
  const [viewingItem, setViewingItem] = useState<AgreementItem | null>(null);
  const closeViewer = useCallback(() => setViewingItem(null), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDashboard(await getAgreementDashboard());
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo cargar el panorama de contratos.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredItems = dashboard ? dashboard.items.filter((item) => !activeBucket || item.bucket === activeBucket) : [];
  const attention = dashboard ? dashboard.kpis.expired + dashboard.kpis.critical_30 + dashboard.kpis.warning_60 : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--color-brand-500)]">Prestación de servicios</p>
          <h1 className="mt-2 text-3xl font-bold text-[var(--color-brand-700)]">Panorama de contratos y convenios</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--unilabor-neutral)]">
            Vista ejecutiva de los acuerdos vigentes con proveedores y clientes: calendario de vencimientos por meses, estado de
            vigencia, contrapartes y detalle. Haz clic en un indicador o segmento para enfocar el tablero en ese estado.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {dashboard ? (
            <span className="hidden items-center gap-1.5 rounded-xl border border-[rgba(0,65,106,0.1)] bg-white/80 px-3 py-2 text-[11px] text-[var(--unilabor-neutral)] md:inline-flex">
              <Bell size={13} />
              Alertas a {dashboard.alert_recipients.providers + dashboard.alert_recipients.clients} destinatario(s) · actualizado {formatDate(dashboard.today)}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)]"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Actualizar
          </button>
        </div>
      </div>

      {loading && !dashboard ? (
        <div className="flex items-center justify-center rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/90 py-16 shadow-xl">
          <Loader2 size={22} className="animate-spin text-[var(--unilabor-neutral)]" />
        </div>
      ) : dashboard ? (
        <>
          {attention > 0 && !activeBucket ? (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-orange-200 bg-gradient-to-r from-orange-50 via-white to-amber-50 px-4 py-3 text-sm text-[var(--unilabor-ink)]" style={{ animation: 'agr-fade .4s ease both' }}>
              <Sparkles size={16} className="text-orange-600" />
              <span>
                <b>{attention}</b> acuerdo{attention === 1 ? '' : 's'} requiere{attention === 1 ? '' : 'n'} atención en los próximos 60 días
                {dashboard.kpis.expired ? ` (${dashboard.kpis.expired} ya vencido${dashboard.kpis.expired === 1 ? '' : 's'})` : ''}.
              </span>
              <button type="button" onClick={() => setActiveBucket(dashboard.kpis.expired ? 'expired' : 'critical')} className="ml-auto rounded-lg bg-orange-600 px-3 py-1 text-xs font-bold text-white hover:bg-orange-700">
                Ver cuáles
              </button>
            </div>
          ) : null}
          {activeBucket ? (
            <div className="flex items-center gap-2 text-sm" style={{ animation: 'agr-fade .3s ease both' }}>
              <span className="text-[var(--unilabor-neutral)]">Mostrando solo:</span>
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${BUCKET_META[activeBucket].soft} ${BUCKET_META[activeBucket].text}`}>
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: BUCKET_META[activeBucket].color }} />
                {BUCKET_META[activeBucket].label} · {filteredItems.length}
              </span>
              <button type="button" onClick={() => setActiveBucket(null)} className="inline-flex items-center gap-1 rounded-full border border-[rgba(0,65,106,0.14)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--color-brand-700)] hover:bg-[rgba(191,212,230,0.3)]">
                <X size={12} /> Quitar filtro
              </button>
            </div>
          ) : null}

          <AgreementKpis dashboard={dashboard} activeBucket={activeBucket} onFocusBucket={setActiveBucket} />
          <AgreementLegend counts={dashboard.by_bucket} activeBucket={activeBucket} onFocusBucket={setActiveBucket} />
          <AgreementTimeline items={dashboard.items} today={dashboard.today} activeBucket={activeBucket} />
          <AgreementCharts dashboard={dashboard} activeBucket={activeBucket} onFocusBucket={setActiveBucket} />
          <AgreementPartyCards parties={dashboard.by_party} activeBucket={activeBucket} />
          <AgreementTable
            items={dashboard.items}
            includes={dashboard.includes}
            activeBucket={activeBucket}
            onFocusBucket={setActiveBucket}
            onView={setViewingItem}
          />
          {viewingItem ? <AgreementDocumentViewer item={viewingItem} onClose={closeViewer} /> : null}
        </>
      ) : null}
    </div>
  );
};
