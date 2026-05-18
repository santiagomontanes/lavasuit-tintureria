import React from 'react';
import { cn } from '../../lib/cn';

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      className={cn(
        'bg-white/95 border border-slate-200/80 rounded-xl2 shadow-card',
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      className={cn(
        'px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3',
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardTitle({ className, children, ...rest }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 {...rest} className={cn('text-sm font-semibold text-slate-900', className)}>
      {children}
    </h3>
  );
}

export function CardBody({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={cn('px-5 py-4', className)}>
      {children}
    </div>
  );
}

export function CardFooter({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={cn('px-5 py-3 border-t border-slate-100 bg-slate-50/50 rounded-b-xl2', className)}>
      {children}
    </div>
  );
}
