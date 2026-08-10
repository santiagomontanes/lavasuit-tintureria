import React, { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import api from '../../services/api';
import { useToastStore } from '../../store/toast.store';
import { formatCurrencyCOP } from '../../lib/currency';

interface Props {
  open:       boolean;
  onClose:    () => void;
  onSuccess?: () => void;
}

export default function AbrirCajaModal({ open, onClose, onSuccess }: Props) {
  const toast = useToastStore();
  const [montoBase,    setMontoBase]    = useState('');
  const [observacion,  setObservacion]  = useState('');

  useEffect(() => {
    if (open) { setMontoBase(''); setObservacion(''); }
  }, [open]);

  const montoNum = montoBase !== '' ? Number(montoBase.replace(',', '.')) : 0;

  const mutation = useMutation({
    mutationFn: () => api.post('/caja/abrir', {
      montoBase:           isNaN(montoNum) ? 0 : montoNum,
      observacionApertura: observacion.trim() || undefined
    }).then((r) => r.data),
    onSuccess: (data) => {
      toast.show(`Caja abierta con base ${formatCurrencyCOP(data.montoBase)}`, 'success');
      onSuccess?.();
      onClose();
    },
    onError: (e: any) => {
      toast.show(e?.response?.data?.error || 'No se pudo abrir la caja', 'error');
    }
  });

  return (
    <Modal open={open} onClose={onClose} title="Abrir caja" subtitle="Registra el monto con el que inicias el turno" size="sm">
      <div className="p-6 space-y-5">
        <label className="block">
          <span className="text-sm font-semibold text-slate-700">Monto base inicial</span>
          <p className="text-xs text-slate-500 mb-1">
            Efectivo con que inicia la caja. Solo afecta el efectivo esperado, no es una venta.
          </p>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">$</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={montoBase}
              onChange={(e) => setMontoBase(e.target.value)}
              placeholder="0.00"
              className="w-full border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </label>

        {montoBase !== '' && !isNaN(montoNum) && (
          <div className="rounded-xl bg-info-50 border border-info-200 px-4 py-3 text-sm text-info-800">
            Efectivo esperado al cerrar = {formatCurrencyCOP(montoNum)} + pagos en efectivo del día
          </div>
        )}

        <label className="block">
          <span className="text-sm font-semibold text-slate-700">Observación de apertura (opcional)</span>
          <textarea
            value={observacion}
            onChange={(e) => setObservacion(e.target.value)}
            rows={2}
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="Ej. Turno mañana, suplente, etc."
          />
        </label>

        <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending}>
            Abrir caja
          </Button>
        </div>
      </div>
    </Modal>
  );
}
