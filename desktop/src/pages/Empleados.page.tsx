import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  ArrowLeft, Banknote, CreditCard, PackageCheck, Pencil, Plus, RefreshCw,
  ShieldAlert, ShoppingBag, UserRound, Users, UserCog, CheckCircle2
} from 'lucide-react';
import api from '../services/api';
import { useNavStore } from '../store/nav.store';
import PageHeader from '../components/ui/PageHeader';
import StatCard from '../components/ui/StatCard';
import Badge, { PEDIDO_ESTADO_LABEL, PEDIDO_ESTADO_TONE } from '../components/ui/Badge';
import Button from '../components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '../components/ui/Card';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '../components/ui/Table';
import EmptyState from '../components/ui/EmptyState';
import LoadingState from '../components/ui/LoadingState';
import { SkeletonStatCard } from '../components/ui/Skeleton';
import { cn } from '../lib/cn';
import { inputClassName } from '../components/ui/Input';
import EmpleadoFormModal from '../components/forms/EmpleadoForm.modal';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface EmpleadoResumen {
  id:                 string;
  nombre:             string;
  email:              string;
  rol:                string;
  activo:             boolean;
  createdAt:          string;
  totalOrdenes:       number;
  totalClientes:      number;
  totalPagos:         number;
  totalVentas:        number;
  totalGarantias:     number;
  totalCambiosEstado: number;
}

interface Metricas {
  ordenes:              number;
  ventasReales:         number;
  pagosRegistrados:     number;
  clientesCreados:      number;
  garantiasRegistradas: number;
  cambiosEstado:        number;
  pedidosEntregados:    number;
  pedidosCancelados:    number;
  promedioPorPedido:    number;
  totalPendiente:       number;
}

interface Evento {
  tipo:          string;
  fecha:         string;
  descripcion:   string;
  pedidoId:      string | null;
  pedidoNumero:  number | null;
  clienteNombre: string | null;
  monto:         number | null;
  extra:         Record<string, any> | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const moneda = (v: number) =>
  `S/ ${Number(v ?? 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type Preset = 'hoy' | 'semana' | 'mes' | 'total';

const calcRango = (p: Preset): { desde: string; hasta: string } => {
  const hoy = dayjs();
  const fmt  = (d: dayjs.Dayjs) => d.format('YYYY-MM-DD');
  switch (p) {
    case 'hoy':   return { desde: fmt(hoy),                   hasta: fmt(hoy) };
    case 'semana':return { desde: fmt(hoy.startOf('week')),   hasta: fmt(hoy.endOf('week')) };
    case 'mes':   return { desde: fmt(hoy.startOf('month')),  hasta: fmt(hoy.endOf('month')) };
    case 'total': return { desde: '2020-01-01',               hasta: fmt(hoy) };
  }
};

const ROL_TONE: Record<string, 'info' | 'warning' | 'neutral' | 'primary'> = {
  ADMIN:      'info',
  CAJERO:     'warning',
  EMPLEADO:   'neutral',
  RECOLECTOR: 'primary'
};

interface PedidoEmp {
  id:           string;
  numero:       number | null;
  estado:       string;
  createdAt:    string;
  fechaEntrega: string | null;
  cliente:      { id: string; nombre: string; telefono: string | null; identificador: string | null } | null;
  total:        number;
  totalPagado:  number;
  pendiente:    number;
}

// ─── Configuración de tipos de actividad ─────────────────────────────────────

const TIPO_CFG: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
  PEDIDO_CREADO:      { label: 'Pedido creado',        icon: <ShoppingBag  size={13} />, cls: 'bg-info-50    text-info-700    ring-info-100'    },
  PAGO_REGISTRADO:    { label: 'Pago registrado',      icon: <CreditCard   size={13} />, cls: 'bg-success-50 text-success-700 ring-success-100' },
  CLIENTE_CREADO:     { label: 'Cliente creado',       icon: <UserRound    size={13} />, cls: 'bg-primary-50 text-primary-700 ring-primary-100' },
  GARANTIA_REGISTRADA:{ label: 'Garantía registrada',  icon: <ShieldAlert  size={13} />, cls: 'bg-danger-50  text-danger-700  ring-danger-100'  },
  ESTADO_CAMBIADO:    { label: 'Estado cambiado',      icon: <RefreshCw    size={13} />, cls: 'bg-warning-50 text-warning-700 ring-warning-100' },
  CAJA_APERTURA:      { label: 'Caja abierta',         icon: <Banknote     size={13} />, cls: 'bg-cyan-50    text-cyan-700    ring-cyan-100'    },
  CAJA_CIERRE:        { label: 'Caja cerrada',         icon: <Banknote     size={13} />, cls: 'bg-slate-100  text-slate-600   ring-slate-200'   },
  PEDIDO_ENTREGADO:   { label: 'Pedido entregado',     icon: <PackageCheck size={13} />, cls: 'bg-success-50 text-success-700 ring-success-100' },
};

// ─── Subcomponente: item de timeline ─────────────────────────────────────────

function EventoItem({ ev, onPedido }: { ev: Evento; onPedido?: (id: string) => void }) {
  const cfg  = TIPO_CFG[ev.tipo] ?? { label: ev.tipo, icon: <RefreshCw size={13} />, cls: 'bg-slate-100 text-slate-600 ring-slate-200' };
  const hora = dayjs(ev.fecha).format('DD/MM HH:mm');

  return (
    <div className="flex gap-3 py-3 border-b border-slate-100 last:border-0">
      <div className={cn('shrink-0 mt-0.5 h-7 w-7 rounded-lg ring-1 flex items-center justify-center', cfg.cls)}>
        {cfg.icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">{cfg.label}</span>
          <span className="text-xs text-slate-400">{hora}</span>
        </div>
        <p className="mt-0.5 text-sm font-medium text-slate-800">{ev.descripcion}</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {ev.pedidoNumero != null && (
            <button
              onClick={() => ev.pedidoId && onPedido?.(ev.pedidoId)}
              className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors',
                !onPedido && 'cursor-default hover:bg-slate-100'
              )}
            >
              Pedido #{ev.pedidoNumero}
            </button>
          )}
          {ev.clienteNombre && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-primary-50 text-primary-700">
              {ev.clienteNombre}
            </span>
          )}
          {ev.monto != null && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-success-50 text-success-700 font-mono">
              {moneda(ev.monto)}
            </span>
          )}
          {ev.extra?.estadoAnterior != null && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-warning-50 text-warning-700">
              {ev.extra.estadoAnterior} → {ev.extra.estadoNuevo}
            </span>
          )}
          {ev.extra?.metodo && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-600">
              {ev.extra.metodo}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Subcomponente: filtro de fechas ──────────────────────────────────────────

function FiltroFechas({
  preset, desde, hasta, onPreset, onDesde, onHasta
}: {
  preset:   Preset;
  desde:    string;
  hasta:    string;
  onPreset: (p: Preset) => void;
  onDesde:  (v: string) => void;
  onHasta:  (v: string) => void;
}) {
  const presets: { id: Preset; label: string }[] = [
    { id: 'hoy',    label: 'Hoy'      },
    { id: 'semana', label: 'Semana'   },
    { id: 'mes',    label: 'Mes'      },
    { id: 'total',  label: 'Todo'     },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {presets.map((p) => (
        <button
          key={p.id}
          onClick={() => onPreset(p.id)}
          className={cn(
            'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors',
            preset === p.id
              ? 'bg-primary-600 text-white border-primary-600'
              : 'bg-white text-slate-600 border-slate-200 hover:border-primary-300 hover:text-primary-700'
          )}
        >
          {p.label}
        </button>
      ))}
      <input
        type="date"
        value={desde}
        onChange={(e) => { onDesde(e.target.value); onPreset('total'); }}
        className={cn(inputClassName, 'w-36 text-xs py-1.5')}
      />
      <span className="text-slate-400 text-xs">—</span>
      <input
        type="date"
        value={hasta}
        onChange={(e) => { onHasta(e.target.value); onPreset('total'); }}
        className={cn(inputClassName, 'w-36 text-xs py-1.5')}
      />
    </div>
  );
}

// ─── Vista: detalle del empleado ─────────────────────────────────────────────

function EmpleadoDetalle({
  empleado, onBack, onEditar
}: {
  empleado: EmpleadoResumen;
  onBack:   () => void;
  onEditar: (emp: EmpleadoResumen) => void;
}) {
  const navegar = useNavStore((s) => s.navegar);
  const [preset, setPreset] = useState<Preset>('mes');
  const [desde,  setDesde]  = useState(() => calcRango('mes').desde);
  const [hasta,  setHasta]  = useState(() => calcRango('mes').hasta);

  const handlePreset = (p: Preset) => {
    setPreset(p);
    const r = calcRango(p);
    setDesde(r.desde);
    setHasta(r.hasta);
  };

  const { data: rendData, isLoading: loadRend } = useQuery({
    queryKey: ['empleado-rendimiento', empleado.id, desde, hasta],
    queryFn:  () =>
      api.get(`/empleados/${empleado.id}/rendimiento`, { params: { desde, hasta } }).then((r) => r.data)
  });

  const { data: actData, isLoading: loadAct } = useQuery({
    queryKey: ['empleado-actividad', empleado.id, desde, hasta],
    queryFn:  () =>
      api.get(`/empleados/${empleado.id}/actividad`, { params: { desde, hasta, limit: 100 } }).then((r) => r.data)
  });

  const { data: pedData, isLoading: loadPed } = useQuery({
    queryKey: ['empleado-pedidos', empleado.id, desde, hasta],
    queryFn:  () =>
      api.get(`/empleados/${empleado.id}/pedidos`, { params: { desde, hasta, limit: 100 } }).then((r) => r.data)
  });

  const m: Metricas = rendData?.metricas ?? {
    ordenes: 0, ventasReales: 0, pagosRegistrados: 0, clientesCreados: 0,
    garantiasRegistradas: 0, cambiosEstado: 0, pedidosEntregados: 0,
    pedidosCancelados: 0, promedioPorPedido: 0, totalPendiente: 0
  };
  const actividad: Evento[] = actData?.actividad ?? [];
  const pedidos: PedidoEmp[] = pedData?.pedidos ?? [];

  return (
    <div className="space-y-5">
      {/* Cabecera */}
      <div>
        <button
          onClick={onBack}
          className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900 focus-ring rounded-lg"
        >
          <ArrowLeft size={15} /> Volver a empleados
        </button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-primary-400 to-cyan-300 text-slate-950 font-black text-xl flex items-center justify-center shadow-sm">
              {empleado.nombre.split(' ').slice(0, 2).map((s) => s[0]?.toUpperCase()).join('')}
            </div>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950">{empleado.nombre}</h2>
              <div className="flex items-center gap-2 mt-1">
                <Badge tone={ROL_TONE[empleado.rol] ?? 'neutral'}>{empleado.rol}</Badge>
                <Badge tone={empleado.activo ? 'success' : 'danger'} dot>
                  {empleado.activo ? 'Activo' : 'Inactivo'}
                </Badge>
                <span className="text-xs text-slate-400">{empleado.email}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Pencil size={14} />}
              onClick={() => onEditar(empleado)}
            >
              Editar
            </Button>
            <FiltroFechas
              preset={preset} desde={desde} hasta={hasta}
              onPreset={handlePreset} onDesde={setDesde} onHasta={setHasta}
            />
          </div>
        </div>
      </div>

      {/* KPIs */}
      <section className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
        {loadRend
          ? Array.from({ length: 5 }).map((_, i) => <SkeletonStatCard key={i} />)
          : (
            <>
              <StatCard tone="primary" label="Órdenes creadas"     value={m.ordenes}              icon={<ShoppingBag size={17} />} />
              <StatCard tone="success" label="Ventas reales"        value={moneda(m.ventasReales)} icon={<CreditCard  size={17} />} />
              <StatCard tone="info"    label="Pagos registrados"    value={m.pagosRegistrados}     icon={<CreditCard  size={17} />} />
              <StatCard tone="primary" label="Clientes creados"     value={m.clientesCreados}      icon={<UserRound   size={17} />} />
              <StatCard tone="danger"  label="Garantías"            value={m.garantiasRegistradas} icon={<ShieldAlert size={17} />} />
            </>
          )
        }
      </section>

      <section className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
        {loadRend
          ? Array.from({ length: 5 }).map((_, i) => <SkeletonStatCard key={i} />)
          : (
            <>
              <StatCard tone="success"  label="Entregados"          value={m.pedidosEntregados}         icon={<PackageCheck size={17} />} />
              <StatCard tone="danger"   label="Cancelados"          value={m.pedidosCancelados}          icon={<ShoppingBag size={17} />} />
              <StatCard tone="neutral"  label="Cambios de estado"   value={m.cambiosEstado}              icon={<RefreshCw   size={17} />} />
              <StatCard tone="warning"  label="Promedio / pedido"   value={moneda(m.promedioPorPedido)}  icon={<CreditCard  size={17} />} />
              <StatCard tone="warning"  label="Pendiente total"     value={moneda(m.totalPendiente)}     icon={<Banknote    size={17} />} />
            </>
          )
        }
      </section>

      {/* Órdenes creadas por el empleado en el rango */}
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingBag size={15} /> Órdenes creadas
          </CardTitle>
          <span className="text-xs text-slate-400">
            {pedData?.total ?? 0} pedidos en el período
          </span>
        </CardHeader>
        {loadPed ? (
          <div className="px-5 py-8 flex justify-center">
            <div className="animate-spin h-6 w-6 rounded-full border-2 border-primary-400 border-t-transparent" />
          </div>
        ) : pedidos.length === 0 ? (
          <EmptyState
            compact
            icon={<ShoppingBag size={20} />}
            title="Sin órdenes en este período"
            description="Cambia el rango de fechas para ver más órdenes."
          />
        ) : (
          <TableContainer className="border-0 shadow-none rounded-none">
            <Table>
              <THead>
                <TR>
                  <TH>#</TH>
                  <TH>Cliente</TH>
                  <TH>Estado</TH>
                  <TH align="right">Ordenado</TH>
                  <TH align="right">Pagado</TH>
                  <TH align="right">Pendiente</TH>
                  <TH>Fecha</TH>
                  <TH>Acciones</TH>
                </TR>
              </THead>
              <TBody>
                {pedidos.map((p) => (
                  <TR
                    key={p.id}
                    interactive
                    onClick={() => navegar({ kind: 'pedido-detalle', id: p.id })}
                  >
                    <TD className="font-mono font-semibold text-slate-950">#{p.numero ?? '---'}</TD>
                    <TD>
                      {p.cliente?.identificador && (
                        <span className="font-mono text-xs font-semibold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded mr-1">
                          {p.cliente.identificador}
                        </span>
                      )}
                      <p className="font-semibold text-slate-900 inline">{p.cliente?.nombre ?? 'Sin cliente'}</p>
                      {p.cliente?.telefono && (
                        <p className="text-xs text-slate-500 mt-0.5">{p.cliente.telefono}</p>
                      )}
                    </TD>
                    <TD>
                      <Badge dot tone={PEDIDO_ESTADO_TONE[p.estado] ?? 'neutral'}>
                        {PEDIDO_ESTADO_LABEL[p.estado] ?? p.estado}
                      </Badge>
                    </TD>
                    <TD align="right" className="num font-semibold text-slate-900">{moneda(p.total)}</TD>
                    <TD align="right" className="num font-semibold text-success-700">{moneda(p.totalPagado)}</TD>
                    <TD align="right" className={cn('num font-semibold', p.pendiente > 0 ? 'text-warning-700' : 'text-slate-500')}>
                      {moneda(p.pendiente)}
                    </TD>
                    <TD className="text-slate-500">
                      <p>{dayjs(p.createdAt).format('DD/MM/YYYY')}</p>
                      <p className="text-xs">{dayjs(p.createdAt).format('HH:mm')}</p>
                    </TD>
                    <TD>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => { e.stopPropagation(); navegar({ kind: 'pedido-detalle', id: p.id }); }}
                      >
                        Ver detalle
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableContainer>
        )}
      </Card>

      {/* Contenido: Timeline + Resumen lateral */}
      <section className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Timeline */}
        <Card className="xl:col-span-2 overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw size={15} /> Línea de tiempo
            </CardTitle>
            <span className="text-xs text-slate-400">
              {actData?.total ?? 0} acciones
            </span>
          </CardHeader>
          {loadAct ? (
            <div className="px-5 py-8 flex justify-center">
              <div className="animate-spin h-6 w-6 rounded-full border-2 border-primary-400 border-t-transparent" />
            </div>
          ) : actividad.length === 0 ? (
            <EmptyState
              compact
              icon={<RefreshCw size={20} />}
              title="Sin actividad en este período"
              description="Cambia el rango de fechas para ver más acciones."
            />
          ) : (
            <div className="px-5 pb-4 max-h-[600px] overflow-y-auto">
              {actividad.map((ev, i) => (
                <EventoItem
                  key={`${ev.tipo}-${ev.fecha}-${i}`}
                  ev={ev}
                  onPedido={(id) => navegar({ kind: 'pedido-detalle', id })}
                />
              ))}
            </div>
          )}
        </Card>

        {/* Resumen lateral */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Distribución de acciones</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3">
              {loadAct ? (
                <div className="text-sm text-slate-400">Cargando...</div>
              ) : (() => {
                const conteo: Record<string, number> = {};
                for (const ev of actividad) conteo[ev.tipo] = (conteo[ev.tipo] ?? 0) + 1;
                const total = actividad.length || 1;
                return Object.entries(TIPO_CFG).map(([tipo, cfg]) => {
                  const n   = conteo[tipo] ?? 0;
                  const pct = Math.round((n / total) * 100);
                  if (n === 0) return null;
                  return (
                    <div key={tipo}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-medium ring-1', cfg.cls)}>
                          {cfg.icon} {cfg.label}
                        </span>
                        <span className="font-mono font-semibold text-slate-700">{n}</span>
                      </div>
                      <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-primary-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                }).filter(Boolean);
              })()}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Información</CardTitle>
            </CardHeader>
            <CardBody className="space-y-2 text-sm text-slate-600">
              <div className="flex justify-between gap-3">
                <span>Miembro desde</span>
                <span className="font-medium text-slate-900">
                  {dayjs(empleado.createdAt).format('DD/MM/YYYY')}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span>Email</span>
                <span className="font-medium text-slate-900 truncate">{empleado.email}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>Rol</span>
                <Badge tone={ROL_TONE[empleado.rol] ?? 'neutral'}>{empleado.rol}</Badge>
              </div>
              <div className="flex justify-between gap-3">
                <span>Estado</span>
                <Badge tone={empleado.activo ? 'success' : 'danger'} dot>
                  {empleado.activo ? 'Activo' : 'Inactivo'}
                </Badge>
              </div>
            </CardBody>
          </Card>
        </div>
      </section>
    </div>
  );
}

// ─── Vista: lista de empleados ────────────────────────────────────────────────

function EmpleadoLista({
  onSelect, onNuevo, onEditar
}: {
  onSelect: (e: EmpleadoResumen) => void;
  onNuevo:  () => void;
  onEditar: (e: EmpleadoResumen) => void;
}) {
  const [busqueda, setBusqueda] = useState('');

  const { data: empleados = [], isLoading } = useQuery<EmpleadoResumen[]>({
    queryKey: ['empleados', 'resumen'],
    queryFn:  () => api.get('/empleados/resumen').then((r) => r.data),
    staleTime: 30_000
  });

  const filtrados = useMemo(() => {
    if (!busqueda.trim()) return empleados;
    const q = busqueda.toLowerCase();
    return empleados.filter(
      (e) => e.nombre.toLowerCase().includes(q) || e.email.toLowerCase().includes(q) || e.rol.toLowerCase().includes(q)
    );
  }, [empleados, busqueda]);

  const totalActivos  = empleados.filter((e) => e.activo).length;
  const totalVentas   = empleados.reduce((acc, e) => acc + e.totalVentas, 0);
  const totalOrdenes  = empleados.reduce((acc, e) => acc + e.totalOrdenes, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Administración"
        title="Empleados"
        description="Rendimiento y actividad de cada miembro del equipo."
        meta={<Badge tone="info" outline>{empleados.length} empleados</Badge>}
        actions={<Button leftIcon={<Plus size={16} />} onClick={onNuevo}>Nuevo empleado</Button>}
      />

      {/* KPIs globales */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <SkeletonStatCard key={i} />)
          : (
            <>
              <StatCard tone="primary" label="Total empleados"  value={empleados.length} icon={<Users      size={17} />} />
              <StatCard tone="success" label="Empleados activos" value={totalActivos}     icon={<CheckCircle2 size={17} />} />
              <StatCard tone="info"    label="Órdenes totales"   value={totalOrdenes}     icon={<ShoppingBag  size={17} />} />
              <StatCard tone="success" label="Ventas totales"    value={moneda(totalVentas)} icon={<CreditCard size={17} />} />
            </>
          )
        }
      </section>

      {/* Buscador */}
      <Card className="px-4 py-3">
        <input
          type="text"
          placeholder="Buscar por nombre, email o rol..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className={inputClassName}
        />
      </Card>

      {/* Tabla */}
      {isLoading ? (
        <LoadingState label="Cargando empleados..." />
      ) : filtrados.length === 0 ? (
        <Card>
          <EmptyState
            icon={<UserCog size={22} />}
            title="Sin empleados"
            description="No se encontraron empleados que coincidan con la búsqueda."
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <TableContainer className="border-0 shadow-none rounded-none">
            <Table>
              <THead>
                <TR>
                  <TH>Empleado</TH>
                  <TH>Rol</TH>
                  <TH>Estado</TH>
                  <TH align="right">Órdenes</TH>
                  <TH align="right">Clientes</TH>
                  <TH align="right">Pagos</TH>
                  <TH align="right">Ventas reales</TH>
                  <TH align="right">Garantías</TH>
                  <TH align="right">Cambios estado</TH>
                  <TH>Acciones</TH>
                </TR>
              </THead>
              <TBody>
                {filtrados.map((emp) => (
                  <TR
                    key={emp.id}
                    interactive
                    onClick={() => onSelect(emp)}
                  >
                    <TD>
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-primary-400 to-cyan-300 text-slate-950 text-xs font-bold flex items-center justify-center shrink-0">
                          {emp.nombre.split(' ').slice(0, 2).map((s) => s[0]?.toUpperCase()).join('')}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">{emp.nombre}</p>
                          <p className="text-xs text-slate-400">{emp.email}</p>
                        </div>
                      </div>
                    </TD>
                    <TD>
                      <Badge tone={ROL_TONE[emp.rol] ?? 'neutral'}>{emp.rol}</Badge>
                    </TD>
                    <TD>
                      <Badge tone={emp.activo ? 'success' : 'danger'} dot>
                        {emp.activo ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </TD>
                    <TD align="right" className="num font-semibold text-slate-900">{emp.totalOrdenes}</TD>
                    <TD align="right" className="num">{emp.totalClientes}</TD>
                    <TD align="right" className="num">{emp.totalPagos}</TD>
                    <TD align="right" className="num font-semibold text-success-700">{moneda(emp.totalVentas)}</TD>
                    <TD align="right" className="num">{emp.totalGarantias}</TD>
                    <TD align="right" className="num text-slate-500">{emp.totalCambiosEstado}</TD>
                    <TD>
                      <Button
                        size="sm"
                        variant="ghost"
                        leftIcon={<Pencil size={14} />}
                        onClick={(e) => { e.stopPropagation(); onEditar(emp); }}
                      >
                        Editar
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableContainer>
        </Card>
      )}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function EmpleadosPage() {
  const [selected,  setSelected]  = useState<EmpleadoResumen | null>(null);
  const [openForm,  setOpenForm]  = useState(false);
  const [editando,  setEditando]  = useState<EmpleadoResumen | null>(null);

  const abrirNuevo  = () => { setEditando(null);  setOpenForm(true); };
  const abrirEditar = (emp: EmpleadoResumen) => { setEditando(emp); setOpenForm(true); };
  const cerrarForm  = () => { setOpenForm(false); setEditando(null); };

  return (
    <>
      {selected
        ? <EmpleadoDetalle empleado={selected} onBack={() => setSelected(null)} onEditar={abrirEditar} />
        : <EmpleadoLista  onSelect={setSelected} onNuevo={abrirNuevo} onEditar={abrirEditar} />}

      <EmpleadoFormModal
        open={openForm}
        onClose={cerrarForm}
        empleado={editando}
      />
    </>
  );
}
