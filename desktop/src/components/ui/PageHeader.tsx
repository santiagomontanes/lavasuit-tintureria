import React from 'react';
import { cn } from '../../lib/cn';

interface Props {
  title: string;
  description?: string;
  eyebrow?: string;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export default function PageHeader({ title, description, eyebrow, meta, actions, className }: Props) {
  return (
    <div className={cn('flex items-start justify-between gap-5', className)}>
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary-700">
            {eyebrow}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-2xl font-semibold text-slate-950 tracking-tight">{title}</h2>
          {meta}
        </div>
        {description && (
          <p className="mt-1 max-w-2xl text-sm text-slate-500">{description}</p>
        )}
      </div>
      {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
    </div>
  );
}
