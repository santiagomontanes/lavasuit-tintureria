import React from 'react';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';
import { useToastStore, ToastKind } from '../../store/toast.store';
import { cn } from '../../lib/cn';

const estilo: Record<ToastKind, {
  ring: string;
  iconBg: string;
  iconClr: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}> = {
  success: { ring: 'border-success-200', iconBg: 'bg-success-50', iconClr: 'text-success-600', icon: CheckCircle2 },
  error:   { ring: 'border-danger-200',  iconBg: 'bg-danger-50',  iconClr: 'text-danger-600',  icon: XCircle      },
  info:    { ring: 'border-slate-200',   iconBg: 'bg-slate-100',  iconClr: 'text-slate-600',   icon: Info         }
};

export default function ToastContainer() {
  const toasts  = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => {
        const { ring, iconBg, iconClr, icon: Icon } = estilo[t.kind];
        return (
          <div
            key={t.id}
            className={cn(
              'bg-white border rounded-xl2 shadow-pop pl-3 pr-2 py-3 flex items-start gap-3 animate-in-up',
              ring
            )}
          >
            <div className={cn('shrink-0 h-7 w-7 rounded-full flex items-center justify-center', iconBg)}>
              <Icon size={14} className={iconClr} />
            </div>
            <p className="flex-1 text-sm leading-snug text-slate-700 pt-0.5">{t.message}</p>
            <button
              onClick={() => dismiss(t.id)}
              className="shrink-0 p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 focus-ring"
              aria-label="Cerrar"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
