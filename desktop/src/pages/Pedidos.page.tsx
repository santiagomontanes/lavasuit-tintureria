import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Inbox, Plus, Printer, RefreshCw, Search, SlidersHorizontal, X } from 'lucide-react';
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

const ESTADOS = ['', 'RECIBIDO', 'EN_PROCESO', 'LISTO', 'ENTREGADO', 'CANCELADO'] as const;

interface Filtros {
  estado?:    string;
  desde?:     string;
  hasta?:     string;
  clienteId?: string;
  usuarioId?: string;
}

const fetchPedidos = async (f: Filtros) => {
  const params: Record<string, string> = {};
  if (f.estado)    params.estado    = f.estado;
  if (f.desde)     params.desde     = f.desde;
  if (f.hasta)     params.hasta     = f.hasta;
  if (f.clienteId) params.clienteId = f.clienteId;
  if (f.usuarioId) params.usuarioId = f.usuarioId;
  // Pedimos un límite alto cuando hay filtros explícitos para no recortar
  // resultados; si no hay filtros, mantenemos paginación corta (últimos).
  params.limit = String(f.desde || f.hasta || f.clienteId || f.usuarioId ? 200 : 50);
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

const moneda = (v: number) =>
  `S/ ${Number(v ?? 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PedidosPage() {
  const [filtros,   setFiltros]   = useState<Filtros>({ estado: '' });
  const [busqueda,  setBusqueda]  = useState('');
  const [openNuevo, setOpenNuevo] = useState(false);
  const [mostrarFiltros, setMostrarFiltros] = useState(false);

  const qc      = useQueryClient();
  const navegar = useNavStore((s) => s.navegar);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['pedidos', filtros],
    queryFn:  () => fetchPedidos(filtros)
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

  const pedidos: any[] = data?.pedidos ?? [];
  const pedidosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return pedidos;
    return pedidos.filter((p) =>
      String(p.numero ?? '').includes(q) ||
      (p.cliente?.nombre ?? '').toLowerCase().includes(q) ||
      (p.cliente?.telefono ?? '').toLowerCase().includes(q)
    );
  }, [pedidos, busqueda]);

  const resumen = useMemo(() => pedidosFiltrados.reduce((acc, p) => {
    const total = Number(p.total ?? 0);
    const pagado = Number(p.totalPagado ?? p.pagado ?? 0);
    acc.total += total;
    acc.pagado += pagado;
    acc.pendiente += Math.max(0, Number(p.pendiente ?? total - pagado));
    return acc;
  }, { total: 0, pagado: 0, pendiente: 0 }), [pedidosFiltrados]);

  const filtrosActivos =
    !!filtros.desde || !!filtros.hasta || !!filtros.clienteId || !!filtros.usuarioId || !!filtros.estado;

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
        meta={<Badge tone="info" outline>{pedidosFiltrados.length} registros</Badge>}
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
              placeholder="Buscar por numero, cliente o telefono"
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

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardBody>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ordenado</p>
            <p className="num mt-1 text-xl font-semibold text-slate-950">{moneda(resumen.total)}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pagado</p>
            <p className="num mt-1 text-xl font-semibold text-success-700">{moneda(resumen.pagado)}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pendiente</p>
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
                const pagado = Number(p.totalPagado ?? p.pagado ?? 0);
                const pendiente = Math.max(0, Number(p.pendiente ?? total - pagado));
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

      <NuevoPedidoModal open={openNuevo} onClose={() => setOpenNuevo(false)} />
    </div>
  );
}
