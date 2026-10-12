import { useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Copy, Download, FileSpreadsheet, Loader2, Upload, XCircle } from 'lucide-react';
import {
  importIncidents,
  simulateIncidentImport,
  type ImportResult,
  type ImportRow,
  type ImportSimulation,
} from '../../../api/service.api-attendance-incidents';
import { downloadAttendanceFile } from '../../../api/service.api-attendance-common';
import { getApiErrorMessage } from '../../../api/service.parsers';
import { notifyError, notifySuccess } from '../../../utils/notify';
import { formatDate } from '../shared/format';
import { modalBackdropClass, modalPanelClass, primaryButtonClass, secondaryButtonClass } from '../employees/ui';

interface Props {
  onClose: () => void;
  onImported: () => void;
}

const MAX_BYTES = 2 * 1024 * 1024;
const STEPS = ['Plantilla', 'Simular', 'Resultado'];

const RowStatus = ({ row, done }: { row: ImportRow; done: boolean }) => {
  if (done) {
    return row.imported ? (
      <span className="badge badge-success badge-sm gap-1"><CheckCircle2 size={12} />{row.authorized ? 'Autorizada' : 'Importada'}</span>
    ) : (
      <span className="badge badge-ghost badge-sm gap-1"><XCircle size={12} />No importada</span>
    );
  }
  if (row.status === 'ok') return <span className="badge badge-success badge-sm gap-1"><CheckCircle2 size={12} />Lista</span>;
  if (row.status === 'duplicate') return <span className="badge badge-warning badge-sm gap-1"><Copy size={12} />Duplicada</span>;
  return <span className="badge badge-error badge-sm gap-1"><XCircle size={12} />Error</span>;
};

const RowsTable = ({ rows, done }: { rows: ImportRow[]; done: boolean }) => (
  <div className="max-h-72 overflow-auto rounded-xl border border-[rgba(0,65,106,0.1)]">
    <table className="w-full text-left text-xs">
      <thead className="sticky top-0 bg-[rgba(239,245,250,0.96)]">
        <tr>
          <th className="px-3 py-2">Fila</th>
          <th className="px-3 py-2">Colaborador / tipo</th>
          <th className="px-3 py-2">Periodo</th>
          <th className="px-3 py-2">Estado</th>
          <th className="px-3 py-2">Detalle</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-[rgba(0,65,106,0.08)]">
        {rows.map((row) => (
          <tr key={row.row}>
            <td className="px-3 py-2 font-semibold">{row.row}</td>
            <td className="px-3 py-2">{row.employee ?? '—'}<br /><span className="text-[var(--unilabor-neutral)]">{row.type ?? ''}</span></td>
            <td className="px-3 py-2 whitespace-nowrap">{row.start_date ? formatDate(row.start_date) : '—'}{row.end_date && row.end_date !== row.start_date ? ` – ${formatDate(row.end_date)}` : ''}</td>
            <td className="px-3 py-2"><RowStatus row={row} done={done} /></td>
            <td className="px-3 py-2">
              {[...row.errors, ...row.warnings].length === 0 ? '—' : (
                <ul className="space-y-0.5">
                  {row.errors.map((message) => <li key={message} className="text-red-700">{message}</li>)}
                  {row.warnings.map((message) => <li key={message} className="text-amber-800">{message}</li>)}
                </ul>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export const IncidentImportModal = ({ onClose, onImported }: Props) => {
  const [step, setStep] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [simulation, setSimulation] = useState<ImportSimulation | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleTemplate = async () => {
    try {
      await downloadAttendanceFile('/attendance/incidents/template', {}, 'plantilla-incidencias.xlsx');
    } catch (err) {
      notifyError(getApiErrorMessage(err, 'No se pudo descargar la plantilla.'));
    }
  };

  const handleFile = (selected: File | undefined) => {
    setError('');
    setSimulation(null);
    if (!selected) return;
    if (!/\.xlsx$/i.test(selected.name)) return setError('El archivo debe ser .xlsx.');
    if (selected.size > MAX_BYTES) return setError('El archivo supera 2 MB.');
    setFile(selected);
  };

  const handleSimulate = async () => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      setSimulation(await simulateIncidentImport(file));
    } catch (err) {
      setError(getApiErrorMessage(err, 'No se pudo simular el archivo.'));
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async () => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const data = await importIncidents(file);
      setResult(data);
      setStep(2);
      notifySuccess(`${data.summary.imported} incidencia(s) importada(s).`);
      onImported();
    } catch (err) {
      setError(getApiErrorMessage(err, 'No se pudo importar el archivo.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={modalBackdropClass} role="dialog" aria-modal="true" aria-label="Importar incidencias desde Excel">
      <div className={`${modalPanelClass} max-w-4xl`}>
        <div className="border-b border-[rgba(0,65,106,0.08)] px-5 py-4">
          <h2 className="text-base font-bold text-[var(--color-brand-700)]">Importar desde Excel</h2>
          <ol className="mt-2 flex gap-2 text-xs">
            {STEPS.map((label, index) => (
              <li key={label} className={`rounded-full px-3 py-1 font-semibold ${index === step ? 'bg-[var(--color-brand-700)] text-white' : 'bg-[rgba(191,212,230,0.35)] text-[var(--color-brand-700)]'}`}>
                {index + 1}. {label}
              </li>
            ))}
          </ol>
        </div>
        <div className="space-y-4 overflow-y-auto px-5 py-5">
          {step === 0 ? (
            <>
              <p className="text-sm text-[var(--unilabor-ink)]">
                Descarga la plantilla, llénala (un renglón por incidencia, hasta 500) y súbela. Antes de guardar verás una simulación fila por fila.
              </p>
              <button type="button" className={secondaryButtonClass} onClick={() => void handleTemplate()}>
                <Download size={15} aria-hidden="true" /> Descargar plantilla
              </button>
            </>
          ) : null}
          {step === 1 ? (
            <>
              <input ref={inputRef} type="file" hidden accept=".xlsx" onChange={(event) => handleFile(event.target.files?.[0])} />
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" className={secondaryButtonClass} onClick={() => inputRef.current?.click()}>
                  <Upload size={15} aria-hidden="true" /> {file ? 'Cambiar archivo' : 'Subir .xlsx'}
                </button>
                {file ? <span className="flex items-center gap-1 text-sm"><FileSpreadsheet size={15} aria-hidden="true" />{file.name}</span> : null}
                {file ? (
                  <button type="button" className={primaryButtonClass} onClick={() => void handleSimulate()} disabled={busy}>
                    {busy ? <Loader2 size={15} className="animate-spin" /> : null} Simular
                  </button>
                ) : null}
              </div>
              {simulation ? (
                <>
                  <div className="flex flex-wrap gap-2 text-xs font-semibold">
                    <span className="badge badge-ghost">Total {simulation.summary.total}</span>
                    <span className="badge badge-success">Listas {simulation.summary.ok}</span>
                    <span className="badge badge-warning">Duplicadas {simulation.summary.duplicate}</span>
                    <span className="badge badge-error">Con error {simulation.summary.error}</span>
                  </div>
                  <RowsTable rows={simulation.rows} done={false} />
                  <p className="text-xs text-[var(--unilabor-neutral)]">Solo se importan las filas listas; las duplicadas y con error se omiten.</p>
                </>
              ) : null}
            </>
          ) : null}
          {step === 2 && result ? (
            <>
              <div className="flex flex-wrap gap-2 text-xs font-semibold">
                <span className="badge badge-success">Importadas {result.summary.imported}</span>
                <span className="badge badge-info">Autorizadas {result.summary.authorized}</span>
                <span className="badge badge-ghost">Omitidas {result.summary.skipped}</span>
                <span className="badge badge-error">Fallidas {result.summary.failed}</span>
              </div>
              <RowsTable rows={result.rows} done />
            </>
          ) : null}
          {error ? (
            <p role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" /> {error}
            </p>
          ) : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-[rgba(0,65,106,0.08)] px-5 py-4">
          {step === 2 ? (
            <button type="button" className={primaryButtonClass} onClick={onClose}>Cerrar</button>
          ) : (
            <>
              <button type="button" className={secondaryButtonClass} onClick={onClose} disabled={busy}>Cancelar</button>
              {step === 0 ? (
                <button type="button" className={primaryButtonClass} onClick={() => setStep(1)}>Ya tengo mi archivo</button>
              ) : (
                <button
                  type="button"
                  className={primaryButtonClass}
                  disabled={busy || !simulation || simulation.summary.ok === 0}
                  onClick={() => void handleImport()}
                >
                  {busy ? <Loader2 size={15} className="animate-spin" /> : null} Importar {simulation?.summary.ok ?? 0} fila(s)
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
