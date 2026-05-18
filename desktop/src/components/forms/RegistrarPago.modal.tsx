import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { Field, Input } from '../ui/Input';
import api from '../../services/api';
import { useToastStore } from '../../store/toast.store';
import { cn } from '../../lib/cn';

const METODOS = ['EFECTIVO', 'NEQUI', 'DAVIPLATA', 'TRANSFERENCIA', 'TARJETA', 'YAPE', 'PLIN'] as const;
type Metodo = typeof METODOS[number];

interface Props {
  open:     boolean;
  onClose:  () => void;
  pedidoId: string;
  saldo:    number;
}

const fmt = (n: number) =>
  Number.isFinite(n) ? n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';

export default function RegistrarPagoModal({ open, onClose, pedidoId, saldo }: Props) {
  const qc    = useQueryClient();
  const toast = useToastStore();

  const [monto,   setMonto]   = useState('');
  const [recibido, setRecibido] = useState('');
  const [metodo,  setMetodo]  = useState<Metodo>('EFECTIVO');

  useEffect(() => {
    if (open) {
      setMonto(saldo > 0 ? saldo.toFixed(2) : '');
      setRecibido('');
      setMetodo('EFECTIVO');
    }
  }, [open, saldo]);

  const mutation = useMutation({
    mutationFn: (data: any) =>
      api.post('/pagos', data).then((r) => r.data),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['pedidos'] });
      qc.invalidateQueries({ queryKey: ['pedido', pedidoId] });
      qc.invalidateQueries({ queryKey: ['reportes'] });
      qc.invalidateQueries({ queryKey: ['empleado-pedidos'] });
      toast.show(
        data?.entregadoAuto
          ? 'Pago registrado · pedido marcado como ENTREGADO'
          : 'Pago registrado',
        'success'
      );
      onClose();
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.error || 'No se pudo registrar el pago';
      toast.show(msg, 'error');
    }
  });

  const montoNum    = Number(monto.replace(',', '.'));
  const recibidoNum = Number(recibido.replace(',', '.'));
  const validNumero = Number.isFinite(montoNum) && montoNum > 0;
  const cabeEnSaldo = validNumero && montoNum <= saldo + 0.0001;
  const aplicaEfectivo = metodo === 'EFECTIVO';
  const vueltas = aplicaEfectivo && Number.isFinite(recibidoNum) ? recibidoNum - montoNum : 0;

  const cubreTotal = validNumero && Math.abs(saldo - montoNum) < 0.0001;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validNumero) { toast.show('Monto invalido', 'error'); return; }
    if (!cabeEnSaldo) { toast.show(`El monto supera el saldo (S/ ${fmt(saldo)})`, 'error'); return; }
    mutation.mutate({ pedidoId, monto: montoNum, metodo });
  };

  const error = monto && !validNumero
    ? 'Monto invalido'
    : monto && validNumero && !cabeEnSaldo
      ? `No puede superar el saldo (S/ ${fmt(saldo)})`
      : undefined;

  const resumen = useMemo(() => ({
    total:   saldo, // saldo a cobrar (no incluye lo ya pagado)
    cobrar:  validNumero ? montoNum : 0,
    recibido: aplicaEfectivo && Number.isFinite(recibidoNum) ? recibidoNum : 0
  }), [saldo, validNumero, montoNum, aplicaEfectivo, recibidoNum]);

  return (
    <Modal open={open} onClose={onClose} title="Registrar pago" subtitle="Solo se registra el valor a cobrar, no el dinero recibido.">
      <form onSubmit={submit} className="p-6 space-y-4">
        <div className="bg-primary-50/70 border border-primary-100 px-4 py-3 rounded-xl grid grid-cols-3 gap-3 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Saldo</p>
            <p className="num font-bold text-slate-900 mt-0.5">S/ {fmt(saldo)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">A cobrar</p>
            <p className="num font-bold text-primary-700 mt-0.5">S/ {fmt(resumen.cobrar)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recibido</p>
            <p className="num font-bold text-slate-900 mt-0.5">
              {aplicaEfectivo ? `S/ ${fmt(resumen.recibido)}` : '—'}
            </p>
          </div>
        </div>

        <Field label="Valor a cobrar *" error={error}>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">S/</span>
            <Input
              type="text"
              inputMode="decimal"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              autoFocus
              className="pl-9"
            />
          </div>
        </Field>

        <div>
          <span className="text-sm font-medium text-slate-700 block mb-2">Método *</span>
          <div className="grid grid-cols-4 lg:grid-cols-7 gap-2">
            {METODOS.map((m) => (
              <button
                type="button"
                key={m}
                onClick={() => setMetodo(m)}
                className={cn(
                  'px-2 py-2 rounded-lg text-xs font-semibold border transition-colors focus-ring',
                  metodo === m
                    ? 'bg-slate-950 text-white border-slate-950'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-primary-50 hover:border-primary-200'
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {aplicaEfectivo && (
          <Field label="Dinero recibido (solo efectivo)" hint="Si el cliente paga con un billete mayor, calculamos las vueltas. El pago registrado es solo el valor a cobrar.">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">S/</span>
              <Input
                type="text"
                inputMode="decimal"
                value={recibido}
                onChange={(e) => setRecibido(e.target.value)}
                className="pl-9"
                placeholder="Ej: 50000"
              />
            </div>
          </Field>
        )}

        {aplicaEfectivo && Number.isFinite(recibidoNum) && validNumero && (
          <div className={cn(
            'flex items-center justify-between px-4 py-3 rounded-xl border',
            vueltas >= 0
              ? 'bg-success-50 border-success-200 text-success-700'
              : 'bg-danger-50 border-danger-200 text-danger-700'
          )}>
            <span className="text-sm font-semibold">
              {vueltas >= 0 ? 'Vueltas a devolver' : 'Falta'}
            </span>
            <span className="num text-xl font-bold">S/ {fmt(Math.abs(vueltas))}</span>
          </div>
        )}

        {cubreTotal && (
          <div className="px-4 py-2 rounded-lg bg-success-50 border border-success-200 text-success-700 text-sm font-semibold">
            Cubre el saldo → el pedido pasará automáticamente a ENTREGADO.
          </div>
        )}

        <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
          <Button type="button" onClick={onClose} disabled={mutation.isPending} variant="secondary">
            Cancelar
          </Button>
          <Button type="submit" disabled={!cabeEnSaldo || mutation.isPending} loading={mutation.isPending}>
            Registrar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
