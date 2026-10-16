import { useEffect, useMemo, useState } from 'react';
import { CheckCheck, Loader2, MinusCircle, Save } from 'lucide-react';
import { getPositionSupervisionConfig, listSupervisionFormItems, setPositionSupervisionConfig } from '../../../api/service.api-rh-supervision';
import { getApiErrorMessage } from '../../../api/service.parsers';
import type { SupervisionFormItem } from '../../../types/models';
import { notifyError, notifySuccess } from '../../../utils/notify';
import { buttonClass } from './supervision-ui';

interface PositionSupervisionItemsPanelProps {
  positionId: number;
  positionName: string;
}

/**
 * Pestaña "Supervisión (ANA-REG-060)" del puesto: qué aspectos del formato NO
 * aplican a este puesto. Al abrir una lista para el puesto quedan en N/A (el
 * supervisor puede cambiarlos). Lo define Calidad / RH.
 */
export const PositionSupervisionItemsPanel = ({ positionId, positionName }: PositionSupervisionItemsPanelProps) => {
  const [items, setItems] = useState<SupervisionFormItem[]>([]);
  const [na, setNa] = useState<Set<number>>(new Set());
  const [saved, setSaved] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([listSupervisionFormItems(), getPositionSupervisionConfig(positionId)])
      .then(([formItems, config]) => {
        if (cancelled) return;
        setItems(formItems);
        const set = new Set(config.na_item_ids);
        setNa(set);
        setSaved(new Set(set));
      })
      .catch((error) => notifyError(getApiErrorMessage(error, 'No se pudo cargar la configuración de supervisión del puesto.')))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [positionId]);

  const sections = useMemo(() => {
    const map = new Map<string, { title: string; items: SupervisionFormItem[] }>();
    for (const item of items) {
      const entry = map.get(item.section_code) ?? { title: item.section_title, items: [] };
      entry.items.push(item);
      map.set(item.section_code, entry);
    }
    return [...map.entries()];
  }, [items]);

  const dirty = na.size !== saved.size || [...na].some((id) => !saved.has(id));
  const applicable = items.length - na.size;

  const toggle = (id: number) =>
    setNa((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleSection = (sectionItems: SupervisionFormItem[], makeNa: boolean) =>
    setNa((current) => {
      const next = new Set(current);
      for (const item of sectionItems) {
        if (makeNa) next.add(item.id);
        else next.delete(item.id);
      }
      return next;
    });

  const handleSave = async () => {
    setSaving(true);
    try {
      const config = await setPositionSupervisionConfig(positionId, [...na]);
      const set = new Set(config.na_item_ids);
      setNa(set);
      setSaved(new Set(set));
      notifySuccess(`Configuración guardada: ${items.length - set.size} aspectos aplican a ${positionName}.`);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo guardar la configuración.'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <p className="inline-flex items-center gap-2 text-sm text-[var(--unilabor-neutral)]">
        <Loader2 size={14} className="animate-spin" /> Cargando formato…
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm leading-6 text-[var(--unilabor-ink)]">
          Deja marcados los aspectos del <strong>ANA-REG-060</strong> que <strong>sí aplican</strong> a este puesto y desmarca los que no (p. ej. control de
          calidad interno para un puesto administrativo). Los desmarcados salen en N/A al aplicar la lista y no cuentan para el porcentaje; el supervisor
          puede cambiarlos caso por caso.{' '}
          <span className="font-semibold text-[var(--color-brand-700)]">
            {applicable} de {items.length} aspectos aplican.
          </span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setNa(new Set())} disabled={na.size === 0} className={buttonClass} title="Marca los 31 aspectos como aplicables">
            <CheckCheck size={14} /> Todos aplican
          </button>
          <button
            type="button"
            onClick={() => setNa(new Set(items.map((item) => item.id)))}
            disabled={na.size === items.length}
            className={buttonClass}
            title="Desmarca los 31 aspectos (todos en N/A); después marca solo los que sí apliquen"
          >
            <MinusCircle size={14} /> Ninguno aplica
          </button>
          <button type="button" onClick={handleSave} disabled={saving || !dirty} className={buttonClass}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar
          </button>
        </div>
      </div>
      {sections.map(([code, section]) => {
        const allNa = section.items.every((item) => na.has(item.id));
        return (
          <section key={code} className="overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.1)]">
            <header className="flex items-center justify-between bg-[rgba(238,245,250,0.9)] px-4 py-2">
              <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-brand-700)]">{section.title}</p>
              <button type="button" onClick={() => toggleSection(section.items, !allNa)} className="text-[11px] font-semibold text-[var(--color-brand-500)] hover:underline">
                {allNa ? 'Marcar toda la sección' : 'Desmarcar toda la sección'}
              </button>
            </header>
            <ul className="divide-y divide-[rgba(0,65,106,0.08)]">
              {section.items.map((item) => (
                <li key={item.id}>
                  <label className={`flex cursor-pointer items-start gap-3 px-4 py-2 text-sm ${na.has(item.id) ? 'bg-slate-50 text-slate-500' : 'text-[var(--unilabor-ink)]'}`}>
                    <input type="checkbox" checked={!na.has(item.id)} onChange={() => toggle(item.id)} className="mt-1" aria-label={`Aplica: ${item.item_text}`} />
                    <span>
                      <span className="font-bold">{item.item_no}. </span>
                      {item.item_text}
                      {na.has(item.id) ? <span className="ml-2 rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold">N/A</span> : null}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
};
