import React from 'react';
import { cn } from '../../lib/cn';

export function TableContainer({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('bg-white/95 border border-slate-200/80 rounded-xl2 shadow-card overflow-hidden', className)}>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

export function Table({ className, children }: { className?: string; children: React.ReactNode }) {
  return <table className={cn('w-full text-sm', className)}>{children}</table>;
}

export function THead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="bg-slate-50/90 backdrop-blur border-b border-slate-200">
      {children}
    </thead>
  );
}

export function TH({ className, children, align }: { className?: string; align?: 'left' | 'right' | 'center'; children: React.ReactNode }) {
  return (
    <th
      className={cn(
        'px-4 py-3 font-semibold text-xs uppercase tracking-wide text-slate-500',
        align === 'right'  && 'text-right',
        align === 'center' && 'text-center',
        align !== 'right' && align !== 'center' && 'text-left',
        className
      )}
    >
      {children}
    </th>
  );
}

export function TBody({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-slate-100 bg-white">{children}</tbody>;
}

interface TRProps extends React.HTMLAttributes<HTMLTableRowElement> {
  interactive?: boolean;
}
export function TR({ className, interactive, children, ...rest }: TRProps) {
  return (
    <tr
      {...rest}
      className={cn(
        interactive && 'cursor-pointer hover:bg-cyan-50/40 transition-colors',
        className
      )}
    >
      {children}
    </tr>
  );
}

export function TD({ className, children, align }: { className?: string; align?: 'left' | 'right' | 'center'; children: React.ReactNode }) {
  return (
    <td
      className={cn(
        'px-4 py-3.5 text-slate-700 align-middle',
        align === 'right'  && 'text-right',
        align === 'center' && 'text-center',
        className
      )}
    >
      {children}
    </td>
  );
}
