import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Minus, Trash2, Search } from 'lucide-react';
import Modal from '../ui/Modal';
import api from '../../services/api';
import { useToastStore } from '../../store/toast.store';

interface Props { open: boolean; onClose: () => void; }

interface ItemPedido {
  servicioId:     string;
  servicioNombre: string;
  nombre:         string;
  precio:         number;
  cantidad:       number;
  colorActual:    string;
  colorDeseado:   string;
  observaciones:  string;
}

export default function NuevoPedidoModal({ open, onClose }: Props) {
  const qc    = useQueryClient();
  const toast = useToastStore();

  const [clienteId,    setClienteId]    = useState<string | null>(null);
  const [items,        setItems]        = useState<ItemPedido[]>([]);
  const [notas,        setNotas]        = useState('');
  const [fechaEntrega, setFechaEntrega] = useState('');
  const [busqueda,     setBusqueda]     = useState('');

  useEffect(() => {
    if (open) {
      setClienteId(null);
      setItems([]);
      setNotas('');
      setFechaEntrega('');
      setBusqueda('');
    }
  }, [open]);

  const clientesQ = useQuery({
    queryKey: ['clientes'],
    queryFn:  () => api.get('/clientes').then((r) => r.data as any[]),
    enabled:  open
  });

  const serviciosQ = useQuery({
    queryKey: ['servicios'],
    queryFn:  () => api.get('/servicios').then((r) => r.data as any[]),
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

  const total = useMemo(
    () => items.reduce((acc, i) => acc + i.precio * i.cantidad, 0),
    [items]
  );

  const agregarServicio = (s: any) => {
    setItems((arr) => {
      const i = arr.findIndex((x) => x.servicioId === s.id);
      if (i >= 0) {
        const next = arr.slice();
        next[i] = { ...next[i], cantidad: next[i].cantidad + 1 };
        return next;
      }
      return [...arr, {
        servicioId:     s.id,
        servicioNombre: s.nombre,
        nombre:         s.nombre,
        precio:         Number(s.precio),
        cantidad:       1,
        colorActual:    '',
        colorDeseado:   '',
        observaciones:  ''
      }];
    });
  };

  const cambiarCantidad = (id: string, delta: number) => {
    setItems((arr) =>
      arr
        .map((i) => i.servicioId === id ? { ...i, cantidad: i.cantidad + delta } : i)
        .filter((i) => i.cantidad > 0)
    );
  };

  const quitarItem = (id: string) => {
    setItems((arr) => arr.filter((i) => i.servicioId !== id));
  };

  const actualizarItem = (id: string, patch: Partial<ItemPedido>) => {
    setItems((arr) => arr.map((i) => i.servicioId === id ? { ...i, ...patch } : i));
  };

  const validarFecha = (s: string) =>
    !s || (/^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)));

  const valid = !!clienteId && items.length > 0 && validarFecha(fechaEntrega);

  const mutation = useMutation({
    mutationFn: (data: any) =>
      api.post('/pedidos', data).then((r) => r.data),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['pedidos'] });
      qc.invalidateQueries({ queryKey: ['reportes'] });
      toast.show(`Pedido #${data.numero} creado`, 'success');
      onClose();
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.error || 'No se pudo crear el pedido';
      toast.show(msg, 'error');
    }
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    mutation.mutate({
      clienteId,
      items: items.map((i) => ({
        servicioId: i.servicioId,
        nombre:     i.nombre.trim() || i.servicioNombre,
        servicioNombre: i.servicioNombre,
        cantidad:   i.cantidad,
        precio:     i.precio,
        colorActual: i.colorActual.trim() || undefined,
        colorDeseado: i.colorDeseado.trim() || undefined,
        observaciones: i.observaciones.trim() || undefined
      })),
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
        </section>

        {/* Servicios */}
        <section>
          <h3 className="font-semibold text-slate-800 mb-2">Nombre de prenda/servicio</h3>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {(serviciosQ.data ?? []).map((s: any) => (
              <button
                type="button"
                key={s.id}
                onClick={() => agregarServicio(s)}
                className="border border-slate-300 hover:border-blue-500 hover:bg-blue-50 rounded-lg p-2 text-left transition-colors"
              >
                <p className="font-medium text-sm truncate">{s.nombre}</p>
                <p className="text-xs text-blue-600 font-semibold">S/ {Number(s.precio).toFixed(2)}</p>
              </button>
            ))}
          </div>

          {items.length === 0 ? (
            <p className="text-center text-sm text-slate-400 py-4 border border-dashed border-slate-300 rounded-lg">
              Pulsa un nombre para agregarlo
            </p>
          ) : (
            <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
              {items.map((i) => (
                <div key={i.servicioId} className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-3 py-3 items-start">
                  <div className="flex-1 min-w-0">
                    <input
                      value={i.nombre}
                      onChange={(e) => actualizarItem(i.servicioId, { nombre: e.target.value })}
                      placeholder="Nombre"
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-slate-500">S/ {i.precio.toFixed(2)} c/u</p>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <input
                        value={i.colorActual}
                        onChange={(e) => actualizarItem(i.servicioId, { colorActual: e.target.value })}
                        placeholder="Color actual"
                        className="border border-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <input
                        value={i.colorDeseado}
                        onChange={(e) => actualizarItem(i.servicioId, { colorDeseado: e.target.value })}
                        placeholder="Color deseado"
                        className="border border-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <textarea
                      value={i.observaciones}
                      onChange={(e) => actualizarItem(i.servicioId, { observaciones: e.target.value })}
                      placeholder="Observaciones del item"
                      rows={2}
                      className="mt-2 w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => cambiarCantidad(i.servicioId, -1)}
                      className="w-7 h-7 rounded-full border border-slate-300 hover:bg-slate-50 flex items-center justify-center"
                    >
                      <Minus size={14} />
                    </button>
                    <span className="w-7 text-center font-semibold">{i.cantidad}</span>
                    <button
                      type="button"
                      onClick={() => cambiarCantidad(i.servicioId, +1)}
                      className="w-7 h-7 rounded-full border border-slate-300 hover:bg-slate-50 flex items-center justify-center"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                  <span className="w-24 text-right font-semibold text-green-700">
                    S/ {(i.precio * i.cantidad).toFixed(2)}
                  </span>
                  <button
                    type="button"
                    onClick={() => quitarItem(i.servicioId)}
                    className="text-slate-400 hover:text-red-600"
                    aria-label="Quitar"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Detalles */}
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

        {/* Total */}
        <div className="flex items-center justify-between bg-slate-50 px-4 py-3 rounded-lg">
          <span className="font-medium text-slate-700">Total</span>
          <span className="text-2xl font-bold text-blue-600">S/ {total.toFixed(2)}</span>
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
