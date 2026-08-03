import type { ReactNode } from 'react';

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  className?: string;
}

export const Tooltip = ({ content, children, className = 'inline-block' }: TooltipProps) => {
  return (
    <div className={`group/tooltip relative ${className}`}>
      {children}
      <div
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-3 w-72 -translate-x-1/2 translate-y-1 opacity-0 transition-all duration-200 ease-out group-hover/tooltip:translate-y-0 group-hover/tooltip:opacity-100 sm:w-80"
      >
        <div className="rounded-2xl border border-white/10 bg-[rgba(11,34,53,0.96)] p-4 text-left shadow-2xl shadow-[rgba(0,65,106,0.35)] backdrop-blur-sm">
          {content}
        </div>
        <div className="absolute left-1/2 top-full -mt-1.5 h-3 w-3 -translate-x-1/2 rotate-45 border-b border-r border-white/10 bg-[rgba(11,34,53,0.96)]" />
      </div>
    </div>
  );
};
