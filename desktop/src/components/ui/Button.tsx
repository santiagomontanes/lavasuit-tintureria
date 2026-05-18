import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type Size    = 'sm' | 'md' | 'lg';

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:  Variant;
  size?:     Size;
  loading?:  boolean;
  leftIcon?: React.ReactNode;
  rightIcon?:React.ReactNode;
  block?:    boolean;
}

const baseCls =
  'inline-flex items-center justify-center gap-2 font-medium rounded-lg ' +
  'transition-all duration-150 select-none ' +
  'disabled:opacity-50 disabled:cursor-not-allowed focus-ring';

const variantCls: Record<Variant, string> = {
  primary:
    'bg-slate-950 hover:bg-slate-800 active:bg-slate-900 text-white shadow-card',
  secondary:
    'bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-800 border border-slate-200 shadow-sm',
  ghost:
    'bg-transparent hover:bg-slate-100 active:bg-slate-200 text-slate-700',
  danger:
    'bg-danger-600 hover:bg-danger-700 text-white shadow-card',
  success:
    'bg-success-600 hover:bg-success-700 text-white shadow-card'
};

const sizeCls: Record<Size, string> = {
  sm: 'h-8  px-3 text-xs',
  md: 'h-9  px-4 text-sm',
  lg: 'h-11 px-5 text-base'
};

const Button = React.forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'primary', size = 'md', loading, leftIcon, rightIcon, block, className, children, disabled, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        baseCls,
        variantCls[variant],
        sizeCls[size],
        block && 'w-full',
        className
      )}
      {...rest}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {!loading && leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  );
});

export default Button;
