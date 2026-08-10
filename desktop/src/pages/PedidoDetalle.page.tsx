import React, { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CalendarDays, CreditCard, FileText, History, Layers, PackageCheck, Pencil, Printer, RefreshCw, ShieldAlert, Shirt, Trash2, UserRound } from 'lucide-react';
import dayjs from 'dayjs';
import api, { resolveBackendUrl } from '../services/api';
import { useNavStore } from '../store/nav.store';
import { useToastStore } from '../store/toast.store';
import { useAuthStore } from '../store/auth.store';
import CambiarEstadoModal from '../components/forms/CambiarEstado.modal';
import EditarPedidoModal from '../components/forms/EditarPedido.modal';
import RegistrarPagoModal from '../components/forms/RegistrarPago.modal';
import { marcaTag, coloresTexto } from '../lib/itemFormat';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Button from '../components/ui/Button';
import Badge, { PEDIDO_ESTADO_LABEL, PEDIDO_ESTADO_TONE } from '../components/ui/Badge';
import { Card, CardBody, CardHeader, CardTitle } from '../components/ui/Card';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '../components/ui/Table';
import EmptyState from '../components/ui/EmptyState';
import LoadingState from '../components/ui/LoadingState';
import Modal from '../components/ui/Modal';
import { Select } from '../components/ui/Input';
import { cn } from '../lib/cn';
import ReciboPedido, { generarHtmlRecibo, TipoRecibo } from '../components/recibo/ReciboPedido';
import { printHtml } from '../utils/print';
import { totalAPagar as calcTotalAPagar, pendienteDePedido } from '../lib/saldos';

const garantiaTone: Record<string, 'danger' | 'warning' | 'success' | 'neutral'> = {
  ABIERTA: 'danger',
  EN_REVISION: 'warning',
  RESUELTA: 'success',
  RECHAZADA: 'neutral'
};

const GARANTIA_ESTADOS = ['ABIERTA', 'EN_REVISION', 'RESUELTA', 'RECHAZADA'] as const;

import { formatCurrencyCOP } from '../lib/currency';
const moneda = formatCurrencyCOP;

interface Props { id: string; }

export default function PedidoDetallePage({ id }: Props) {
  const navegar = useNavStore((s) => s.navegar);
  const qc      = useQueryClient();
  const toast   = useToastStore();
  const esAdmin = useAuthStore((s) => s.usuario?.rol === 'ADMIN');

  const [openEstado,   setOpenEstado]   = useState(false);
  const [openEditar,   setOpenEditar]   = useState(false);
  const [openPago,     setOpenPago]     = useState(false);
  const [openDelete,   setOpenDelete]   = useState(false);
  const [openConsolidar, setOpenConsolidar] = useState(false);
  const [openEntregar, setOpenEntregar] = useState(false);
  const [openRecibo,   setOpenRecibo]   = useState<TipoRecibo | null>(null);
  const [fotoEntrega,  setFotoEntrega]  = useState<File | null>(null);
  const [obsEntrega,   setObsEntrega]   = useState('');
  const [snapshotVer,  setSnapshotVer]  = useState<{ snap: any; titulo: string } | null>(null);
  const fotoInputRef = useRef<HTMLInputElement>(null);

  const { data: pedido, isLoading, isError } = useQuery({
    queryKey: ['pedido', id],
    queryFn:  () => api.get(`/pedidos/${id}`).then((r) => r.data)
  });

  const { data: historialEdiciones = [] } = useQuery({
    queryKey: ['pedido-historial', id],
    queryFn:  () => api.get(`/pedidos/${id}/historial-ediciones`).then((r) => r.data),
    enabled:  !!id
  });

  const { data: garantiasData = [] } = useQuery({
    queryKey: ['garantias', id],
    queryFn:  () => api.get(`/garantias/pedido/${id}`).then((r) => r.data),
    enabled:  !!id
  });

  const { data: config } = useQuery({
    queryKey: ['configuracion-empresa'],
    queryFn:  () => api.get('/configuracion/empresa').then((r) => r.data)
  });
  const mostrarNombre = config?.mostrarNombreEnRecibo ?? true;
  const exigeFoto     = config?.exigirFotoEntrega ?? false;
  const mostrarConsolidada = config?.mostrarDeudaConsolidadaEnFactura ?? false;

  const totalNum = Number(pedido?.total ?? 0);
  const deudaAnterior = Number(pedido?.deudaConsolidada ?? 0);
  const totalAPagar = pedido ? calcTotalAPagar(pedido) : totalNum;
  const pagado = useMemo(
    () => (pedido?.pagos ?? []).reduce((acc: number, p: any) => acc + Number(p.monto), 0),
    [pedido?.pagos]
  );
  // Si es factura ORIGEN consolidada, su saldo se cobra en la destino → 0 aquí.
  const esOrigenConsolidado = !!pedido?.consolidadoEnPedidoId;
  const consolidadoEnNumero = pedido?.consolidadoEn?.numero ?? null;
  const saldo = pedido ? pendienteDePedido(pedido, pagado) : 0;

  const entregar = useMutation({
    mutationFn: () => {
      if (exigeFoto && !fotoEntrega) throw new Error('Foto obligatoria');
      const fd = new FormData();
      if (fotoEntrega) fd.append('foto', fotoEntrega);
      if (obsEntrega.trim()) fd.append('observacion', obsEntrega.trim());
      return api.post(`/pedidos/${id}/entregar`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      }).then((r) => r.data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pedido', id] });
      qc.invalidateQueries({ queryKey: ['pedidos'] });
      qc.invalidateQueries({ queryKey: ['caja'] });
      toast.show('Pedido marcado como ENTREGADO', 'success');
      setOpenEntregar(false);
      setFotoEntrega(null);
      setObsEntrega('');
    },
    onError: (e: any) => {
      toast.show(e?.response?.data?.error || 'No se pudo registrar la entrega', 'error');
    }
  });

  /* Deuda anterior del cliente disponible para consolidar (otras facturas con
   * saldo pendiente, distintas de esta orden). */
  const { data: deudaCliente } = useQuery({
    queryKey: ['cliente-deuda', pedido?.clienteId],
    queryFn:  () => api.get(`/clientes/${pedido.clienteId}/deuda`).then((r) => r.data),
    enabled:  !!pedido?.clienteId && esAdmin
  });
  const facturasOtras = (deudaCliente?.facturas ?? []).filter((f: any) => f.pedidoId !== id);
  const deudaAnteriorDisponible = facturasOtras.reduce((acc: number, f: any) => acc + Number(f.pendiente ?? 0), 0);

  const consolidar = useMutation({
    mutationFn: () => api.post(`/pedidos/${id}/consolidar-deuda`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pedido', id] });
      qc.invalidateQueries({ queryKey: ['pedidos'] });
      qc.invalidateQueries({ queryKey: ['cliente-deuda'] });
      qc.invalidateQueries({ queryKey: ['reportes'] });
      qc.invalidateQueries({ queryKey: ['caja'] });
      toast.show('Deuda anterior consolidada en esta factura', 'success');
      setOpenConsolidar(false);
    },
    onError: (e: any) => {
      toast.show(e?.response?.data?.error || 'No se pudo consolidar la deuda', 'error');
    }
  });

  const eliminar = useMutation({
    mutationFn: () => api.delete(`/pedidos/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pedidos'] });
      qc.invalidateQueries({ queryKey: ['reportes'] });
      toast.show('Pedido eliminado', 'success');
      navegar({ kind: 'pedidos' });
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.error || 'No se pudo eliminar';
      toast.show(msg, 'error');
    }
  });

  const cambiarEstadoGarantia = useMutation({
    mutationFn: ({ garantiaId, estado }: { garantiaId: string; estado: string }) =>
      api.patch(`/garantias/${garantiaId}/estado`, { estado }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pedido', id] });
      qc.invalidateQueries({ queryKey: ['garantias'] });
      qc.invalidateQueries({ queryKey: ['garantias', id] });
      qc.invalidateQueries({ queryKey: ['reportes'] });
      toast.show('Garantia actualizada', 'success');
    },
    onError: (e: any) => {
      toast.show(e?.response?.data?.error || 'No se pudo actualizar la garantia', 'error');
    }
  });

  if (isLoading) return <LoadingState label="Cargando ficha del pedido..." />;

  if (isError || !pedido) {
    return (
      <Card>
        <EmptyState
          icon={<FileText size={22} />}
          title="No se pudo cargar el pedido"
          description="Vuelve a la lista de pedidos e intenta abrirlo nuevamente."
          action={<Button variant="secondary" leftIcon={<ArrowLeft size={16} />} onClick={() => navegar({ kind: 'pedidos' })}>Volver</Button>}
        />
      </Card>
    );
  }

  const items = pedido.items ?? [];
  const pagos = pedido.pagos ?? [];
  const garantias = garantiasData;
  const puedeRegistrarPago = saldo > 0 && pedido.estado !== 'CANCELADO';
  const puedeEntregar = pedido.estado !== 'ENTREGADO' && pedido.estado !== 'CANCELADO';
  const puedeConsolidar = esAdmin && !esOrigenConsolidado
    && pedido.estado !== 'CANCELADO' && deudaAnteriorDisponible > 0;
  const evidencia = pedido.evidenciaEntrega ?? null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <button
            onClick={() => navegar({ kind: 'pedidos' })}
            className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900 focus-ring rounded-lg"
          >
            <ArrowLeft size={16} /> Volver a pedidos
          </button>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
              Pedido #{pedido.numero ?? '---'}
            </h2>
            <Badge dot tone={PEDIDO_ESTADO_TONE[pedido.estado] ?? 'neutral'}>
              {PEDIDO_ESTADO_LABEL[pedido.estado] ?? pedido.estado}
            </Badge>
            {pedido.numeroLocal && (
              <Badge tone="neutral" outline>Orden offline: {pedido.numeroLocal}</Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Creado el {dayjs(pedido.createdAt).format('DD/MM/YYYY HH:mm')}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" leftIcon={<Printer size={15} />} onClick={() => setOpenRecibo('cliente')}>
            Recibo cliente
          </Button>
          <Button variant="secondary" leftIcon={<Printer size={15} />} onClick={() => setOpenRecibo('vendedor')}>
            Copia vendedor
          </Button>
          <Button variant="secondary" leftIcon={<RefreshCw size={15} />} onClick={() => setOpenEstado(true)}>
            Cambiar estado
          </Button>
          {esAdmin && (
            <Button variant="secondary" leftIcon={<Pencil size={15} />} onClick={() => setOpenEditar(true)}>
              Editar orden
            </Button>
          )}
          {puedeConsolidar && (
            <Button variant="secondary" leftIcon={<Layers size={15} />} onClick={() => setOpenConsolidar(true)}>
              Llamar deuda anterior
            </Button>
          )}
          {puedeEntregar && (
            <Button leftIcon={<PackageCheck size={15} />} onClick={() => setOpenEntregar(true)}>
              Entregar
            </Button>
          )}
          <Button leftIcon={<CreditCard size={15} />} disabled={!puedeRegistrarPago} onClick={() => setOpenPago(true)}>
            Registrar pago
          </Button>
          <Button variant="danger" leftIcon={<Trash2 size={15} />} onClick={() => setOpenDelete(true)}>
            Eliminar
          </Button>
        </div>
      </div>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardBody className="flex gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary-50 text-primary-700 ring-1 ring-primary-100 flex items-center justify-center">
              <UserRound size={18} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cliente</p>
              {pedido.cliente?.identificador && (
                <span className="inline-block font-mono text-xs font-semibold bg-primary-50 text-primary-700 px-2 py-0.5 rounded-md mb-1">
                  {pedido.cliente.identificador}
                </span>
              )}
              <p className="mt-0.5 font-semibold text-slate-950">{pedido.cliente?.nombre ?? '---'}</p>
              <p className="text-sm text-slate-500">{pedido.cliente?.telefono ?? 'Sin telefono'}</p>

              {/* Encargado de entregar: dato del PEDIDO (encargadoEntrega), no
                  el empleado que lo creó (ese aparece en la tarjeta "Entrega"). */}
              <div className="mt-3 border-t border-slate-100 pt-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Encargado de entregar
                </p>
                <p className={cn(
                  'mt-0.5 font-semibold',
                  pedido.encargadoEntrega ? 'text-slate-950' : 'italic text-slate-400'
                )}>
                  {pedido.encargadoEntrega || 'No registrado'}
                </p>
              </div>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex gap-3">
            <div className="h-10 w-10 rounded-xl bg-info-50 text-info-700 ring-1 ring-info-100 flex items-center justify-center">
              <CalendarDays size={18} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Entrega</p>
              <p className="mt-1 font-semibold text-slate-950">
                {pedido.fechaEntrega ? dayjs(pedido.fechaEntrega).format('DD/MM/YYYY') : 'Sin fecha'}
              </p>
              <p className="text-sm text-slate-500">Atendido por {pedido.usuario?.nombre ?? '---'}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Resumen de pago</p>
            <div className="mt-3 space-y-2">
              <div className="flex justify-between text-sm"><span className="text-slate-500">Total factura</span><span className="num font-semibold">{moneda(totalNum)}</span></div>
              {deudaAnterior > 0 && (
                <>
                  <div className="flex justify-between text-sm"><span className="text-warning-700">Deuda anterior</span><span className="num font-semibold text-warning-700">{moneda(deudaAnterior)}</span></div>
                  <div className="flex justify-between border-t border-slate-100 pt-2 text-sm"><span className="font-semibold text-slate-700">Total a pagar</span><span className="num font-bold">{moneda(totalAPagar)}</span></div>
                </>
              )}
              <div className="flex justify-between text-sm"><span className="text-slate-500">Abono</span><span className="num font-semibold text-success-700">{moneda(pagado)}</span></div>
              <div className="flex justify-between border-t border-slate-100 pt-2 text-sm"><span className="font-semibold text-slate-700">Saldo total</span><span className={cn('num text-lg font-bold', saldo > 0 ? 'text-warning-700' : 'text-success-700')}>{moneda(saldo)}</span></div>
              {esOrigenConsolidado && (
                <p className="mt-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
                  Saldo consolidado en factura {consolidadoEnNumero != null ? `#${consolidadoEnNumero}` : 'destino'}.
                </p>
              )}
            </div>
          </CardBody>
        </Card>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <Card className="xl:col-span-2 overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Shirt size={16} /> Items y prendas</CardTitle>
          </CardHeader>
          <TableContainer className="border-0 shadow-none rounded-none">
            <Table>
              <THead>
                <TR>
                  <TH>Prenda / servicio</TH>
                  <TH>Colores</TH>
                  <TH align="center">Cant.</TH>
                  <TH align="right">Precio</TH>
                  <TH align="right">Subtotal</TH>
                </TR>
              </THead>
              <TBody>
                {items.map((it: any) => (
                  <TR key={it.id}>
                    <TD>
                      <p className="font-semibold text-slate-900">
                        {it.nombre ?? it.servicio?.nombre ?? '---'}
                        {marcaTag(it) && <span className="ml-2 text-xs font-normal text-slate-500">{marcaTag(it)}</span>}
                      </p>
                      {it.observaciones && <p className="mt-1 text-xs text-slate-500">{it.observaciones}</p>}
                    </TD>
                    <TD className="text-xs">
                      {coloresTexto(it, { upperDestino: true }) || '---'}
                    </TD>
                    <TD align="center" className="num font-semibold">{it.cantidad}</TD>
                    <TD align="right" className="num">{moneda(Number(it.precio))}</TD>
                    <TD align="right" className="num font-semibold text-success-700">{moneda(Number(it.subtotal))}</TD>
                  </TR>
                ))}
                {items.length === 0 && (
                  <TR>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-400">Sin items registrados</td>
                  </TR>
                )}
              </TBody>
            </Table>
          </TableContainer>
          {pedido.notas && (
            <div className="border-t border-slate-100 bg-slate-50/70 px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Notas</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{pedido.notas}</p>
            </div>
          )}
        </Card>

        <div className="space-y-5">
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><CreditCard size={16} /> Pagos</CardTitle>
            </CardHeader>
            {pagos.length === 0 ? (
              <EmptyState compact icon={<CreditCard size={20} />} title="Sin pagos" description="Aun no hay pagos registrados." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {pagos.map((p: any) => (
                  <li key={p.id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="num font-semibold text-slate-950">{moneda(Number(p.monto))}</p>
                        <p className="text-xs font-medium text-slate-500">{p.metodo}</p>
                        <p className="text-xs text-slate-500">Cobrado por {p.usuario?.nombre ?? '---'}</p>
                      </div>
                      <span className="text-xs text-slate-400">{dayjs(p.createdAt).format('DD/MM HH:mm')}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Historial</CardTitle>
            </CardHeader>
            <CardBody className="space-y-2 text-sm text-slate-600">
              <div className="flex justify-between gap-3"><span>Empleado</span><span className="font-medium text-slate-900">{pedido.usuario?.nombre ?? '---'}</span></div>
              <div className="flex justify-between gap-3"><span>Sesion</span><span className="font-medium text-slate-900">{pedido.sesionTrabajoId ? 'Registrada' : 'Sin sesion'}</span></div>
              <div className="flex justify-between gap-3"><span>Garantias</span><span className="font-medium text-slate-900">{garantias.length}</span></div>
            </CardBody>
          </Card>
        </div>
      </section>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldAlert size={16} /> Garantias</CardTitle>
          <Badge tone={garantias.length ? 'warning' : 'neutral'} outline>{garantias.length} registro(s)</Badge>
        </CardHeader>
        {garantias.length === 0 ? (
          <EmptyState compact icon={<ShieldAlert size={20} />} title="Sin garantias registradas" description="Las evidencias apareceran aqui cuando se creen desde el flujo de garantia." />
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 p-5">
            {garantias.map((g: any) => (
              <div key={g.id} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                <div className="grid grid-cols-[112px_1fr] gap-4">
                  {g.fotoUrl || g.fotoPath ? (
                    <img
                      src={resolveBackendUrl(g.fotoUrl ?? g.fotoPath)}
                      alt="Evidencia de garantia"
                      className="h-28 w-28 object-cover rounded-xl border border-slate-200 bg-white"
                    />
                  ) : (
                    <div className="h-28 w-28 rounded-xl bg-white border border-dashed border-slate-300 flex items-center justify-center text-slate-300">
                      <ShieldAlert size={24} />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge dot tone={garantiaTone[g.estado] ?? 'danger'}>{String(g.estado).replace('_', ' ')}</Badge>
                      <span className="text-xs text-slate-500">{dayjs(g.createdAt).format('DD/MM/YYYY HH:mm')}</span>
                    </div>
                    <p className="mt-2 font-medium text-slate-950 whitespace-pre-wrap">{g.descripcion}</p>
                    <p className="mt-2 text-xs text-slate-500">
                      Item: {g.pedidoItem?.nombre ?? g.pedidoItem?.servicio?.nombre ?? 'Pedido completo'}
                    </p>
                    <p className="text-xs text-slate-500">Registrado por: {g.usuario?.nombre ?? '---'}</p>
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <Select
                    value={g.estado}
                    disabled={cambiarEstadoGarantia.isPending}
                    onChange={(e) => cambiarEstadoGarantia.mutate({ garantiaId: g.id, estado: e.target.value })}
                    className="w-48"
                  >
                    {GARANTIA_ESTADOS.map((estado) => (
                      <option key={estado} value={estado}>{estado.replace('_', ' ')}</option>
                    ))}
                  </Select>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Historial de cambios (auditoría + facturas anteriores) */}
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><History size={16} /> Historial de cambios</CardTitle>
          <Badge tone={historialEdiciones.length ? 'warning' : 'neutral'} outline>{historialEdiciones.length} edición(es)</Badge>
        </CardHeader>
        {historialEdiciones.length === 0 ? (
          <EmptyState compact icon={<History size={20} />} title="Sin ediciones" description="Cuando se edite la orden, cada cambio quedará aquí con su motivo y la factura anterior." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {historialEdiciones.map((h: any) => (
              <li key={h.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">{h.motivo}</p>
                    <p className="text-xs text-slate-500">
                      {h.usuario?.nombre ?? '---'} · {dayjs(h.createdAt).format('DD/MM/YYYY HH:mm')}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      Total: <span className="num">{moneda(Number(h.totalAntes))}</span> → <span className="num font-semibold">{moneda(Number(h.totalDespues))}</span>
                      {h.cambios ? ` · prendas: ${h.cambios.itemsAntes} → ${h.cambios.itemsDespues}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {h.snapshotAntes && (
                      <Button variant="secondary" className="!px-2 !py-1 text-xs" leftIcon={<FileText size={13} />}
                        onClick={() => setSnapshotVer({ snap: h.snapshotAntes, titulo: 'Factura anterior' })}>
                        Factura anterior
                      </Button>
                    )}
                    {h.snapshotDespues && (
                      <Button variant="secondary" className="!px-2 !py-1 text-xs" leftIcon={<FileText size={13} />}
                        onClick={() => setSnapshotVer({ snap: h.snapshotDespues, titulo: 'Factura después del cambio' })}>
                        Factura después
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Evidencia de entrega */}
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><PackageCheck size={16} /> Evidencia de entrega</CardTitle>
          {evidencia
            ? <Badge tone="success" dot>Registrada</Badge>
            : <Badge tone="neutral" outline>Sin evidencia</Badge>
          }
        </CardHeader>
        {evidencia ? (
          <div className="p-5 grid grid-cols-1 md:grid-cols-[160px_1fr] gap-5">
            <img
              src={resolveBackendUrl(evidencia.fotoUrl ?? evidencia.fotoPath)}
              alt="Evidencia de entrega"
              className="h-40 w-full object-cover rounded-xl border border-slate-200 bg-white"
            />
            <div className="space-y-2 text-sm">
              <p className="text-slate-500">Entregado por <span className="font-semibold text-slate-900">{evidencia.usuario?.nombre ?? '---'}</span></p>
              <p className="text-slate-500">Fecha <span className="font-semibold text-slate-900">{dayjs(evidencia.createdAt).format('DD/MM/YYYY HH:mm')}</span></p>
              {evidencia.observacion && (
                <p className="text-slate-700 whitespace-pre-wrap">{evidencia.observacion}</p>
              )}
            </div>
          </div>
        ) : (
          <EmptyState
            compact
            icon={<PackageCheck size={20} />}
            title="Sin evidencia de entrega"
            description={exigeFoto ? 'Al marcar el pedido como ENTREGADO se solicitará una foto.' : 'Al marcar el pedido como ENTREGADO la foto será opcional.'}
          />
        )}
      </Card>

      {/* Modal: Entregar con foto */}
      <Modal open={openEntregar} onClose={() => { setOpenEntregar(false); setFotoEntrega(null); setObsEntrega(''); }} title="Registrar entrega" subtitle={exigeFoto ? 'Foto obligatoria para confirmar la entrega.' : 'La foto es opcional según la configuración.'} size="sm">
        <div className="p-6 space-y-4">
          <input
            ref={fotoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => setFotoEntrega(e.target.files?.[0] ?? null)}
          />
          <div
            onClick={() => fotoInputRef.current?.click()}
            className={cn(
              'h-40 rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-colors',
              fotoEntrega ? 'border-success-400 bg-success-50' : 'border-slate-300 bg-slate-50 hover:bg-slate-100'
            )}
          >
            {fotoEntrega ? (
              <>
                <img
                  src={URL.createObjectURL(fotoEntrega)}
                  alt="Preview"
                  className="h-full w-full object-cover rounded-xl"
                />
              </>
            ) : (
              <>
                <PackageCheck size={28} className="text-slate-400 mb-2" />
                <p className="text-sm text-slate-500">Haz clic para seleccionar foto</p>
                <p className="text-xs text-slate-400 mt-1">JPG, PNG, WEBP — max 10 MB</p>
              </>
            )}
          </div>
          {fotoEntrega && (
            <button
              type="button"
              onClick={() => { setFotoEntrega(null); if (fotoInputRef.current) fotoInputRef.current.value = ''; }}
              className="text-xs text-danger-600 hover:underline"
            >
              Quitar foto
            </button>
          )}
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Observación (opcional)</span>
            <textarea
              value={obsEntrega}
              onChange={(e) => setObsEntrega(e.target.value)}
              rows={2}
              className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Cliente presente, estado de la prenda, etc."
            />
          </label>
          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
            <Button variant="secondary" onClick={() => { setOpenEntregar(false); setFotoEntrega(null); setObsEntrega(''); }} disabled={entregar.isPending}>
              Cancelar
            </Button>
            <Button
              leftIcon={<PackageCheck size={15} />}
              disabled={(exigeFoto && !fotoEntrega) || entregar.isPending}
              loading={entregar.isPending}
              onClick={() => entregar.mutate()}
            >
              Confirmar entrega
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Vista previa del recibo */}
      <Modal
        open={openRecibo !== null}
        onClose={() => setOpenRecibo(null)}
        title={openRecibo === 'cliente' ? 'Recibo cliente' : 'Copia vendedor'}
        subtitle={`Pedido #${pedido.numero ?? '---'} · ${pedido.cliente?.nombre ?? ''}`}
        size="lg"
      >
        {openRecibo && (
          <div className="flex flex-col gap-0">
            <div className="flex justify-end gap-2 px-6 py-3 border-b border-slate-100 bg-slate-50">
              <Button
                leftIcon={<Printer size={15} />}
                onClick={() => printHtml(generarHtmlRecibo(pedido, openRecibo, pagado, { mostrarNombre, mostrarConsolidada }))}
              >
                Imprimir
              </Button>
            </div>
            <div className="overflow-y-auto max-h-[70vh] p-6">
              <ReciboPedido pedido={pedido} tipo={openRecibo} pagado={pagado} mostrarNombre={mostrarNombre} mostrarConsolidada={mostrarConsolidada} />
            </div>
          </div>
        )}
      </Modal>

      {/* Modal: Visor de factura anterior/después (snapshot) */}
      <Modal
        open={snapshotVer !== null}
        onClose={() => setSnapshotVer(null)}
        title={snapshotVer?.titulo ?? 'Factura'}
        subtitle={`Pedido #${snapshotVer?.snap?.numero ?? pedido.numero ?? '---'} · ${snapshotVer?.snap?.cliente?.nombre ?? ''}`}
        size="lg"
      >
        {snapshotVer && (
          <div className="flex flex-col gap-0">
            <div className="flex justify-end gap-2 px-6 py-3 border-b border-slate-100 bg-slate-50">
              <Button
                leftIcon={<Printer size={15} />}
                onClick={() => printHtml(generarHtmlRecibo(snapshotVer.snap, 'cliente', Number(snapshotVer.snap?.pagado ?? 0), { mostrarNombre, mostrarConsolidada }))}
              >
                Reimprimir esta factura
              </Button>
            </div>
            <div className="overflow-y-auto max-h-[70vh] p-6">
              <ReciboPedido pedido={snapshotVer.snap} tipo="cliente" pagado={Number(snapshotVer.snap?.pagado ?? 0)} mostrarNombre={mostrarNombre} mostrarConsolidada={mostrarConsolidada} />
            </div>
          </div>
        )}
      </Modal>

      <CambiarEstadoModal
        open={openEstado}
        onClose={() => setOpenEstado(false)}
        pedidoId={pedido.id}
        estadoActual={pedido.estado}
      />
      {esAdmin && (
        <EditarPedidoModal
          open={openEditar}
          onClose={() => setOpenEditar(false)}
          pedido={pedido}
        />
      )}
      <RegistrarPagoModal
        open={openPago}
        onClose={() => setOpenPago(false)}
        pedidoId={pedido.id}
        saldo={saldo}
      />
      <ConfirmDialog
        open={openConsolidar}
        title="Llamar deuda anterior"
        message={`Se consolidarán ${facturasOtras.length} factura(s) anterior(es) del cliente por ${moneda(deudaAnteriorDisponible)} en esta orden #${pedido.numero ?? ''}. Las facturas anteriores quedarán en saldo $0 con referencia a esta. No entra dinero a caja: solo se reorganiza el saldo. ¿Continuar?`}
        confirmLabel="Consolidar deuda"
        loading={consolidar.isPending}
        onCancel={() => setOpenConsolidar(false)}
        onConfirm={() => consolidar.mutate()}
      />
      <ConfirmDialog
        open={openDelete}
        title="Eliminar pedido"
        message={`Eliminar el pedido #${pedido.numero ?? ''}? Quedara oculto pero los pagos se conservan para auditoria.`}
        destructive
        confirmLabel="Eliminar"
        loading={eliminar.isPending}
        onCancel={() => setOpenDelete(false)}
        onConfirm={() => { setOpenDelete(false); eliminar.mutate(); }}
      />
    </div>
  );
}
