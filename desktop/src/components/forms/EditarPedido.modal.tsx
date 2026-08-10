import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, AlertTriangle, ShieldAlert } from 'lucide-react';
import Modal from '../ui/Modal';
import api from '../../services/api';
import { useToastStore } from '../../store/toast.store';
import { formatCurrencyCOP } from '../../lib/currency';
import ItemsPedidoEditor, {
  EditorItem, coloresCompletos, itemsPayload, itemDesdePedidoItem
} from './ItemsPedidoEditor';
import { useAuthStore } from '../../store/auth.store';

interface Props {
  open:   boolean;
  onClose: () => void;
  pedido: any;
}

export default function EditarPedidoModal({ open, onClose, pedido }: Props) {
  const qc    = useQueryClient();
  const toast = useToastStore();
  const esAdmin = useAuthStore((s) => s.usuario?.rol === 'ADMIN');

  const [items,        setItems]        = useState<EditorItem[]>([]);
  const [notas,        setNotas]        = useState('');
  const [fechaEntrega, setFechaEntrega] = useState('');
  const [motivo,       setMotivo]       = useState('');
  const [mostrarErrores, setMostrarErrores] = useState(false);

  useEffect(() => {
    if (open && pedido) {
      setItems((pedido.items ?? []).map(itemDesdePedidoItem));
      setNotas(pedido.notas ?? '');
      setFechaEntrega(pedido.fechaEntrega ? String(pedido.fechaEntrega).slice(0, 10) : '');
      setMotivo('');
      setMostrarErrores(false);
    }
  }, [open, pedido]);

  // ids de PedidoItem que tienen garantías → no se pueden eliminar.
  const idsConGarantia = useMemo(() => {
    const set = new Set<string>();
    for (const g of (pedido?.garantias ?? [])) {
      if (g.pedidoItemId) set.add(g.pedidoItemId);
    }
    return set;
  }, [pedido?.garantias]);

  const pagado = useMemo(
    () => (pedido?.pagos ?? []).reduce((acc: number, p: any) => acc + Number(p.monto), 0),
    [pedido?.pagos]
  );

  const total = useMemo(
    () => items.reduce((acc, i) => acc + i.precio * i.cantidad, 0),
    [items]
  );
  // El saldo se mide contra prendas + deuda anterior consolidada: editar las
  // prendas no debe marcar "sobrepago" si los abonos cubren también la deuda.
  const deudaConsolidada = Number(pedido?.deudaConsolidada ?? 0);
  const saldo = (total + deudaConsolidada) - pagado;
  const sobrepago = saldo < -0.001;

  const validarFecha = (s: string) =>
    !s || (/^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)));

  const mutation = useMutation({
    mutationFn: (data: any) =>
      api.patch(`/pedidos/${pedido.id}`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pedido', pedido.id] });
      qc.invalidateQueries({ queryKey: ['pedido-historial', pedido.id] });
      qc.invalidateQueries({ queryKey: ['pedidos'] });
      qc.invalidateQueries({ queryKey: ['reportes'] });
      qc.invalidateQueries({ queryKey: ['caja'] });
      toast.show('Pedido actualizado', 'success');
      onClose();
    },
    onError: (e: any) => {
      toast.show(e?.response?.data?.error || 'No se pudo actualizar el pedido', 'error');
    }
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) { toast.show('El pedido debe tener al menos una prenda', 'error'); return; }
    if (!validarFecha(fechaEntrega)) { toast.show('Fecha de entrega inválida', 'error'); return; }
    if (!coloresCompletos(items)) {
      setMostrarErrores(true);
      toast.show('Seleccione color base y color destino en todas las prendas', 'error');
      return;
    }
    if (!motivo.trim()) {
      toast.show('Escribe el motivo del cambio antes de guardar', 'error');
      return;
    }
    mutation.mutate({
      motivo:       motivo.trim(),
      items:        itemsPayload(items),
      notas:        notas.trim() || null,
      fechaEntrega: fechaEntrega || null
    });
  };

  if (!esAdmin) return null;

  return (
    <Modal open={open} onClose={onClose} title={`Editar pedido #${pedido?.numero ?? ''}`} size="lg">
      <form onSubmit={submit} className="p-6 space-y-5">
        {idsConGarantia.size > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <ShieldAlert size={16} className="mt-0.5 shrink-0" />
            <span>
              Este pedido tiene garantías asociadas. Las prendas con garantía no se pueden eliminar
              para conservar la trazabilidad (historial, fotos y reclamaciones).
            </span>
          </div>
        )}

        <section>
          <h3 className="font-semibold text-slate-800 mb-2">Prendas / servicios</h3>
          <ItemsPedidoEditor
            items={items}
            onChange={setItems}
            mostrarErrores={mostrarErrores}
            esAdmin={esAdmin}
            idsConGarantia={idsConGarantia}
          />
        </section>

        <section className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Fecha de entrega</span>
            <input
              type="date"
              value={fechaEntrega}
              onChange={(e) => setFechaEntrega(e.target.value)}
              className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
        </section>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Notas / observaciones</span>
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={2}
            className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>

        {/* Resumen financiero recalculado */}
        <div className="rounded-lg bg-slate-50 px-4 py-3 space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-slate-600">Total recalculado</span><span className="font-bold text-blue-600">{formatCurrencyCOP(total)}</span></div>
          <div className="flex justify-between"><span className="text-slate-600">Pagado</span><span className="font-semibold text-green-700">{formatCurrencyCOP(pagado)}</span></div>
          <div className="flex justify-between"><span className="text-slate-600">{sobrepago ? 'Saldo a favor' : 'Saldo pendiente'}</span>
            <span className={`font-bold ${sobrepago ? 'text-amber-700' : 'text-slate-900'}`}>{formatCurrencyCOP(Math.abs(saldo))}</span></div>
        </div>

        {pagado > 0 && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Esta orden tiene pagos registrados. El total cambiará, pero los pagos se conservarán.
          </div>
        )}

        {sobrepago && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>El nuevo total ({formatCurrencyCOP(total)}) es menor que lo pagado ({formatCurrencyCOP(pagado)}).
              El pedido queda con saldo a favor / sobrepago de {formatCurrencyCOP(Math.abs(saldo))}. Los pagos no se modifican.</span>
          </div>
        )}

        {/* Motivo del cambio (obligatorio, auditoría) */}
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Motivo del cambio *</span>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={2}
            placeholder="Ej: Cliente pidió cambiar color, se corrigió precio, se agregó prenda olvidada…"
            className={`mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
              motivo.trim() ? 'border-slate-300 focus:ring-blue-500' : 'border-amber-300 focus:ring-amber-400'
            }`}
          />
          {!motivo.trim() && <span className="text-xs text-amber-600">Obligatorio para guardar (queda en el historial).</span>}
        </label>

        <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
          <button type="button" onClick={onClose} disabled={mutation.isPending}
            className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            Cancelar
          </button>
          <button type="submit" disabled={mutation.isPending || !motivo.trim()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg flex items-center gap-2">
            {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
            Guardar cambios
          </button>
        </div>
      </form>
    </Modal>
  );
}
