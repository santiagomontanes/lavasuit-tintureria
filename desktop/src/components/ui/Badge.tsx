import React from 'react';
import { cn } from '../../lib/cn';

type Tone =
  | 'neutral'
  | 'primary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info';

interface Props extends React.HTMLAttributes<HTMLSpanElement> {
  tone?:    Tone;
  dot?:     boolean;
  outline?: boolean;
}

const toneCls: Record<Tone, { solid: string; outline: string; dot: string }> = {
  neutral: { solid: 'bg-slate-100   text-slate-700',   outline: 'border-slate-200 text-slate-700',     dot: 'bg-slate-400'   },
  primary: { solid: 'bg-primary-50  text-primary-700', outline: 'border-primary-200 text-primary-700', dot: 'bg-primary-500' },
  success: { solid: 'bg-success-50  text-success-700', outline: 'border-success-200 text-success-700', dot: 'bg-success-500' },
  warning: { solid: 'bg-warning-50  text-warning-700', outline: 'border-warning-200 text-warning-700', dot: 'bg-warning-500' },
  danger:  { solid: 'bg-danger-50   text-danger-700',  outline: 'border-danger-200 text-danger-700',   dot: 'bg-danger-500'  },
  info:    { solid: 'bg-info-50     text-info-700',    outline: 'border-info-200 text-info-700',       dot: 'bg-info-500'    }
};

export default function Badge({ tone = 'neutral', dot, outline, className, children, ...rest }: Props) {
  const t = toneCls[tone];
  return (
    <span
      {...rest}
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium',
        outline ? `border ${t.outline} bg-white` : t.solid,
        className
      )}
    >
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', t.dot)} />}
      {children}
    </span>
  );
}

/* Helper para mapear estado de pedido a un Badge consistente */
export const PEDIDO_ESTADO_TONE: Record<string, Tone> = {
  RECIBIDO:   'info',
  EN_PROCESO: 'warning',
  LISTO:      'success',
  ENTREGADO:  'neutral',
  CANCELADO:  'danger'
};

export const PEDIDO_ESTADO_LABEL: Record<string, string> = {
  RECIBIDO:   'Recibido',
  EN_PROCESO: 'En proceso',
  LISTO:      'Listo',
  ENTREGADO:  'Entregado',
  CANCELADO:  'Cancelado'
};
