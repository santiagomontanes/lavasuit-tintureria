import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Banknote, CreditCard, RefreshCw, TrendingUp, Wallet,
  ArrowDownCircle, ClipboardList, Scale
} from 'lucide-react';
import dayjs from 'dayjs';
import api from '../services/api';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import { Card, CardBody, CardHeader, CardTitle } from '../components/ui/Card';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '../components/ui/Table';
import LoadingState from '../components/ui/LoadingState';
import CierreCajaModal   from '../components/forms/CierreCaja.modal';
import AbrirCajaModal    from '../components/forms/AbrirCaja.modal';
import CerrarCajaModal   from '../components/forms/CerrarCaja.modal';
import { useAuthStore } from '../store/auth.store';

const moneda = (v: number) =>
  `S/ ${Number(v ?? 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const METODO_LABEL: Record<string, string> = {
  EFECTIVO: 'Efectivo', TARJETA: 'Tarjeta', TRANSFERENCIA: 'Transferencia',
  YAPE: 'Yape', PLIN: 'Plin'
};

export default function CajaPage() {
  const usuario = useAuthStore((s) => s.usuario);
  const qc = useQueryClient();

  const [fecha, setFecha]               = useState(dayjs().format('YYYY-MM-DD'));
  const [filtroUsuarioId, setFiltroUsuarioId] = useState('');

  // Modales
  const [openCierre,  setOpenCierre]  = useState(false); // legacy
  const [openAbrir,   setOpenAbrir]   = useState(false);
  const [openCerrar,  setOpenCerrar]  = useState(false);

  // ── Queries ──────────────────────────────────────────────────────────────
  const params = useMemo(() => {
    const p: Record<string, string> = { fecha };
    if (filtroUsuarioId) p.usuarioId = filtroUsuarioId;
    return p;
  }, [fecha, filtroUsuarioId]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['caja', params],
    queryFn:  () => api.get('/caja/resumen', { params }).then((r) => r.data)
  });

  const { data: cajaActualData, isLoading: loadingActual, refetch: refetchActual } = useQuery({
    queryKey: ['caja', 'actual'],
    queryFn:  () => api.get('/caja/actual').then((r) => r.data),
    refetchInterval: 60_000  // Actualizar cada minuto
  });

  const { data: sesiones = [] } = useQuery({
    queryKey: ['caja', 'sesiones', filtroUsuarioId],
    queryFn:  () => api.get('/caja/sesiones', {
      params: { limit: 15, ...(filtroUsuarioId ? { usuarioId: filtroUsuarioId } : {}) }
    }).then((r) => r.data)
  });

  const { data: empleados = [] } = useQuery({
    queryKey: ['empleados'],
    queryFn:  () => api.get('/empleados').then((r) => r.data as any[]),
    enabled:  usuario?.rol === 'ADMIN'
  });

  // ── Datos ────────────────────────────────────────────────────────────────
  const d     = data ?? {};
  const pagos: any[] = d.pagos ?? [];

  const cajaActiva  = cajaActualData?.cajaSesion ?? null;
  const resumenLive = cajaActualData?.resumen    ?? {};

  const stats = [
    { label: 'Total recibido',       value: moneda(d.totalRecibido  ?? 0), icon: Wallet,       tone: 'success' as const },
    { label: 'Pendiente por cobrar', value: moneda(d.totalPendiente ?? 0), icon: ArrowDownCircle, tone: 'warning' as const },
    { label: 'Ordenado',             value: moneda(d.valorOrdenado  ?? 0), icon: ClipboardList, tone: 'info'    as const },
    { label: 'Órdenes creadas',      value: d.totalOrdenes ?? 0,           icon: TrendingUp,    tone: 'neutral' as const },
  ];

  const metodos = [
    { label: 'Efectivo',      value: d.totalEfectivo      ?? 0, icon: Banknote },
    { label: 'Transferencia', value: d.totalTransferencia ?? 0, icon: ArrowDownCircle },
    { label: 'Tarjeta',       value: d.totalTarjeta       ?? 0, icon: CreditCard },
    { label: 'Yape / Plin',   value: d.totalOtros         ?? 0, icon: Wallet },
  ];

  const invalidarCaja = () => {
    qc.invalidateQueries({ queryKey: ['caja'] });
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Finanzas"
        title="Caja"
        description="Gestión de caja, apertura y cierre de turno."
        actions={(
          <>
            <Button
              variant="secondary"
              leftIcon={<RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} />}
              onClick={invalidarCaja}
            >
              Actualizar
            </Button>
            {!cajaActiva ? (
              <Button leftIcon={<Banknote size={15} />} onClick={() => setOpenAbrir(true)}>
                Abrir mi caja
              </Button>
            ) : (
              <Button leftIcon={<Scale size={15} />} onClick={() => setOpenCerrar(true)}>
                Cerrar mi caja
              </Button>
            )}
          </>
        )}
      />

      {/* ── Caja activa del empleado ─────────────────────────────────────── */}
      {loadingActual ? (
        <LoadingState label="Verificando caja activa..." />
      ) : cajaActiva ? (
        <Card>
          <CardBody>
            <div className="flex flex-wrap items-start gap-6">
              <div className="flex-1 min-w-[220px]">
                <p className="text-xs font-semibold uppercase tracking-wide text-success-600 mb-1">Caja abierta</p>
                <p className="text-sm text-slate-600">
                  Desde{' '}
                  <span className="font-semibold text-slate-800">
                    {dayjs(cajaActiva.fechaApertura).format('DD/MM/YYYY HH:mm')}
                  </span>
                </p>
                {cajaActiva.observacionApertura && (
                  <p className="text-xs text-slate-400 mt-1">{cajaActiva.observacionApertura}</p>
                )}
              </div>
              <div className="flex flex-wrap gap-5 text-center">
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide">Base inicial</p>
                  <p className="text-lg font-bold num text-slate-800">{moneda(Number(cajaActiva.montoBase ?? 0))}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide">Efectivo esperado</p>
                  <p className="text-lg font-bold num text-info-700">{moneda(Number(resumenLive.efectivoEsperado ?? 0))}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide">Total recibido</p>
                  <p className="text-lg font-bold num text-success-700">{moneda(Number(resumenLive.totalRecibido ?? 0))}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide">Pendiente</p>
                  <p className="text-lg font-bold num text-warning-700">{moneda(Number(resumenLive.totalPendiente ?? 0))}</p>
                </div>
              </div>
              <div className="flex gap-2 items-center">
                <Button variant="secondary" onClick={() => refetchActual()}>
                  <RefreshCw size={14} />
                </Button>
                <Button onClick={() => setOpenCerrar(true)}>
                  Cerrar caja
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex-1">
              <p className="font-semibold text-slate-700">Sin caja abierta</p>
              <p className="text-sm text-slate-500 mt-1">
                Abre tu caja para registrar el monto base e iniciar el turno.
              </p>
            </div>
            <Button leftIcon={<Banknote size={15} />} onClick={() => setOpenAbrir(true)}>
              Abrir mi caja
            </Button>
          </CardBody>
        </Card>
      )}

      {/* ── Filtros ──────────────────────────────────────────────────────── */}
      <Card>
        <CardBody className="flex flex-wrap items-end gap-4">
          <label className="block">
            <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Fecha</span>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="mt-1 block border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </label>
          {usuario?.rol === 'ADMIN' && (
            <label className="block">
              <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Empleado</span>
              <select
                value={filtroUsuarioId}
                onChange={(e) => setFiltroUsuarioId(e.target.value)}
                className="mt-1 block border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Todos</option>
                {empleados.map((e: any) => (
                  <option key={e.id} value={e.id}>{e.nombre}</option>
                ))}
              </select>
            </label>
          )}
          <Button variant="secondary" onClick={() => { setFecha(dayjs().format('YYYY-MM-DD')); setFiltroUsuarioId(''); }}>
            Hoy
          </Button>
        </CardBody>
      </Card>

      {isLoading ? (
        <LoadingState label="Cargando caja..." />
      ) : (
        <>
          {/* KPIs principales */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {stats.map((s) => (
              <Card key={s.label}>
                <CardBody className="flex items-start gap-3">
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0
                    ${s.tone === 'success' ? 'bg-success-50 text-success-700 ring-1 ring-success-100' : ''}
                    ${s.tone === 'warning' ? 'bg-warning-50 text-warning-700 ring-1 ring-warning-100' : ''}
                    ${s.tone === 'info'    ? 'bg-info-50 text-info-700 ring-1 ring-info-100' : ''}
                    ${s.tone === 'neutral' ? 'bg-slate-100 text-slate-600 ring-1 ring-slate-200' : ''}
                  `}>
                    <s.icon size={18} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{s.label}</p>
                    <p className="mt-1 text-xl font-bold text-slate-950 num">{s.value}</p>
                  </div>
                </CardBody>
              </Card>
            ))}
          </section>

          {/* Desglose por método */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {metodos.map((m) => (
              <Card key={m.label}>
                <CardBody>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{m.label}</p>
                  <p className="mt-1 text-lg font-bold text-slate-950 num">{moneda(m.value)}</p>
                </CardBody>
              </Card>
            ))}
          </section>

          {/* Pedidos pagados vs pendientes */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardBody>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pedidos pagados</p>
                <p className="mt-1 text-2xl font-bold text-success-700">{d.pedidosPagados ?? 0}</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pedidos con saldo pendiente</p>
                <p className="mt-1 text-2xl font-bold text-warning-700">{d.pedidosPendientes ?? 0}</p>
              </CardBody>
            </Card>
          </section>

          {/* Tabla de pagos recibidos */}
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Banknote size={16} /> Pagos recibidos
              </CardTitle>
              <Badge tone="info" outline>{pagos.length} pagos</Badge>
            </CardHeader>
            {pagos.length === 0 ? (
              <CardBody>
                <p className="text-center text-slate-400 py-4">No hay pagos para este período.</p>
              </CardBody>
            ) : (
              <TableContainer className="border-0 shadow-none rounded-none">
                <Table>
                  <THead>
                    <TR>
                      <TH>Pedido</TH><TH>Cliente</TH><TH>Empleado</TH>
                      <TH>Método</TH><TH align="right">Monto</TH><TH>Fecha</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {pagos.map((p: any) => (
                      <TR key={p.id}>
                        <TD className="font-mono font-semibold text-slate-950">#{p.pedido?.numero ?? '---'}</TD>
                        <TD>
                          <p className="font-medium text-slate-900">{p.pedido?.cliente?.nombre ?? '---'}</p>
                          {p.pedido?.cliente?.identificador && (
                            <p className="text-xs font-mono text-slate-400">{p.pedido.cliente.identificador}</p>
                          )}
                        </TD>
                        <TD className="text-slate-600">{p.usuario?.nombre ?? '---'}</TD>
                        <TD><Badge tone="neutral" outline>{METODO_LABEL[p.metodo] ?? p.metodo}</Badge></TD>
                        <TD align="right" className="num font-bold text-success-700">{moneda(Number(p.monto))}</TD>
                        <TD className="text-slate-500">
                          <p>{dayjs(p.createdAt).format('DD/MM/YYYY')}</p>
                          <p className="text-xs">{dayjs(p.createdAt).format('HH:mm')}</p>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableContainer>
            )}
          </Card>
        </>
      )}

      {/* ── Historial de sesiones de caja ────────────────────────────────── */}
      {sesiones.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList size={16} /> Historial de cajas
            </CardTitle>
            <Badge tone="neutral" outline>{sesiones.length} registros</Badge>
          </CardHeader>
          <TableContainer className="border-0 shadow-none rounded-none">
            <Table>
              <THead>
                <TR>
                  <TH>Empleado</TH><TH>Apertura</TH><TH>Cierre</TH>
                  <TH>Base</TH><TH>Recibido</TH><TH>Ef. esperado</TH>
                  <TH>Contado</TH><TH>Diferencia</TH><TH>Estado</TH>
                </TR>
              </THead>
              <TBody>
                {(sesiones as any[]).map((s: any) => {
                  const diff = s.diferencia != null ? Number(s.diferencia) : null;
                  return (
                    <TR key={s.id}>
                      <TD className="font-medium text-slate-900">{s.usuario?.nombre ?? '---'}</TD>
                      <TD className="text-slate-500 text-xs">
                        <p>{dayjs(s.fechaApertura).format('DD/MM/YYYY')}</p>
                        <p>{dayjs(s.fechaApertura).format('HH:mm')}</p>
                      </TD>
                      <TD className="text-slate-500 text-xs">
                        {s.fechaCierre ? (
                          <>
                            <p>{dayjs(s.fechaCierre).format('DD/MM/YYYY')}</p>
                            <p>{dayjs(s.fechaCierre).format('HH:mm')}</p>
                          </>
                        ) : '—'}
                      </TD>
                      <TD className="num">{moneda(Number(s.montoBase ?? 0))}</TD>
                      <TD className="num font-semibold text-success-700">
                        {s.totalRecibido != null ? moneda(Number(s.totalRecibido)) : '—'}
                      </TD>
                      <TD className="num text-info-700">
                        {s.efectivoEsperado != null ? moneda(Number(s.efectivoEsperado)) : '—'}
                      </TD>
                      <TD className="num">
                        {s.efectivoContado != null ? moneda(Number(s.efectivoContado)) : '—'}
                      </TD>
                      <TD className={`num font-semibold ${diff == null ? '' : diff >= -0.01 ? 'text-success-700' : 'text-danger-700'}`}>
                        {diff != null ? `${diff >= 0 ? '+' : ''}${moneda(diff)}` : '—'}
                      </TD>
                      <TD>
                        <Badge tone={s.estado === 'ABIERTA' ? 'success' : 'neutral'} outline>
                          {s.estado === 'ABIERTA' ? 'Abierta' : 'Cerrada'}
                        </Badge>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </TableContainer>
        </Card>
      )}

      {/* ── Modales ─────────────────────────────────────────────────────── */}
      <AbrirCajaModal
        open={openAbrir}
        onClose={() => setOpenAbrir(false)}
        onSuccess={invalidarCaja}
      />

      <CerrarCajaModal
        open={openCerrar}
        onClose={() => setOpenCerrar(false)}
        cajaSesion={cajaActiva}
        resumen={resumenLive}
        onSuccess={invalidarCaja}
      />

      {/* Mantener legacy CierreCajaModal para cierre por fecha si hace falta */}
      <CierreCajaModal
        open={openCierre}
        onClose={() => setOpenCierre(false)}
        resumen={data}
        fecha={fecha}
        onSuccess={invalidarCaja}
      />
    </div>
  );
}
