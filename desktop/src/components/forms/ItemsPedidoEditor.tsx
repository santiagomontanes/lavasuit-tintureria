import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Minus, Trash2, BookmarkPlus, Lock } from 'lucide-react';
import api from '../../services/api';
import { useToastStore } from '../../store/toast.store';
import { formatCurrencyCOP } from '../../lib/currency';

/* Editor de ítems de pedido reutilizable por creación y edición (admin).
 * Marca y colores usan <datalist> (elegir del catálogo o escribir manual).
 * Colores son obligatorios; la validación visual se activa con `mostrarErrores`.
 * Para edición, los ítems con garantías asociadas NO se pueden eliminar
 * (preserva la trazabilidad de Garantia.pedidoItemId). */

export interface EditorItem {
  id?:            string;        // PedidoItem id (solo en edición)
  key:            string;        // clave estable para React
  servicioId:     string;
  servicioNombre: string;
  nombre:         string;
  precio:         number;
  cantidad:       number;
  colorActual:    string;
  colorDeseado:   string;
  observaciones:  string;
  marcaId:        string | null;
  marcaNombre:    string | null;
  marcaCodigo:    string | null;
}

interface Props {
  items:            EditorItem[];
  onChange:         (items: EditorItem[]) => void;
  mostrarErrores?:  boolean;
  esAdmin?:         boolean;
  /** ids de PedidoItem con garantías: no se pueden eliminar. */
  idsConGarantia?:  Set<string>;
}

const nuevaKey = () =>
  (globalThis.crypto?.randomUUID?.() ?? `k_${Date.now()}_${Math.random().toString(16).slice(2)}`);

export function itemDesdeServicio(s: any): EditorItem {
  return {
    key:            nuevaKey(),
    servicioId:     s.id,
    servicioNombre: s.nombre,
    nombre:         s.nombre,
    precio:         Number(s.precio ?? 0),
    cantidad:       1,
    colorActual:    '',
    colorDeseado:   '',
    observaciones:  '',
    marcaId:        s.marca?.id ?? null,
    marcaNombre:    s.marca?.nombre ?? null,
    marcaCodigo:    s.marca?.codigo ?? null
  };
}

export function itemDesdePedidoItem(it: any): EditorItem {
  return {
    id:             it.id,
    key:            it.id ?? nuevaKey(),
    servicioId:     it.servicioId ?? it.servicio?.id,
    servicioNombre: it.servicio?.nombre ?? it.nombre ?? '',
    nombre:         it.nombre ?? it.servicio?.nombre ?? '',
    precio:         Number(it.precio ?? 0),
    cantidad:       Number(it.cantidad ?? 1),
    colorActual:    it.colorActual ?? '',
    colorDeseado:   it.colorDeseado ?? '',
    observaciones:  it.observaciones ?? '',
    marcaId:        it.marcaId ?? null,
    marcaNombre:    it.marcaNombre ?? null,
    marcaCodigo:    it.marcaCodigo ?? null
  };
}

export default function ItemsPedidoEditor({
  items, onChange, mostrarErrores = false, esAdmin = false, idsConGarantia
}: Props) {
  const toast = useToastStore();
  const [servicioSel, setServicioSel] = useState('');

  const serviciosQ = useQuery({
    queryKey: ['servicios'],
    queryFn:  () => api.get('/servicios').then((r) => r.data as any[])
  });
  const marcasQ = useQuery({
    queryKey: ['marcas'],
    queryFn:  () => api.get('/marcas').then((r) => r.data as any[])
  });
  const coloresQ = useQuery({
    queryKey: ['colores'],
    queryFn:  () => api.get('/colores').then((r) => r.data as any[])
  });

  const marcas  = marcasQ.data ?? [];
  const colores = coloresQ.data ?? [];

  const patch = (key: string, p: Partial<EditorItem>) =>
    onChange(items.map((i) => (i.key === key ? { ...i, ...p } : i)));

  const eliminar = (key: string) => onChange(items.filter((i) => i.key !== key));

  const cambiarCantidad = (key: string, delta: number) =>
    onChange(items
      .map((i) => (i.key === key ? { ...i, cantidad: i.cantidad + delta } : i))
      .filter((i) => i.cantidad > 0));

  const agregarServicio = (id: string) => {
    const s = (serviciosQ.data ?? []).find((x) => x.id === id);
    if (!s) return;
    onChange([...items, itemDesdeServicio(s)]);
    setServicioSel('');
  };

  // Al escribir/elegir marca: si coincide con el catálogo se enlaza; si no, manual.
  const onMarca = (key: string, texto: string) => {
    const t = texto.trim();
    if (!t) { patch(key, { marcaId: null, marcaNombre: null, marcaCodigo: null }); return; }
    const m = marcas.find((x) =>
      (x.nombre ?? '').toLowerCase() === t.toLowerCase() ||
      (x.codigo ?? '').toLowerCase() === t.toLowerCase());
    if (m) patch(key, { marcaId: m.id, marcaNombre: m.nombre, marcaCodigo: m.codigo ?? null });
    else   patch(key, { marcaId: null, marcaNombre: t, marcaCodigo: null });
  };

  const guardarMarcaCatalogo = async (key: string, nombre: string) => {
    const limpio = nombre.trim();
    if (!limpio) return;
    try {
      const { data } = await api.post('/marcas', { nombre: limpio });
      patch(key, { marcaId: data?.id ?? null, marcaNombre: data?.nombre ?? limpio, marcaCodigo: data?.codigo ?? null });
      marcasQ.refetch();
      toast.show('Marca guardada en el catálogo', 'success');
    } catch (e: any) {
      toast.show(e?.response?.data?.error || 'No se pudo guardar la marca (requiere admin)', 'error');
    }
  };

  const marcasListId  = useMemo(() => `marcas-${nuevaKey()}`, []);
  const coloresListId = useMemo(() => `colores-${nuevaKey()}`, []);

  const inputCls = (err: boolean) =>
    `w-full border rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 ${
      err ? 'border-red-400 ring-red-100 focus:ring-red-400' : 'border-slate-300 focus:ring-blue-500'
    }`;

  return (
    <div className="space-y-3">
      <datalist id={marcasListId}>
        {marcas.map((m: any) => (
          <option key={m.id} value={m.nombre}>{m.codigo ? `${m.codigo} · ${m.nombre}` : m.nombre}</option>
        ))}
      </datalist>
      <datalist id={coloresListId}>
        {colores.map((c: any) => <option key={c.id} value={c.nombre} />)}
      </datalist>

      {/* Agregar prenda */}
      <div className="flex items-center gap-2">
        <select
          value={servicioSel}
          onChange={(e) => agregarServicio(e.target.value)}
          className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">+ Agregar prenda / servicio…</option>
          {(serviciosQ.data ?? []).map((s: any) => (
            <option key={s.id} value={s.id}>{s.nombre} · {formatCurrencyCOP(s.precio)}</option>
          ))}
        </select>
      </div>

      {items.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-4 border border-dashed border-slate-300 rounded-lg">
          Agrega al menos una prenda
        </p>
      ) : (
        <div className="space-y-3">
          {items.map((i) => {
            const bloqueado = !!(i.id && idsConGarantia?.has(i.id));
            const errBase    = mostrarErrores && !i.colorActual.trim();
            const errDestino = mostrarErrores && !i.colorDeseado.trim();
            const esManual   = !!i.marcaNombre && !i.marcaId;
            return (
              <div key={i.key} className="border border-slate-200 rounded-xl p-3 space-y-2 bg-white">
                <div className="flex items-start gap-3">
                  <input
                    value={i.nombre}
                    onChange={(e) => patch(i.key, { nombre: e.target.value })}
                    placeholder="Nombre de la prenda"
                    className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex items-center gap-1 shrink-0">
                    <button type="button" onClick={() => cambiarCantidad(i.key, -1)}
                      className="w-7 h-7 rounded-full border border-slate-300 hover:bg-slate-50 flex items-center justify-center">
                      <Minus size={14} />
                    </button>
                    <span className="w-7 text-center font-semibold">{i.cantidad}</span>
                    <button type="button" onClick={() => cambiarCantidad(i.key, +1)}
                      className="w-7 h-7 rounded-full border border-slate-300 hover:bg-slate-50 flex items-center justify-center">
                      <Plus size={14} />
                    </button>
                  </div>
                  {bloqueado ? (
                    <span title="Tiene garantías asociadas — no se puede eliminar"
                      className="text-slate-300 cursor-not-allowed p-1"><Lock size={16} /></span>
                  ) : (
                    <button type="button" onClick={() => eliminar(i.key)} aria-label="Quitar"
                      className="text-slate-400 hover:text-red-600 p-1"><Trash2 size={16} /></button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {/* Marca */}
                  <div>
                    <input
                      list={marcasListId}
                      value={i.marcaNombre ?? ''}
                      onChange={(e) => onMarca(i.key, e.target.value)}
                      placeholder="Marca (catálogo o manual)"
                      className={inputCls(false)}
                    />
                    {esManual && (
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-[10px] font-bold text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded">MARCA MANUAL</span>
                        {esAdmin && (
                          <button type="button" onClick={() => guardarMarcaCatalogo(i.key, i.marcaNombre ?? '')}
                            className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline">
                            <BookmarkPlus size={12} /> Guardar en catálogo
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {/* Precio */}
                  <div>
                    <input
                      type="number" min={0} step="any"
                      value={Number.isFinite(i.precio) ? i.precio : 0}
                      onChange={(e) => patch(i.key, { precio: Math.max(0, Number(e.target.value) || 0) })}
                      placeholder="Precio unitario"
                      className={inputCls(false)}
                    />
                    <p className="text-[11px] text-slate-500 mt-0.5">Subtotal: {formatCurrencyCOP(i.precio * i.cantidad)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <input
                      list={coloresListId}
                      value={i.colorActual}
                      onChange={(e) => patch(i.key, { colorActual: e.target.value })}
                      placeholder="Color base *"
                      className={inputCls(errBase)}
                    />
                    {errBase && <p className="text-[11px] text-red-600 mt-0.5">Obligatorio</p>}
                  </div>
                  <div>
                    <input
                      list={coloresListId}
                      value={i.colorDeseado}
                      onChange={(e) => patch(i.key, { colorDeseado: e.target.value })}
                      placeholder="Color destino *"
                      className={inputCls(errDestino)}
                    />
                    {errDestino && <p className="text-[11px] text-red-600 mt-0.5">Obligatorio</p>}
                  </div>
                </div>

                <textarea
                  value={i.observaciones}
                  onChange={(e) => patch(i.key, { observaciones: e.target.value })}
                  placeholder="Observación (botón roto, mancha en manga, cierre dañado…)"
                  rows={2}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Devuelve true si todos los ítems tienen color base y destino. */
export const coloresCompletos = (items: EditorItem[]) =>
  items.every((i) => i.colorActual.trim() && i.colorDeseado.trim());

/** Construye el payload de items para POST/PATCH /pedidos. */
export const itemsPayload = (items: EditorItem[]) =>
  items.map((i) => ({
    ...(i.id ? { id: i.id } : {}),
    servicioId:     i.servicioId,
    nombre:         i.nombre.trim() || i.servicioNombre,
    servicioNombre: i.servicioNombre,
    cantidad:       i.cantidad,
    precio:         i.precio,
    colorActual:    i.colorActual.trim() || undefined,
    colorDeseado:   i.colorDeseado.trim() || undefined,
    observaciones:  i.observaciones.trim() || undefined,
    marcaId:        i.marcaId ?? undefined,
    marcaNombre:    i.marcaNombre ?? undefined,
    marcaCodigo:    i.marcaCodigo ?? undefined
  }));
