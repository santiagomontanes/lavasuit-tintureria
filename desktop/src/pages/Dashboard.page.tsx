import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  ShoppingBag, DollarSign, Hourglass, Users, ArrowUpRight, Inbox, ShieldAlert
} from 'lucide-react';
import api from '../services/api';
import { useNavStore } from '../store/nav.store';
import { useAuthStore } from '../store/auth.store';
import StatCard from '../components/ui/StatCard';
import Badge, { PEDIDO_ESTADO_TONE, PEDIDO_ESTADO_LABEL } from '../components/ui/Badge';
import { Card, CardHeader, CardTitle, CardBody } from '../components/ui/Card';
import { Table, TableContainer, THead, TH, TBody, TR, TD } from '../components/ui/Table';
import { SkeletonStatCard, SkeletonRow, Skeleton } from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import Button from '../components/ui/Button';
import { cn } from '../lib/cn';
import PageHeader from '../components/ui/PageHeader';
import { Select } from '../components/ui/Input';

const fetchVentasDia = (usuarioId?: string) =>
  api.get('/reportes/ventas-dia', { params: usuarioId ? { usuarioId } : {} }).then((r) => r.data);
const fetchVentasMes = (usuarioId?: string) =>
  api.get('/reportes/ventas-mes', { params: usuarioId ? { usuarioId } : {} }).then((r) => r.data);
const fetchEstados   = () => api.get('/reportes/estados').then((r) => r.data);
const fetchClientes  = () => api.get('/clientes').then((r) => r.data);
const fetchSesion    = () => api.post('/sesiones-trabajo/abrir').then((r) => r.data);
const fetchEmpleados = () => api.get('/reportes/por-empleado').then((r) => r.data);

const moneda = (v: number) =>
  `S/ ${Number(v ?? 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const ESTADOS_ORDER = ['RECIBIDO', 'EN_PROCESO', 'LISTO', 'ENTREGADO', 'CANCELADO'] as const;

export default function DashboardPage() {
  const navegar = useNavStore((s) => s.navegar);
  const usuario = useAuthStore((s) => s.usuario);
  const [empleadoFiltro, setEmpleadoFiltro] = useState('');

  const dia       = useQuery({
    queryKey: ['reportes', 'ventas-dia', empleadoFiltro],
    queryFn: () => fetchVentasDia(empleadoFiltro || undefined)
  });
  const mes       = useQuery({
    queryKey: ['reportes', 'ventas-mes', empleadoFiltro],
    queryFn: () => fetchVentasMes(empleadoFiltro || undefined)
  });
  const estados   = useQuery({ queryKey: ['reportes', 'estados'],    queryFn: fetchEstados   });
  const clientes  = useQuery({ queryKey: ['clientes'],               queryFn: fetchClientes  });
  const sesion    = useQuery({ queryKey: ['sesion-trabajo', 'actual'], queryFn: fetchSesion });
  const empleados = useQuery({ queryKey: ['reportes', 'por-empleado'], queryFn: fetchEmpleados });

  const ventasDia    = Number(dia.data?.totalPagado ?? dia.data?.total ?? 0);
  const cantidadDia  = Number(dia.data?.cantidad ?? 0);
  const valorOrdenadoDia = Number(dia.data?.valorOrdenado ?? 0);
  const pendienteDia = Number(dia.data?.totalPendiente ?? 0);
  const ventasMes    = Number(mes.data?.totalPagado ?? mes.data?.total ?? 0);
  const cantidadMes  = Number(mes.data?.cantidad ?? 0);

  const conteoEstados = useMemo(() => {
    const out: Record<string, number> = {
      RECIBIDO: 0, EN_PROCESO: 0, LISTO: 0, ENTREGADO: 0, CANCELADO: 0
    };
    for (const r of estados.data ?? []) {
      const k = r?.estado;
      const n = r?._count?.estado ?? r?._count ?? 0;
      if (k in out) out[k] = Number(n) || 0;
    }
    return out;
  }, [estados.data]);

  const pendientes = conteoEstados.RECIBIDO + conteoEstados.EN_PROCESO;
  const ultimosPedidos: any[] = (dia.data?.pedidos ?? []).slice(0, 6);

  const loading =
    dia.isLoading || mes.isLoading || estados.isLoading || clientes.isLoading;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Panel ejecutivo"
        title="Resumen operativo"
        description="Indicadores comerciales, estados de trabajo y rendimiento del equipo en tiempo real."
        actions={(
          <Select
            value={empleadoFiltro}
            onChange={(e) => setEmpleadoFiltro(e.target.value)}
            className="w-64"
          >
            <option value="">Todos los empleados</option>
            {(empleados.data?.empleados ?? []).map((r: any) => (
              <option key={r.usuario.id} value={r.usuario.id}>{r.usuario.nombre}</option>
            ))}
          </Select>
        )}
      />
      {/* KPIs */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <SkeletonStatCard key={i} />)
          : (
            <>
              <StatCard
                tone="primary"
                label="Pedidos hoy"
                value={cantidadDia}
                hint={`Ordenado hoy: ${moneda(valorOrdenadoDia)} | Mes: ${cantidadMes} pedidos`}
                icon={<ShoppingBag size={18} />}
              />
              <StatCard
                tone="success"
                label="Ventas hoy"
                value={moneda(ventasDia)}
                hint={`Mes: ${moneda(ventasMes)}`}
                icon={<DollarSign size={18} />}
              />
              <StatCard
                tone="warning"
                label="Pendiente por cobrar"
                value={moneda(pendienteDia)}
                hint={`${dia.data?.pedidosPendientesPago?.length ?? 0} pedidos con saldo | Operativos: ${pendientes}`}
                icon={<Hourglass size={18} />}
              />
              <StatCard
                tone="info"
                label="Clientes"
                value={(clientes.data ?? []).length}
                hint="Base total de clientes"
                icon={<Users size={18} />}
              />
              <StatCard
                tone="danger"
                label="Garantias abiertas"
                value={Number(dia.data?.garantiasAbiertas ?? 0)}
                hint={`${Number(dia.data?.garantiasResueltas ?? 0)} resueltas hoy`}
                icon={<ShieldAlert size={18} />}
              />
            </>
          )
        }
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Pedidos recientes */}
        <Card className="xl:col-span-2 overflow-hidden">
          <CardHeader>
            <CardTitle>Pedidos de hoy</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              rightIcon={<ArrowUpRight size={14} />}
              onClick={() => navegar({ kind: 'pedidos' })}
            >
              Ver todos
            </Button>
          </CardHeader>
          {loading ? (
            <TableContainer className="border-0 shadow-none rounded-none">
              <Table>
                <THead>
                  <TR>
                    <TH>#</TH><TH>Cliente</TH><TH>Estado</TH>
                    <TH align="right">Ordenado</TH><TH align="right">Pagado</TH><TH align="right">Pendiente</TH><TH>Hora</TH>
                  </TR>
                </THead>
                <TBody>
                  {Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={7} />)}
                </TBody>
              </Table>
            </TableContainer>
          ) : ultimosPedidos.length === 0 ? (
            <EmptyState
              icon={<Inbox size={20} />}
              title="Sin pedidos hoy"
              description="Cuando se registren pedidos aparecerán aquí en tiempo real."
              compact
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
                    <TH>Hora</TH>
                  </TR>
                </THead>
                <TBody>
                  {ultimosPedidos.map((p) => (
                    <TR
                      key={p.id}
                      interactive
                      onClick={() => navegar({ kind: 'pedido-detalle', id: p.id })}
                    >
                      <TD className="font-mono font-medium text-slate-900">#{p.numero ?? '—'}</TD>
                      <TD className="font-medium text-slate-900">{p.cliente?.nombre ?? '—'}</TD>
                      <TD>
                        <Badge dot tone={PEDIDO_ESTADO_TONE[p.estado] ?? 'neutral'}>
                          {PEDIDO_ESTADO_LABEL[p.estado] ?? p.estado}
                        </Badge>
                      </TD>
                      <TD align="right" className="num font-semibold text-slate-900">
                        {moneda(p.total)}
                      </TD>
                      <TD align="right" className="num font-semibold text-success-700">
                        {moneda(p.totalPagado)}
                      </TD>
                      <TD align="right" className="num font-semibold text-warning-700">
                        {moneda(p.pendiente)}
                      </TD>
                      <TD className="text-slate-500">
                        {dayjs(p.createdAt).format('HH:mm')}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableContainer>
          )}
        </Card>

        {/* Distribución por estado */}
        <Card>
          <CardHeader>
            <CardTitle>Por estado</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)
            ) : (
              ESTADOS_ORDER.map((e) => {
                const n = conteoEstados[e] ?? 0;
                const total = ESTADOS_ORDER.reduce((acc, k) => acc + (conteoEstados[k] ?? 0), 0) || 1;
                const pct = Math.round((n / total) * 100);
                return (
                  <div key={e}>
                    <div className="flex items-center justify-between text-sm">
                      <Badge dot tone={PEDIDO_ESTADO_TONE[e]}>{PEDIDO_ESTADO_LABEL[e]}</Badge>
                      <span className="num font-medium text-slate-800">{n}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all',
                          PEDIDO_ESTADO_TONE[e] === 'success' && 'bg-success-500',
                          PEDIDO_ESTADO_TONE[e] === 'warning' && 'bg-warning-500',
                          PEDIDO_ESTADO_TONE[e] === 'danger'  && 'bg-danger-500',
                          PEDIDO_ESTADO_TONE[e] === 'info'    && 'bg-info-500',
                          PEDIDO_ESTADO_TONE[e] === 'neutral' && 'bg-slate-400'
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </CardBody>
        </Card>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Sesión activa</CardTitle>
          </CardHeader>
          <CardBody>
            <p className="font-semibold text-slate-900">
              {sesion.data?.usuario?.nombre ?? usuario?.nombre ?? '—'}
            </p>
            <p className="text-sm text-slate-500">
              Inicio: {sesion.data?.fechaInicio ? dayjs(sesion.data.fechaInicio).format('DD/MM/YYYY HH:mm') : '—'}
            </p>
            <p className="text-sm text-slate-500">
              Cobrado en sesión: {moneda(sesion.data?.totalPagado ?? 0)}
            </p>
          </CardBody>
        </Card>

        <Card className="xl:col-span-2 overflow-hidden">
          <CardHeader>
            <CardTitle>Resumen por empleado</CardTitle>
          </CardHeader>
          <TableContainer className="border-0 shadow-none rounded-none">
            <Table>
              <THead>
                <TR>
                  <TH>Empleado</TH>
                  <TH align="right">Pedidos</TH>
                  <TH align="right">Pagos</TH>
                  <TH align="right">Cobrado</TH>
                </TR>
              </THead>
              <TBody>
                {(empleados.data?.empleados ?? []).map((r: any) => (
                  <TR key={r.usuario.id}>
                    <TD className="font-medium text-slate-900">{r.usuario.nombre}</TD>
                    <TD align="right" className="num">{r.totalOrdenes}</TD>
                    <TD align="right" className="num">{r.totalPagos}</TD>
                    <TD align="right" className="num font-semibold text-success-700">
                      {moneda(r.totalPagado)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableContainer>
        </Card>
      </section>
    </div>
  );
}
