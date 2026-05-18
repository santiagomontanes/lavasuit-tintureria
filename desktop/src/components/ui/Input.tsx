import React from 'react';
import { cn } from '../../lib/cn';

export const inputClassName =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ' +
  'transition-colors placeholder:text-slate-400 hover:border-slate-300 ' +
  'focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-500/10';

interface FieldProps {
  label?: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}

export function Field({ label, error, hint, children, className }: FieldProps) {
  return (
    <label className={cn('block space-y-1.5', className)}>
      {label && <span className="text-sm font-medium text-slate-700">{label}</span>}
      {children}
      {error ? (
        <span className="block text-xs font-medium text-danger-600">{error}</span>
      ) : hint ? (
        <span className="block text-xs text-slate-500">{hint}</span>
      ) : null}
    </label>
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={cn(inputClassName, className)} {...rest} />;
  }
);

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    return <textarea ref={ref} className={cn(inputClassName, 'min-h-[84px]', className)} {...rest} />;
  }
);

export function Select({ className, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(inputClassName, 'pr-9', className)} {...rest} />;
}
