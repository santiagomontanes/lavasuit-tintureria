import React, { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import dayjs from 'dayjs';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import api from '../../services/api';
import { useToastStore } from '../../store/toast.store';

import { formatCurrencyCOP } from '../../lib/currency';
import { resultadoCaja } from '../../lib/cajaResultado';
const moneda = formatCurrencyCOP;

interface Props {
  open:          boolean;
  onClose:       () => void;
  cajaSesion:    any;   // CajaSesion object
  resumen:       any;   // live resumen from GET /caja/actual
  onSuccess?:    () => void;
}

/* Denominaciones del peso colombiano para el conteo físico.
 * Espejo de la lista de Mobile y del backend. Solo billetes y monedas. */
const DENOMINACIONES = [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500];

export default function CerrarCajaModal({ open, onClose, cajaSesion, resumen, onSuccess }: Props) {
  const toast = useToastStore();
  const [efectivoContado, setEfectivoContado] = useState('');
  const [observacion,     setObservacion]     = useState('');
  const [conteo,          setConteo]          = useState<Record<number, string>>({});

  useEffect(() => {
    if (open) { setEfectivoContado(''); setObservacion(''); setConteo({}); }
  }, [open]);

  const montoBase          = Number(cajaSesion?.montoBase ?? 0);
  const totalEfectivo      = Number(resumen?.totalEfectivo      ?? 0);
  const totalNequi         = Number(resumen?.totalNequi         ?? 0);
  const totalDaviplata     = Number(resumen?.totalDaviplata     ?? 0);
  const totalTransferencia = Number(resumen?.totalTransferencia ?? 0);
  const totalTarjeta       = Number(resumen?.totalTarjeta       ?? 0);
  const totalOtro          = Number(resumen?.totalOtros ?? resumen?.totalOtro ?? 0);
  const totalRecibido      = Number(resumen?.totalRecibido      ?? 0);
  const totalGastos        = Number(resumen?.totalGastos        ?? 0);
  const gastosEfectivo     = Number(resumen?.totalGastosEfectivo ?? 0);
  const gastosOtros        = Math.max(0, totalGastos - gastosEfectivo);

  /* EFECTIVO ESPERADO = base + pagos EFECTIVO − gastos EFECTIVO.
   * Antes se restaba el TOTAL de gastos (incluidos los pagados por Nequi o
   * transferencia), así que un gasto digital bajaba el efectivo esperado y el
   * arqueo del Desktop no coincidía con el del backend ni con Mobile.
   * Nequi/Daviplata/transferencia/tarjeta NO suman al efectivo esperado. */
  const efectivoEsperado = montoBase + totalEfectivo - gastosEfectivo;

  const cantidadDenom = (valor: number): number => {
    const n = parseInt((conteo[valor] ?? '').replace(/[^0-9]/g, ''), 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const totalConteo = DENOMINACIONES.reduce((acc, v) => acc + v * cantidadDenom(v), 0);
  const hayConteo   = DENOMINACIONES.some((v) => cantidadDenom(v) > 0);

  /* Escribir una cantidad recalcula y rellena el efectivo contado. */
  const setDenominacion = (valor: number, texto: string) => {
    const siguiente = { ...conteo, [valor]: texto.replace(/[^0-9]/g, '') };
    setConteo(siguiente);
    const suma = DENOMINACIONES.reduce((acc, v) => {
      const n = parseInt((siguiente[v] ?? '').replace(/[^0-9]/g, ''), 10);
      return acc + v * (Number.isFinite(n) && n > 0 ? n : 0);
    }, 0);
    setEfectivoContado(suma > 0 ? String(suma) : '');
  };

  const denominacionesPayload = (): Record<string, number> | undefined => {
    const out: Record<string, number> = {};
    for (const v of DENOMINACIONES) {
      const n = cantidadDenom(v);
      if (n > 0) out[String(v)] = n;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  };

  const contadoNum  = efectivoContado !== '' ? Number(efectivoContado.replace(',', '.')) : null;
  const diferencia  = contadoNum != null && !isNaN(contadoNum) ? contadoNum - efectivoEsperado : null;

  const mutation = useMutation({
    mutationFn: () => api.post('/caja/cerrar', {
      cajaSesionId:      cajaSesion?.id,
      efectivoContado:   contadoNum,
      observacionCierre: observacion.trim() || undefined,
      denominaciones:    denominacionesPayload()
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
        {/* Desglose COMPLETO de la sesión, método por método. */}
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Base inicial</span>
            <span className="num font-medium">{moneda(montoBase)}</span>
          </div>
          <div className="flex justify-between border-t border-slate-200 pt-2">
            <span className="text-slate-500">Efectivo recibido</span>
            <span className="num font-medium">{moneda(totalEfectivo)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Nequi</span>
            <span className="num font-medium">{moneda(totalNequi)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Daviplata</span>
            <span className="num font-medium">{moneda(totalDaviplata)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Transferencia</span>
            <span className="num font-medium">{moneda(totalTransferencia)}</span>
          </div>
          {totalTarjeta > 0 && (
            <div className="flex justify-between">
              <span className="text-slate-500">Tarjeta</span>
              <span className="num font-medium">{moneda(totalTarjeta)}</span>
            </div>
          )}
          {totalOtro > 0 && (
            <div className="flex justify-between">
              <span className="text-slate-500">Otros métodos</span>
              <span className="num font-medium">{moneda(totalOtro)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-slate-200 pt-2">
            <span className="text-slate-500">Gastos en efectivo</span>
            <span className="num font-medium text-warning-700">−{moneda(gastosEfectivo)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Gastos otros métodos</span>
            <span className="num font-medium text-warning-700">−{moneda(gastosOtros)}</span>
          </div>
          <div className="flex justify-between font-bold border-t border-slate-200 pt-2">
            <span className="text-slate-700">Total recibido</span>
            <span className="text-success-700 num">{moneda(totalRecibido)}</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span className="text-slate-700">Efectivo esperado</span>
            <span className="text-info-700 num">{moneda(efectivoEsperado)}</span>
          </div>
          <p className="text-xs text-slate-500 pt-1">
            Efectivo esperado = base + efectivo recibido − gastos en efectivo.
            Nequi y demás métodos digitales no lo modifican.
          </p>
        </div>

        {/* Conteo físico por denominación */}
        <div className="rounded-xl border border-slate-200 p-4">
          <p className="text-sm font-semibold text-slate-700">Conteo de billetes y monedas</p>
          <p className="text-xs text-slate-500 mb-3">
            Escribe cuántos hay de cada uno; el efectivo contado se calcula solo.
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {DENOMINACIONES.map((valor) => (
              <div key={valor} className="flex items-center gap-2">
                <span className="w-20 text-sm font-semibold text-slate-700">{moneda(valor)}</span>
                <span className="text-slate-400 text-sm">×</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={conteo[valor] ?? ''}
                  onChange={(e) => setDenominacion(valor, e.target.value)}
                  placeholder="0"
                  className="w-14 border border-slate-200 rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <span className="num flex-1 text-right text-sm text-slate-500">
                  {moneda(valor * cantidadDenom(valor))}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-between border-t border-slate-100 pt-2 text-sm font-semibold">
            <span className="text-slate-700">Total contado</span>
            <span className="num text-success-700">{moneda(totalConteo)}</span>
          </div>
        </div>

        {/* Efectivo contado */}
        <label className="block">
          <span className="text-sm font-semibold text-slate-700">Efectivo contado en caja</span>
          <p className="text-xs text-slate-500 mb-1">
            {hayConteo
              ? 'Se llenó con la suma del conteo. Puedes ajustarlo a mano si hace falta.'
              : 'Cuánto dinero efectivo hay físicamente en la caja.'}
          </p>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">$</span>
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

        {/* Resultado del cierre (texto claro, misma regla que mobile/reportes) */}
        {(() => {
          const r = resultadoCaja(diferencia);
          if (!r) return null;
          const cls = r.tono === 'cuadrada' ? 'bg-success-50 border-success-200 text-success-700'
            : r.tono === 'mas' ? 'bg-info-50 border-info-200 text-info-700'
            : 'bg-danger-50 border-danger-200 text-danger-700';
          return (
            <div className={`rounded-xl border px-4 py-3 ${cls}`}>
              <p className="font-bold">{r.texto}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Contado {moneda(contadoNum!)} − Esperado {moneda(efectivoEsperado)} = {diferencia! > 0 ? '+' : ''}{moneda(diferencia!)}
              </p>
            </div>
          );
        })()}

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
