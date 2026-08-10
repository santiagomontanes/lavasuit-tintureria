import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft, ChevronRight, Download, FileText, Inbox, Plus, Printer,
  RefreshCw, Search, SlidersHorizontal, X
} from 'lucide-react';
import { printResumenOrdenes } from '../utils/printResumenOrdenes';
import dayjs from 'dayjs';
import api from '../services/api';
import { useNavStore } from '../store/nav.store';
import NuevoPedidoModal from '../components/forms/NuevoPedido.modal';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import Badge, { PEDIDO_ESTADO_LABEL, PEDIDO_ESTADO_TONE } from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import LoadingState from '../components/ui/LoadingState';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '../components/ui/Table';
import { Card, CardBody } from '../components/ui/Card';
import { inputClassName, Field, Select } from '../components/ui/Input';
import { cn } from '../lib/cn';
import { useToastStore } from '../store/toast.store';
import { guardarArchivoExcel } from '../lib/guardarArchivo';

const ESTADOS = ['', 'RECIBIDO', 'EN_PROCESO', 'LISTO', 'ENTREGADO', 'CANCELADO'] as const;

interface Filtros {
  estado?:    string;
  desde?:     string;
  hasta?:     string;
  clienteId?: string;
  usuarioId?: string;
}

/** Tamaños de página ofrecidos. El backend acepta hasta 500. */
const TAMANOS_PAGINA = [50, 100, 200, 500] as const;

/* Paginación REAL contra el servidor: se pide exactamente la página y el
 * tamaño elegidos. Antes se traían siempre 50 (o 200 con filtros) y no había
 * forma de llegar a los pedidos más viejos. La búsqueda también viaja al
 * servidor (`q`), así que busca sobre TODA la base, no sobre la página. */
const fetchPedidos = async (f: Filtros, page: number, pageSize: number, q: string) => {
  const params: Record<string, string> = {
    page:  String(page),
    limit: String(pageSize)
  };
  if (f.estado)    params.estado    = f.estado;
  if (f.desde)     params.desde     = f.desde;
  if (f.hasta)     params.hasta     = f.hasta;
  if (f.clienteId) params.clienteId = f.clienteId;
  if (f.usuarioId) params.usuarioId = f.usuarioId;
  if (q.trim())    params.q         = q.trim();
  const { data } = await api.get('/pedidos', { params });
  return data;
};

const fetchClientesLite = async () => {
  const { data } = await api.get('/clientes');
  return (data as any[]).map((c) => ({ id: c.id, nombre: c.nombre, identificador: c.identificador ?? null }));
};

const fetchEmpleadosLite = async () => {
  const { data } = await api.get('/empleados');
  return data as Array<{ id: string; nombre: string; rol: string; activo: boolean }>;
};

import { formatCurrencyCOP } from '../lib/currency';
import { sumaPagos, pendienteDePedido } from '../lib/saldos';
const moneda = formatCurrencyCOP;

export default function PedidosPage() {
  const [filtros,   setFiltros]   = useState<Filtros>({ estado: '' });
  const [busqueda,  setBusqueda]  = useState('');
  const [busquedaDeb, setBusquedaDeb] = useState('');
  const [openNuevo, setOpenNuevo] = useState(false);
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [page,      setPage]      = useState(1);
  const [pageSize,  setPageSize]  = useState<number>(50);
  const [exportando, setExportando] = useState(false);

  const qc      = useQueryClient();
  const navegar = useNavStore((s) => s.navegar);
  const toast   = useToastStore((s) => s.show);

  // La búsqueda viaja al servidor; se espera a que el usuario deje de escribir.
  useEffect(() => {
    const t = setTimeout(() => setBusquedaDeb(busqueda), 350);
    return () => clearTimeout(t);
  }, [busqueda]);

  /* Cambiar filtros, búsqueda o tamaño de página vuelve a la página 1: quedarse
   * en la página 7 de un resultado que ahora tiene 2 mostraría una tabla vacía.
   * Los filtros NO se pierden al pasar de página (viven en su propio estado). */
  useEffect(() => { setPage(1); }, [filtros, busquedaDeb, pageSize]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['pedidos', filtros, page, pageSize, busquedaDeb],
    queryFn:  () => fetchPedidos(filtros, page, pageSize, busquedaDeb),
    placeholderData: (prev) => prev   // evita el parpadeo al cambiar de página
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ['pedidos-lite-clientes'],
    queryFn:  fetchClientesLite,
    staleTime: 60_000
  });

  const { data: empleados = [] } = useQuery({
    queryKey: ['pedidos-lite-empleados'],
    queryFn:  fetchEmpleadosLite,
    staleTime: 60_000
  });

  // Estado local de date inputs para mejor UX
  const [desdeLocal, setDesdeLocal] = useState<string>('');
  const [hastaLocal, setHastaLocal] = useState<string>('');
  useEffect(() => { setDesdeLocal(filtros.desde ?? ''); }, [filtros.desde]);
  useEffect(() => { setHastaLocal(filtros.hasta ?? ''); }, [filtros.hasta]);

  const aplicarRango = () => {
    setFiltros((f) => ({ ...f, desde: desdeLocal || undefined, hasta: hastaLocal || undefined }));
  };

  const limpiarFiltros = () => {
    setFiltros({ estado: '' });
    setDesdeLocal(''); setHastaLocal('');
  };

  const aplicarPreset = (preset: 'hoy' | 'semana' | 'mes' | 'todo') => {
    const hoy = dayjs();
    let d = '', h = '';
    if (preset === 'hoy')    { d = hoy.format('YYYY-MM-DD');                h = d; }
    if (preset === 'semana') { d = hoy.startOf('week').format('YYYY-MM-DD'); h = hoy.endOf('week').format('YYYY-MM-DD'); }
    if (preset === 'mes')    { d = hoy.startOf('month').format('YYYY-MM-DD');h = hoy.endOf('month').format('YYYY-MM-DD'); }
    if (preset === 'todo')   { d = '';                                      h = ''; }
    setDesdeLocal(d); setHastaLocal(h);
    setFiltros((f) => ({ ...f, desde: d || undefined, hasta: h || undefined }));
  };

  /* El filtrado ya lo hizo el servidor (búsqueda por número, nombre o código
   * del cliente — nunca por teléfono). Aquí solo se muestra lo que llegó. */
  const pedidosFiltrados: any[] = data?.pedidos ?? [];

  const total       = Number(data?.total ?? 0);
  const totalPages  = Math.max(1, Number(data?.totalPages ?? data?.pages ?? 1));
  const hasNext     = data?.hasNext ?? page < totalPages;
  const hasPrevious = data?.hasPrevious ?? page > 1;
  const desdeFila   = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const hastaFila   = Math.min(total, (page - 1) * pageSize + pedidosFiltrados.length);

  const resumen = useMemo(() => pedidosFiltrados.reduce((acc, p) => {
    const total = Number(p.total ?? 0);
    const pagado = Number(p.totalPagado ?? p.pagado ?? sumaPagos(p));
    acc.total += total;
    acc.pagado += pagado;
    acc.pendiente += Number(p.pendiente ?? pendienteDePedido(p, pagado));
    return acc;
  }, { total: 0, pagado: 0, pendiente: 0 }), [pedidosFiltrados]);

  const filtrosActivos =
    !!filtros.desde || !!filtros.hasta || !!filtros.clienteId || !!filtros.usuarioId || !!filtros.estado;

  /* Exporta a Excel EXACTAMENTE el resultado filtrado (mismos parámetros que la
   * consulta de la tabla, sin paginar). Es solo lectura. */
  const exportarFiltrados = async () => {
    setExportando(true);
    try {
      const params: Record<string, string> = { soloPedidos: 'true' };
      if (filtros.estado)    params.estado    = filtros.estado;
      if (filtros.desde)     params.desde     = filtros.desde;
      if (filtros.hasta)     params.hasta     = filtros.hasta;
      if (filtros.clienteId) params.clienteId = filtros.clienteId;
      if (filtros.usuarioId) params.usuarioId = filtros.usuarioId;
      if (busquedaDeb.trim()) params.q        = busquedaDeb.trim();
      if (!filtros.desde && !filtros.hasta) params.todos = 'true';

      const res = await api.get('/exportacion/excel', { params, responseType: 'arraybuffer' });
      const ruta = await guardarArchivoExcel(res.data, `LavaSuit_pedidos_${dayjs().format('YYYY-MM-DD_HHmm')}.xlsx`);
      if (ruta) toast(`Archivo guardado en: ${ruta}`, 'success');
    } catch (e: any) {
      toast(e?.response?.data?.error || 'No se pudo exportar el listado', 'error');
    } finally {
      setExportando(false);
    }
  };

  const imprimirResumen = (formato: 'detallado' | 'corto') => {
    const clienteNombre = filtros.clienteId
      ? clientes.find((c) => c.id === filtros.clienteId)?.nombre
      : undefined;
    const empleadoNombre = filtros.usuarioId
      ? empleados.find((e) => e.id === filtros.usuarioId)?.nombre
      : undefined;
    const rango = filtros.desde || filtros.hasta
      ? `${filtros.desde ?? 'inicio'} → ${filtros.hasta ?? 'hoy'}`
      : 'Todos los pedidos';
    printResumenOrdenes({
      titulo:   formato === 'detallado' ? 'Resumen detallado de órdenes' : 'Resumen corto de órdenes',
      rango,
      empleado: empleadoNombre,
      cliente:  clienteNombre,
      estado:   filtros.estado || undefined,
      formato,
      pedidos:  pedidosFiltrados
    });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operacion"
        title="Pedidos"
        description="Vista central para revisar estados, saldos y avance de cada orden."
        meta={<Badge tone="info" outline>{total} pedido(s) en total</Badge>}
        actions={(
          <>
            <Button
              variant="secondary"
              leftIcon={<SlidersHorizontal size={15} />}
              onClick={() => setMostrarFiltros((v) => !v)}
            >
              {mostrarFiltros ? 'Ocultar filtros' : 'Filtros avanzados'}
            </Button>
            <Button
              variant="secondary"
              leftIcon={<Download size={15} />}
              onClick={exportarFiltrados}
              disabled={exportando || total === 0}
            >
              {exportando ? 'Exportando…' : 'Exportar Excel'}
            </Button>
            <Button
              variant="secondary"
              leftIcon={<Printer size={15} />}
              onClick={() => imprimirResumen('detallado')}
              disabled={pedidosFiltrados.length === 0}
            >
              Imprimir detalle
            </Button>
            <Button
              variant="secondary"
              leftIcon={<FileText size={15} />}
              onClick={() => imprimirResumen('corto')}
              disabled={pedidosFiltrados.length === 0}
            >
              Resumen corto
            </Button>
            <Button
              variant="secondary"
              leftIcon={<RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} />}
              onClick={() => qc.invalidateQueries({ queryKey: ['pedidos'] })}
            >
              Actualizar
            </Button>
            <Button
              leftIcon={<Plus size={16} />}
              onClick={() => setOpenNuevo(true)}
            >
              Nuevo pedido
            </Button>
          </>
        )}
      />

      <Card>
        <CardBody className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-600">
              <SlidersHorizontal size={16} className="text-slate-400" />
              Estado
            </span>
            {ESTADOS.map((estado) => {
              const active = (filtros.estado ?? '') === estado;
              return (
                <button
                  key={estado || 'TODOS'}
                  type="button"
                  onClick={() => setFiltros((f) => ({ ...f, estado }))}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors focus-ring',
                    active
                      ? 'border-slate-950 bg-slate-950 text-white'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-primary-200 hover:bg-primary-50 hover:text-primary-800'
                  )}
                >
                  {estado ? PEDIDO_ESTADO_LABEL[estado] : 'Todos'}
                </button>
              );
            })}
          </div>
          <div className="relative w-full max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre o código"
              className={cn(inputClassName, 'pl-9')}
            />
          </div>
        </CardBody>
      </Card>

      {mostrarFiltros && (
        <Card>
          <CardBody className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {(['hoy', 'semana', 'mes', 'todo'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => aplicarPreset(p)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-primary-300 hover:text-primary-700"
                >
                  {p === 'hoy' ? 'Hoy' : p === 'semana' ? 'Esta semana' : p === 'mes' ? 'Este mes' : 'Todo'}
                </button>
              ))}
              {filtrosActivos && (
                <button
                  type="button"
                  onClick={limpiarFiltros}
                  className="inline-flex items-center gap-1 rounded-lg border border-danger-200 bg-danger-50 px-3 py-1.5 text-xs font-semibold text-danger-700 hover:bg-danger-100"
                >
                  <X size={12} /> Limpiar
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <Field label="Desde">
                <input
                  type="date"
                  value={desdeLocal}
                  onChange={(e) => setDesdeLocal(e.target.value)}
                  onBlur={aplicarRango}
                  className={inputClassName}
                />
              </Field>
              <Field label="Hasta">
                <input
                  type="date"
                  value={hastaLocal}
                  onChange={(e) => setHastaLocal(e.target.value)}
                  onBlur={aplicarRango}
                  className={inputClassName}
                />
              </Field>
              <Field label="Cliente">
                <Select
                  value={filtros.clienteId ?? ''}
                  onChange={(e) => setFiltros((f) => ({ ...f, clienteId: e.target.value || undefined }))}
                >
                  <option value="">Todos</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.identificador ? `${c.identificador} · ` : ''}{c.nombre}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Empleado">
                <Select
                  value={filtros.usuarioId ?? ''}
                  onChange={(e) => setFiltros((f) => ({ ...f, usuarioId: e.target.value || undefined }))}
                >
                  <option value="">Todos</option>
                  {empleados.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nombre} ({e.rol})
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            {filtrosActivos && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {filtros.desde && <Badge tone="info" outline>Desde: {filtros.desde}</Badge>}
                {filtros.hasta && <Badge tone="info" outline>Hasta: {filtros.hasta}</Badge>}
                {filtros.clienteId && (
                  <Badge tone="primary" outline>
                    Cliente: {clientes.find((c) => c.id === filtros.clienteId)?.nombre ?? filtros.clienteId}
                  </Badge>
                )}
                {filtros.usuarioId && (
                  <Badge tone="warning" outline>
                    Empleado: {empleados.find((e) => e.id === filtros.usuarioId)?.nombre ?? filtros.usuarioId}
                  </Badge>
                )}
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {/* Los totales corresponden a los pedidos VISIBLES en esta página. */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardBody>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ordenado (página)</p>
            <p className="num mt-1 text-xl font-semibold text-slate-950">{moneda(resumen.total)}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pagado (página)</p>
            <p className="num mt-1 text-xl font-semibold text-success-700">{moneda(resumen.pagado)}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pendiente (página)</p>
            <p className="num mt-1 text-xl font-semibold text-warning-700">{moneda(resumen.pendiente)}</p>
          </CardBody>
        </Card>
      </section>

      {isLoading ? (
        <LoadingState label="Cargando pedidos..." />
      ) : pedidosFiltrados.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Inbox size={22} />}
            title="No hay pedidos para mostrar"
            description="Ajusta los filtros o registra un nuevo pedido."
            action={<Button leftIcon={<Plus size={16} />} onClick={() => setOpenNuevo(true)}>Nuevo pedido</Button>}
          />
        </Card>
      ) : (
        <TableContainer>
          <Table>
            <THead>
              <TR>
                <TH>#</TH>
                <TH>Cliente</TH>
                <TH>Empleado</TH>
                <TH>Estado</TH>
                <TH align="right">Ordenado</TH>
                <TH align="right">Pagado</TH>
                <TH align="right">Pendiente</TH>
                <TH>Fecha</TH>
              </TR>
            </THead>
            <TBody>
              {pedidosFiltrados.map((p) => {
                const total = Number(p.total ?? 0);
                const pagado = Number(p.totalPagado ?? p.pagado ?? sumaPagos(p));
                const pendiente = Number(p.pendiente ?? pendienteDePedido(p, pagado));
                return (
                  <TR
                    key={p.id}
                    onClick={() => navegar({ kind: 'pedido-detalle', id: p.id })}
                    interactive
                  >
                    <TD className="font-mono font-semibold text-slate-950">#{p.numero ?? '---'}</TD>
                    <TD>
                      {p.cliente?.identificador && (
                        <span className="font-mono text-xs font-semibold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded mr-1">{p.cliente.identificador}</span>
                      )}
                      <p className="font-semibold text-slate-900 inline">{p.cliente?.nombre ?? 'Sin cliente'}</p>
                      {p.cliente?.telefono && <p className="text-xs text-slate-500 mt-0.5">{p.cliente.telefono}</p>}
                    </TD>
                    <TD className="text-slate-700">{p.usuario?.nombre ?? '—'}</TD>
                    <TD>
                      <Badge dot tone={PEDIDO_ESTADO_TONE[p.estado] ?? 'neutral'}>
                        {PEDIDO_ESTADO_LABEL[p.estado] ?? p.estado}
                      </Badge>
                    </TD>
                    <TD align="right" className="num font-semibold text-slate-900">{moneda(total)}</TD>
                    <TD align="right" className="num font-semibold text-success-700">{moneda(pagado)}</TD>
                    <TD align="right" className={cn('num font-semibold', pendiente > 0 ? 'text-warning-700' : 'text-slate-500')}>
                      {moneda(pendiente)}
                    </TD>
                    <TD className="text-slate-500">
                      <p>{dayjs(p.createdAt).format('DD/MM/YYYY')}</p>
                      <p className="text-xs">{dayjs(p.createdAt).format('HH:mm')}</p>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </TableContainer>
      )}

      {/* Paginación: los filtros y la búsqueda se conservan al cambiar de
          página porque viven en su propio estado y viajan en cada consulta. */}
      {total > 0 && (
        <Card>
          <CardBody className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3 text-sm text-slate-600">
              <span>
                Mostrando <span className="font-semibold text-slate-900">{desdeFila}–{hastaFila}</span>{' '}
                de <span className="font-semibold text-slate-900">{total}</span> pedidos
              </span>
              <span className="text-slate-300">|</span>
              <label className="flex items-center gap-2">
                <span className="text-slate-500">Por página</span>
                <Select
                  value={String(pageSize)}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="w-24"
                >
                  {TAMANOS_PAGINA.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </Select>
              </label>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<ChevronLeft size={15} />}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={!hasPrevious || isFetching}
              >
                Anterior
              </Button>
              <span className="text-sm font-semibold text-slate-700">
                Página {page} de {totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                rightIcon={<ChevronRight size={15} />}
                onClick={() => setPage((p) => (hasNext ? p + 1 : p))}
                disabled={!hasNext || isFetching}
              >
                Siguiente
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      <NuevoPedidoModal open={openNuevo} onClose={() => setOpenNuevo(false)} />
    </div>
  );
}
