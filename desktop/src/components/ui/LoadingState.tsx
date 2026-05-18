import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/cn';

export default function LoadingState({ label = 'Cargando...', className }: { label?: string; className?: string }) {
  return (
    <div className={cn('flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-10 text-sm text-slate-500 shadow-card', className)}>
      <Loader2 className="h-4 w-4 animate-spin text-primary-600" />
      <span>{label}</span>
    </div>
  );
}
