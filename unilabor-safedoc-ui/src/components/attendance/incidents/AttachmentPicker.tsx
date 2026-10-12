import { useRef } from 'react';
import { Paperclip, X } from 'lucide-react';
import { notifyError } from '../../../utils/notify';
import { secondaryButtonClass } from '../employees/ui';
import { formatFileSize, MAX_FILES_PER_UPLOAD, validateFiles } from './incidentFormat';

interface Props {
  files: File[];
  onChange: (files: File[]) => void;
  max?: number;
}

/** Seleccion de comprobantes (JPG/PNG/WebP/PDF, 5 MB c/u). */
export const AttachmentPicker = ({ files, onChange, max = MAX_FILES_PER_UPLOAD }: Props) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSelect = (selected: FileList | null) => {
    if (!selected) return;
    const { accepted, rejected } = validateFiles(Array.from(selected));
    if (rejected.length > 0) notifyError(rejected.join(' '));
    const merged = [...files, ...accepted].slice(0, max);
    if (files.length + accepted.length > max) notifyError(`Máximo ${max} archivos por envío.`);
    onChange(merged);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        accept="image/jpeg,image/png,image/webp,application/pdf"
        onChange={(event) => handleSelect(event.target.files)}
      />
      <button type="button" className={secondaryButtonClass} onClick={() => inputRef.current?.click()} disabled={files.length >= max}>
        <Paperclip size={15} aria-hidden="true" /> Adjuntar
      </button>
      <span className="ml-2 text-xs text-[var(--unilabor-neutral)]">JPG, PNG, WebP o PDF · 5 MB · hasta {max}</span>
      {files.length > 0 ? (
        <ul className="space-y-1">
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`} className="flex items-center justify-between gap-2 rounded-lg bg-[rgba(239,245,250,0.7)] px-3 py-1.5 text-xs">
              <span className="min-w-0 truncate">{file.name} · {formatFileSize(file.size)}</span>
              <button type="button" aria-label={`Quitar ${file.name}`} onClick={() => onChange(files.filter((_, i) => i !== index))}>
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
};
