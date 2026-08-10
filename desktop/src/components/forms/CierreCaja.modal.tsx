import React, { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import dayjs from 'dayjs';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import api from '../../services/api';
import { useToastStore } from '../../store/toast.store';

import { formatCurrencyCOP } from '../../lib/currency';
const moneda = formatCurrencyCOP;

interface Props {
  open:       boolean;
  onClose:    () => void;
  resumen:    any;
  fecha:      string;
  onSuccess?: () => void;
}

export default function CierreCajaModal({ open, onClose, resumen, fecha, onSuccess }: Props) {
  const toast = useToastStore();
  const [costoManual, setCostoManual]   = useState('');
  const [observaciones, setObservaciones] = useState('');

  useEffect(() => {
    if (open) { setCostoManual(''); setObservaciones(''); }
  }, [open]);

  const totalRecibido   = Number(resumen?.totalRecibido ?? 0);
  const costo           = costoManual !== '' ? Number(costoManual.replace(',', '.')) : null;
  const utilidad        = costo != null && !isNaN(costo) ? totalRecibido - costo : null;

  const mutation = useMutation({
    mutationFn: () => api.post('/caja/cierre', {
      fecha,
      costoManual:   costo,
      observaciones: observaciones.trim() || undefined
    }).then((r) => r.data),
    onSuccess: (data) => {
      toast.show(`Caja cerrada. Recibido: ${moneda(Number(data.totalRecibido))}`, 'success');
      onSuccess?.();
      onClose();
    },
    onError: (e: any) => {
      toast.show(e?.response?.data?.error || 'No se pudo cerrar la caja', 'error');
    }
  });

  return (
    <Modal open={open} onClose={onClose} title="Cerrar caja" subtitle={`Resumen del ${dayjs(fecha).format('DD/MM/YYYY')}`} size="sm">
      <div className="p-6 space-y-5">
        {/* Resumen de la caja */}
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-600">Total recibido</span>
            <span className="font-bold text-success-700 num">{moneda(totalRecibido)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">Efectivo</span>
            <span className="num">{moneda(Number(resumen?.totalEfectivo ?? 0))}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">Transferencia</span>
            <span className="num">{moneda(Number(resumen?.totalTransferencia ?? 0))}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">Tarjeta</span>
            <span className="num">{moneda(Number(resumen?.totalTarjeta ?? 0))}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">Yape / Plin</span>
            <span className="num">{moneda(Number(resumen?.totalOtros ?? 0))}</span>
          </div>
          <div className="flex justify-between border-t border-slate-200 pt-2">
            <span className="font-semibold text-slate-700">Pendiente por cobrar</span>
            <span className="font-bold text-warning-700 num">{moneda(Number(resumen?.totalPendiente ?? 0))}</span>
          </div>
        </div>

        {/* Costo manual (opcional) */}
        <label className="block">
          <span className="text-sm font-semibold text-slate-700">Costo / Gasto del día (opcional)</span>
          <p className="text-xs text-slate-500 mb-1">Si introduces un costo, se calculará la utilidad estimada.</p>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">$</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={costoManual}
              onChange={(e) => setCostoManual(e.target.value)}
              placeholder="0.00"
              className="w-full border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </label>

        {/* Utilidad calculada */}
        {utilidad != null && !isNaN(utilidad) && (
          <div className={`rounded-xl border px-4 py-3 flex items-center justify-between
            ${utilidad >= 0 ? 'bg-success-50 border-success-200' : 'bg-danger-50 border-danger-200'}`}>
            <span className="font-semibold text-slate-700">Utilidad estimada</span>
            <span className={`text-xl font-bold num ${utilidad >= 0 ? 'text-success-700' : 'text-danger-700'}`}>
              {moneda(utilidad)}
            </span>
          </div>
        )}

        {/* Observaciones */}
        <label className="block">
          <span className="text-sm font-semibold text-slate-700">Observaciones (opcional)</span>
          <textarea
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            rows={3}
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="Novedades del día, inconvenientes, etc."
          />
        </label>

        <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending}>
            Cerrar caja
          </Button>
        </div>
      </div>
    </Modal>
  );
}
