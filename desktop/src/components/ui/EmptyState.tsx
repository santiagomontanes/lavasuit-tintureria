import React from 'react';
import { cn } from '../../lib/cn';

interface Props {
  icon?:        React.ReactNode;
  title:        string;
  description?: string;
  action?:      React.ReactNode;
  className?:   string;
  compact?:     boolean;
}

export default function EmptyState({ icon, title, description, action, className, compact }: Props) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'py-8' : 'py-16',
        className
      )}
    >
      {icon && (
        <div className="mb-4 w-12 h-12 rounded-2xl bg-primary-50 ring-1 ring-primary-100 flex items-center justify-center text-primary-700">
          {icon}
        </div>
      )}
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      {description && (
        <p className="text-sm text-slate-500 mt-1 max-w-sm">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
