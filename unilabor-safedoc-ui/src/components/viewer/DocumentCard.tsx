// src/components/viewer/DocumentCard.tsx

import { EyeIcon } from "lucide-react";

interface DocumentCardData {
  id: string | number;
  title: string;
  description: string;
  category_name: string;
  expiry_date: string;
  publish_date: string;
}

interface DocumentCardProps {
  doc: DocumentCardData;
  onOpen: (doc: DocumentCardData) => void;
}

export const DocumentCard = ({ doc, onOpen }: DocumentCardProps) => {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-xl shadow-slate-950/40 transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-500/40">
      <div className="flex justify-between items-start mb-2">
        <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-cyan-200">
          {doc.category_name}
        </span>
        <span className={`text-[10px] font-medium ${new Date(doc.expiry_date) < new Date() ? 'text-red-300' : 'text-slate-500'}`}>
          Expira: {new Date(doc.expiry_date).toLocaleDateString()}
        </span>
      </div>
      
      <h3 className="font-bold text-slate-100 text-sm mb-1 truncate">{doc.title}</h3>
      <p className="text-xs text-slate-400 line-clamp-2 mb-4 h-8">{doc.description}</p>
      
      <div className="flex items-center justify-between border-t border-slate-800 pt-3">
        <div className="text-[10px] text-slate-500">
          Publicado: {doc.publish_date}
        </div>
        <button 
          onClick={() => onOpen(doc)}
          className="flex items-center gap-1 text-cyan-300 hover:text-cyan-100 font-bold text-xs transition-colors"
        >
          <EyeIcon className="h-4 w-4" />
          VER DOCUMENTO
        </button>
      </div>
    </div>
  );
};
