import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Search } from 'lucide-react';
import Modal from '../ui/Modal';
import api from '../../services/api';
import { useToastStore } from '../../store/toast.store';
import { formatCurrencyCOP } from '../../lib/currency';
import ItemsPedidoEditor, {
  EditorItem, coloresCompletos, itemsPayload
} from './ItemsPedidoEditor';
import { useAuthStore } from '../../store/auth.store';
import { useNavStore } from '../../store/nav.store';

interface Props { open: boolean; onClose: () => void; }

export default function NuevoPedidoModal({ open, onClose }: Props) {
  const qc    = useQueryClient();
  const toast = useToastStore();
  const esAdmin = useAuthStore((s) => s.usuario?.rol === 'ADMIN');
  const navegar = useNavStore((s) => s.navegar);

  const [clienteId,    setClienteId]    = useState<string | null>(null);
  const [items,        setItems]        = useState<EditorItem[]>([]);
  const [encargado,    setEncargado]    = useState('');
  const [incluirDeuda, setIncluirDeuda] = useState(false);
  const [notas,        setNotas]        = useState('');
  const [fechaEntrega, setFechaEntrega] = useState('');
  const [busqueda,     setBusqueda]     = useState('');
  const [mostrarErrores, setMostrarErrores] = useState(false);

  useEffect(() => {
    if (open) {
      setClienteId(null);
      setItems([]);
      setEncargado('');
      setIncluirDeuda(false);
      setNotas('');
      setFechaEntrega('');
      setBusqueda('');
      setMostrarErrores(false);
    }
  }, [open]);

  // Al cambiar de cliente, resetear la elección de consolidar deuda.
  useEffect(() => { setIncluirDeuda(false); }, [clienteId]);

  const clientesQ = useQuery({
    queryKey: ['clientes'],
    queryFn:  () => api.get('/clientes').then((r) => r.data as any[]),
    enabled:  open
  });

  const clientesFiltrados = useMemo(() => {
    if (!clientesQ.data) return [];
    const q = busqueda.trim().toLowerCase();
    if (!q) return clientesQ.data;
    return clientesQ.data.filter((c: any) =>
      c.nombre.toLowerCase().includes(q) ||
      (c.telefono ?? '').includes(q)
    );
  }, [clientesQ.data, busqueda]);

  const clienteSeleccionado =
    clientesQ.data?.find((c: any) => c.id === clienteId) ?? null;

  // Deuda anterior del cliente (punto 9). Sólo cuando hay cliente seleccionado.
  const deudaQ = useQuery({
    queryKey: ['cliente-deuda', clienteId],
    queryFn:  () => api.get(`/clientes/${clienteId}/deuda`).then((r) => r.data),
    enabled:  open && !!clienteId
  });
  const deudaAnterior = Number(deudaQ.data?.totalDeuda ?? 0);
  const hayDeuda = deudaAnterior > 0.001;

  const total = useMemo(
    () => items.reduce((acc, i) => acc + i.precio * i.cantidad, 0),
    [items]
  );

  const validarFecha = (s: string) =>
    !s || (/^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)));

  const valid = !!clienteId && items.length > 0 && encargado.trim().length > 0 && validarFecha(fechaEntrega);

  const mutation = useMutation({
    mutationFn: (data: any) =>
      api.post('/pedidos', data).then((r) => r.data),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['pedidos'] });
      qc.invalidateQueries({ queryKey: ['reportes'] });
      qc.invalidateQueries({ queryKey: ['cliente-deuda'] });
      toast.show(`Pedido #${data.numero} creado`, 'success');
      onClose();
      // Redirección automática al detalle, que es el menú de impresión
      // (recibo cliente / copia vendedor / PDF).
      if (data?.id) navegar({ kind: 'pedido-detalle', id: data.id });
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.error || 'No se pudo crear el pedido';
      toast.show(msg, 'error');
    }
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    if (!coloresCompletos(items)) {
      setMostrarErrores(true);
      toast.show('Seleccione color base y color destino en todas las prendas', 'error');
      return;
    }
    mutation.mutate({
      clienteId,
      items:            itemsPayload(items),
      encargadoEntrega: encargado.trim(),
      incluirDeudaAnterior: hayDeuda ? incluirDeuda : undefined,
      notas:        notas.trim() || undefined,
      fechaEntrega: fechaEntrega || undefined
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="Nuevo pedido" size="lg">
      <form onSubmit={submit} className="p-6 space-y-6">
        {/* Cliente */}
        <section>
          <h3 className="font-semibold text-slate-800 mb-2">Cliente</h3>
          <div className="relative mb-2">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nombre o teléfono…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg">
            {clientesQ.isLoading ? (
              <p className="px-3 py-3 text-sm text-slate-500">Cargando clientes…</p>
            ) : clientesFiltrados.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm text-slate-400">Sin resultados</p>
            ) : clientesFiltrados.slice(0, 60).map((c: any) => (
              <button
                type="button"
                key={c.id}
                onClick={() => setClienteId(c.id)}
                className={`w-full text-left px-3 py-2 border-b border-slate-100 last:border-b-0 ${
                  clienteId === c.id ? 'bg-blue-50' : 'hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  {c.identificador && (
                    <span className="font-mono text-xs font-semibold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded shrink-0">
                      {c.identificador}
                    </span>
                  )}
                  <p className="font-medium text-sm">{c.nombre}</p>
                </div>
                <p className="text-xs text-slate-500">{c.telefono}</p>
              </button>
            ))}
          </div>
          {clienteSeleccionado && (
            <div className="mt-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm flex items-center gap-2 flex-wrap">
              {clienteSeleccionado.identificador && (
                <span className="font-mono text-xs font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                  {clienteSeleccionado.identificador}
                </span>
              )}
              <span className="text-blue-900 font-medium">{clienteSeleccionado.nombre}</span>
              <span className="text-blue-500">·</span>
              <span className="text-blue-700">{clienteSeleccionado.telefono}</span>
            </div>
          )}

          {/* Deuda anterior del cliente (punto 9) */}
          {clienteId && hayDeuda && (
            <div className="mt-2 px-3 py-3 bg-amber-50 border border-amber-300 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-amber-800">DEUDA ANTERIOR</span>
                <span className="text-lg font-black text-amber-700">{formatCurrencyCOP(deudaAnterior)}</span>
              </div>
              <p className="text-xs text-amber-700 mt-1">
                {deudaQ.data?.cantidad ?? 0} factura(s) con saldo pendiente.
              </p>
              <div className="mt-2 flex flex-col gap-1">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" name="incluirDeuda" checked={!incluirDeuda} onChange={() => setIncluirDeuda(false)} />
                  No incluir deuda anterior
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" name="incluirDeuda" checked={incluirDeuda} onChange={() => setIncluirDeuda(true)} />
                  Incluir deuda anterior en esta orden
                </label>
              </div>
              {incluirDeuda && (
                <p className="text-xs text-amber-800 mt-2 font-medium">
                  Total a pagar: {formatCurrencyCOP(total + deudaAnterior)} (prendas {formatCurrencyCOP(total)} + deuda {formatCurrencyCOP(deudaAnterior)})
                </p>
              )}
            </div>
          )}
        </section>

        {/* Prendas */}
        <section>
          <h3 className="font-semibold text-slate-800 mb-2">Prendas / servicios</h3>
          <ItemsPedidoEditor
            items={items}
            onChange={setItems}
            mostrarErrores={mostrarErrores}
            esAdmin={esAdmin}
          />
        </section>

        {/* Detalles */}
        <section className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">
              Encargado de entrega <span className="text-red-500">*</span>
            </span>
            <input
              type="text"
              value={encargado}
              onChange={(e) => setEncargado(e.target.value)}
              placeholder="Ej: Juan, María, Carlos"
              className={`mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                mostrarErrores && !encargado.trim() ? 'border-red-400' : 'border-slate-300'
              }`}
            />
            {mostrarErrores && !encargado.trim() && (
              <span className="text-xs text-red-500">Indique el encargado de entrega</span>
            )}
          </label>
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

        {/* Total */}
        <div className="flex items-center justify-between bg-slate-50 px-4 py-3 rounded-lg">
          <span className="font-medium text-slate-700">Total</span>
          <span className="text-2xl font-bold text-blue-600">{formatCurrencyCOP(total)}</span>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={mutation.isPending}
            className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!valid || mutation.isPending}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg flex items-center gap-2"
          >
            {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
            Guardar pedido
          </button>
        </div>
      </form>
    </Modal>
  );
}
