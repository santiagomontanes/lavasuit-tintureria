import React from 'react';
import { cn } from '../../lib/cn';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface Props {
  label:      string;
  value:      string | number;
  hint?:      string;
  icon?:      React.ReactNode;
  delta?:     number; // % cambio
  tone?:      'primary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  className?: string;
}

const toneIconBg: Record<NonNullable<Props['tone']>, string> = {
  primary: 'bg-primary-50 text-primary-700 ring-primary-100',
  success: 'bg-success-50 text-success-700 ring-success-100',
  warning: 'bg-warning-50 text-warning-700 ring-warning-100',
  danger:  'bg-danger-50  text-danger-700 ring-danger-100',
  info:    'bg-info-50    text-info-700 ring-info-100',
  neutral: 'bg-slate-100  text-slate-700 ring-slate-200'
};

const toneBar: Record<NonNullable<Props['tone']>, string> = {
  primary: 'from-primary-500 to-cyan-300',
  success: 'from-success-500 to-emerald-300',
  warning: 'from-warning-500 to-amber-200',
  danger:  'from-danger-500 to-rose-200',
  info:    'from-info-500 to-sky-200',
  neutral: 'from-slate-400 to-slate-200'
};

export default function StatCard({ label, value, hint, icon, delta, tone = 'neutral', className }: Props) {
  const positive = typeof delta === 'number' && delta >= 0;
  return (
    <div className={cn('relative overflow-hidden bg-white/95 border border-slate-200/80 rounded-xl2 shadow-card p-5', className)}>
      <div className={cn('absolute inset-x-0 top-0 h-1 bg-gradient-to-r', toneBar[tone])} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
          <p className="num mt-2 text-2xl font-semibold text-slate-950 truncate">{value}</p>
          {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
        </div>
        {icon && (
          <div className={cn('shrink-0 h-10 w-10 rounded-xl flex items-center justify-center ring-1', toneIconBg[tone])}>
            {icon}
          </div>
        )}
      </div>
      {typeof delta === 'number' && (
        <div className="mt-3 flex items-center gap-1 text-xs">
          {positive ? (
            <TrendingUp className="h-3.5 w-3.5 text-success-600" />
          ) : (
            <TrendingDown className="h-3.5 w-3.5 text-danger-600" />
          )}
          <span className={cn('font-medium num', positive ? 'text-success-700' : 'text-danger-700')}>
            {positive ? '+' : ''}{delta.toFixed(1)}%
          </span>
          <span className="text-slate-400">vs ayer</span>
        </div>
      )}
    </div>
  );
}
