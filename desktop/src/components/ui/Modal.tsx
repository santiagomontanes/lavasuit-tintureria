import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';

interface Props {
  open:     boolean;
  onClose:  () => void;
  title:    string;
  subtitle?: string;
  children: React.ReactNode;
  size?:    'sm' | 'md' | 'lg' | 'xl';
}

const sizeClass: Record<NonNullable<Props['size']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl'
};

export default function Modal({ open, onClose, title, subtitle, children, size = 'md' }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm animate-in-fade"
        onClick={onClose}
      />
      <div
        className={cn(
          'relative bg-white border border-slate-200 rounded-2xl shadow-modal w-full max-h-[90vh] flex flex-col animate-in-scale overflow-hidden',
          sizeClass[size]
        )}
        role="dialog"
        aria-modal="true"
      >
        <header className="flex items-start justify-between gap-4 px-6 py-5 border-b border-slate-100 bg-slate-50/70 shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-950 leading-tight">{title}</h2>
            {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 focus-ring"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
