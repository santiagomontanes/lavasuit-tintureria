import React, { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import dayjs from 'dayjs';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import api from '../../services/api';
import { useToastStore } from '../../store/toast.store';

const moneda = (v: number) =>
  `S/ ${Number(v ?? 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface Props {
  open:          boolean;
  onClose:       () => void;
  cajaSesion:    any;   // CajaSesion object
  resumen:       any;   // live resumen from GET /caja/actual
  onSuccess?:    () => void;
}

export default function CerrarCajaModal({ open, onClose, cajaSesion, resumen, onSuccess }: Props) {
  const toast = useToastStore();
  const [efectivoContado, setEfectivoContado] = useState('');
  const [observacion,     setObservacion]     = useState('');

  useEffect(() => {
    if (open) { setEfectivoContado(''); setObservacion(''); }
  }, [open]);

  const montoBase        = Number(cajaSesion?.montoBase ?? 0);
  const totalEfectivo    = Number(resumen?.totalEfectivo    ?? 0);
  const totalRecibido    = Number(resumen?.totalRecibido    ?? 0);
  const totalPendiente   = Number(resumen?.totalPendiente   ?? 0);
  const efectivoEsperado = Number(resumen?.efectivoEsperado ?? (montoBase + totalEfectivo));

  const contadoNum  = efectivoContado !== '' ? Number(efectivoContado.replace(',', '.')) : null;
  const diferencia  = contadoNum != null && !isNaN(contadoNum) ? contadoNum - efectivoEsperado : null;

  const mutation = useMutation({
    mutationFn: () => api.post('/caja/cerrar', {
      cajaSesionId:      cajaSesion?.id,
      efectivoContado:   contadoNum,
      observacionCierre: observacion.trim() || undefined
    }).then((r) => r.data),
    onSuccess: () => {
      toast.show('Caja cerrada correctamente', 'success');
      onSuccess?.();
      onClose();
    },
    onError: (e: any) => {
      toast.show(e?.response?.data?.error || 'No se pudo cerrar la caja', 'error');
    }
  });

  if (!cajaSesion) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cerrar caja"
      subtitle={`Abierta ${dayjs(cajaSesion.fechaApertura).format('DD/MM/YYYY HH:mm')}`}
      size="sm"
    >
      <div className="p-6 space-y-5">
        {/* Resumen de la sesión */}
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Base inicial</span>
            <span className="num font-medium">{moneda(montoBase)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Efectivo recibido</span>
            <span className="num font-medium">{moneda(totalEfectivo)}</span>
          </div>
          <div className="flex justify-between font-semibold border-t border-slate-200 pt-2">
            <span className="text-slate-700">Efectivo esperado</span>
            <span className="text-info-700 num">{moneda(efectivoEsperado)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Transferencias</span>
            <span className="num">{moneda(Number(resumen?.totalTransferencia ?? 0))}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Tarjeta</span>
            <span className="num">{moneda(Number(resumen?.totalTarjeta ?? 0))}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Yape / Plin</span>
            <span className="num">{moneda(Number(resumen?.totalOtro ?? 0))}</span>
          </div>
          <div className="flex justify-between font-bold border-t border-slate-200 pt-2">
            <span className="text-slate-700">Total recibido</span>
            <span className="text-success-700 num">{moneda(totalRecibido)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Pendiente por cobrar</span>
            <span className="text-warning-700 num">{moneda(totalPendiente)}</span>
          </div>
        </div>

        {/* Efectivo contado */}
        <label className="block">
          <span className="text-sm font-semibold text-slate-700">Efectivo contado en caja</span>
          <p className="text-xs text-slate-500 mb-1">Cuánto dinero efectivo hay físicamente en la caja.</p>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">S/</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={efectivoContado}
              onChange={(e) => setEfectivoContado(e.target.value)}
              placeholder="0.00"
              className="w-full border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </label>

        {/* Diferencia */}
        {diferencia != null && !isNaN(diferencia) && (
          <div className={`rounded-xl border px-4 py-3 flex items-center justify-between
            ${Math.abs(diferencia) < 0.01 ? 'bg-success-50 border-success-200' :
              diferencia > 0 ? 'bg-info-50 border-info-200' : 'bg-danger-50 border-danger-200'}`}>
            <div>
              <p className="font-semibold text-slate-700">
                {Math.abs(diferencia) < 0.01 ? 'Sin diferencia' :
                  diferencia > 0 ? 'Sobrante' : 'Faltante'}
              </p>
              <p className="text-xs text-slate-500">
                Contado {moneda(contadoNum!)} − Esperado {moneda(efectivoEsperado)}
              </p>
            </div>
            <span className={`text-xl font-bold num
              ${Math.abs(diferencia) < 0.01 ? 'text-success-700' :
                diferencia > 0 ? 'text-info-700' : 'text-danger-700'}`}>
              {diferencia > 0 ? '+' : ''}{moneda(diferencia)}
            </span>
          </div>
        )}

        {/* Observaciones */}
        <label className="block">
          <span className="text-sm font-semibold text-slate-700">Observaciones de cierre (opcional)</span>
          <textarea
            value={observacion}
            onChange={(e) => setObservacion(e.target.value)}
            rows={2}
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="Novedades del cierre, diferencias, etc."
          />
        </label>

        <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending}>
            Confirmar cierre
          </Button>
        </div>
      </div>
    </Modal>
  );
}
