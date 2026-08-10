import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { FileText, Eye, Printer } from 'lucide-react';
import api from '../../services/api';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import { Table, TableContainer, THead, TH, TBody, TR, TD } from '../ui/Table';
import EmptyState from '../ui/EmptyState';
import LoadingState from '../ui/LoadingState';
import { formatCurrencyCOP } from '../../lib/currency';
import { printHtml } from '../../utils/print';
import { useNavStore } from '../../store/nav.store';

const moneda = formatCurrencyCOP;

type Filtro = 'todas' | 'pendientes' | 'entregadas' | 'con-deuda' | 'con-garantias';
const FILTROS: { v: Filtro; label: string }[] = [
  { v: 'todas', label: 'Todas' },
  { v: 'pendientes', label: 'Pendientes' },
  { v: 'entregadas', label: 'Entregadas' },
  { v: 'con-deuda', label: 'Con deuda' },
  { v: 'con-garantias', label: 'Con garantías' }
];

const estadoTone = (e: string): any =>
  e === 'ENTREGADO' ? 'success' : e === 'CANCELADO' ? 'neutral' : 'warning';

interface Props { cliente: any; onClose: () => void; }

export default function HistorialFacturasCliente({ cliente, onClose }: Props) {
  const navegar = useNavStore((s) => s.navegar);
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['cliente-facturas', cliente.id, filtro, page],
    queryFn: () => api.get(`/clientes/${cliente.id}/facturas`, { params: { estado: filtro, page, limit: 100 } }).then((r) => r.data),
    enabled: !!cliente.id
  });

  const kpis = data?.kpis ?? {};
  const facturas: any[] = data?.facturas ?? [];

  const verDetalle = (id: string) => { onClose(); navegar({ kind: 'pedido-detalle', id }); };

  const irAFactura = (pedidoId: string | null) => { if (pedidoId) verDetalle(pedidoId); };

  const estadoDeCuentaPDF = async () => {
    // Trae TODAS las facturas para el estado de cuenta (no solo la página).
    const all = await api.get(`/clientes/${cliente.id}/facturas`, { params: { estado: 'todas', page: 1, limit: 200 } }).then((r) => r.data);
    const fs: any[] = all?.facturas ?? [];
    const k = all?.kpis ?? {};
    const c = all?.cliente ?? cliente;
    const fila = (f: any) => `
      <tr>
        <td>#${f.numero ?? f.numeroLocal ?? '—'}</td>
        <td>${dayjs(f.createdAt).format('DD/MM/YYYY')}</td>
        <td>${f.estado}</td>
        <td style="text-align:right">${moneda(f.total)}</td>
        <td style="text-align:right">${f.deudaConsolidada > 0 ? moneda(f.deudaConsolidada) : '—'}</td>
        <td style="text-align:right">${moneda(f.abonado)}</td>
        <td style="text-align:right;font-weight:700">${moneda(f.pendiente)}</td>
      </tr>`;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Estado de cuenta — ${c.nombre ?? ''}</title>
      <style>
        body{font-family:Arial,Helvetica,sans-serif;color:#0f172a;padding:24px;font-size:12px}
        h1{font-size:18px;margin:0 0 2px} .muted{color:#64748b;font-size:11px}
        table{width:100%;border-collapse:collapse;margin-top:10px}
        th,td{border:1px solid #94a3b8;padding:5px 8px;text-align:left}
        th{background:#0f172a;color:#fff;font-size:10px;text-transform:uppercase}
        .tot{border-top:3px solid #0f172a;padding-top:8px;margin-top:10px}
        .kpis{display:flex;flex-wrap:wrap;gap:10px;margin-top:10px}
        .kpi{border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;min-width:130px}
        .kpi span{display:block;font-size:10px;color:#64748b} .kpi b{font-size:15px}
        .tot{margin-top:10px;font-size:14px;font-weight:900}
      </style></head><body>
      <h1>Estado de cuenta</h1>
      <p class="muted">${c.identificador ? `[${c.identificador}] ` : ''}${c.nombre ?? ''}${c.telefono ? ` · ${c.telefono}` : ''} · Generado ${dayjs().format('DD/MM/YYYY HH:mm')}</p>
      <div class="kpis">
        <div class="kpi"><span>Total facturas</span><b>${k.totalFacturas ?? 0}</b></div>
        <div class="kpi"><span>Total facturado</span><b>${moneda(k.totalFacturado ?? 0)}</b></div>
        <div class="kpi"><span>Total abonado</span><b>${moneda(k.totalAbonado ?? 0)}</b></div>
        <div class="kpi"><span>Deuda actual</span><b>${moneda(k.deudaActual ?? 0)}</b></div>
        <div class="kpi"><span>Prendas</span><b>${k.totalPrendas ?? 0}</b></div>
      </div>
      <table>
        <thead><tr><th>Orden</th><th>Fecha</th><th>Estado</th><th style="text-align:right">Total</th><th style="text-align:right">Deuda ant.</th><th style="text-align:right">Abonado</th><th style="text-align:right">Saldo</th></tr></thead>
        <tbody>${fs.map(fila).join('')}</tbody>
      </table>
      <p class="tot">Deuda total pendiente: ${moneda(k.deudaActual ?? 0)}</p>
      <p class="muted" style="margin-top:18px">LavaSuit — Documento de consulta. No es factura fiscal.</p>
      </body></html>`;
    printHtml(html);
  };

  return (
    <Modal open onClose={onClose} title={`Historial de facturas — ${cliente.nombre}`}
      subtitle={cliente.identificador ? `Cliente ${cliente.identificador}` : cliente.telefono} size="xl">
      <div className="p-6 space-y-4">
        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
          {[
            ['Total facturas', kpis.totalFacturas ?? 0],
            ['Total facturado', moneda(kpis.totalFacturado ?? 0)],
            ['Total abonado', moneda(kpis.totalAbonado ?? 0)],
            ['Deuda actual', moneda(kpis.deudaActual ?? 0)],
            ['Última visita', kpis.ultimaVisita ? dayjs(kpis.ultimaVisita).format('DD/MM/YYYY') : '—'],
            ['Prendas', kpis.totalPrendas ?? 0]
          ].map(([label, val]) => (
            <div key={String(label)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[10px] uppercase font-bold text-slate-500">{label}</p>
              <p className="text-base font-black text-slate-900 num">{String(val)}</p>
            </div>
          ))}
        </div>

        {/* Filtros + acciones */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex gap-1.5 flex-wrap">
            {FILTROS.map((f) => (
              <button key={f.v} onClick={() => { setFiltro(f.v); setPage(1); }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border ${filtro === f.v ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                {f.label}
              </button>
            ))}
          </div>
          <Button variant="secondary" size="sm" leftIcon={<Printer size={14} />} onClick={estadoDeCuentaPDF}>
            Estado de cuenta (PDF)
          </Button>
        </div>

        {/* Lista */}
        {isLoading ? (
          <LoadingState label="Cargando facturas..." />
        ) : facturas.length === 0 ? (
          <EmptyState title="Sin facturas para este filtro" compact icon={<FileText size={20} />} />
        ) : (
          <TableContainer>
            <Table>
              <THead>
                <TR>
                  <TH>Orden</TH><TH>Fecha</TH><TH>Estado</TH>
                  <TH align="right">Total</TH><TH align="right">Abonado</TH><TH align="right">Saldo</TH>
                  <TH>Recibió</TH><TH>Últ. modificación</TH><TH>Encargado</TH><TH>Entrega</TH><TH align="right">Acción</TH>
                </TR>
              </THead>
              <TBody>
                {facturas.map((f) => (
                  <TR key={f.id}>
                    <TD className="font-semibold text-slate-900">#{f.numero ?? f.numeroLocal ?? '—'}</TD>
                    <TD className="text-slate-600">{dayjs(f.createdAt).format('DD/MM/YYYY')}</TD>
                    <TD><Badge tone={estadoTone(f.estado)}>{f.estado}</Badge></TD>
                    <TD align="right" className="num">
                      {moneda(f.total)}
                      {f.deudaConsolidada > 0 && (
                        <span className="block text-[10px] text-amber-700">+ deuda {moneda(f.deudaConsolidada)} = {moneda(f.totalAPagar)}</span>
                      )}
                    </TD>
                    <TD align="right" className="num text-green-700">{moneda(f.abonado)}</TD>
                    <TD align="right" className={`num font-semibold ${f.pendiente > 0 ? 'text-amber-700' : 'text-slate-500'}`}>{moneda(f.pendiente)}</TD>
                    <TD className="text-slate-600">{f.empleadoRecibe?.nombre ?? '—'}</TD>
                    <TD className="text-slate-600 text-xs">
                      {f.ultimaModificacion ? `${f.ultimaModificacion.usuario?.nombre ?? '—'} · ${dayjs(f.ultimaModificacion.fecha).format('DD/MM/YY')}` : '—'}
                    </TD>
                    <TD className="text-slate-600">{f.encargadoEntrega ?? <span className="text-slate-400">No registrado</span>}</TD>
                    <TD className="text-slate-600">{f.fechaEntrega ? dayjs(f.fechaEntrega).format('DD/MM/YYYY') : '—'}</TD>
                    <TD align="right">
                      <div className="flex items-center justify-end gap-1">
                        {f.garantias > 0 && <Badge tone="warning">G{f.garantias}</Badge>}
                        <Button variant="secondary" size="sm" leftIcon={<Eye size={13} />} onClick={() => verDetalle(f.id)}>Ver</Button>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableContainer>
        )}

        {/* Consolidaciones: navegación a facturas origen */}
        {facturas.some((f) => (f.facturasOrigen?.length ?? 0) > 0) && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
            <p className="font-semibold text-amber-800 mb-1">Deuda consolidada — facturas originales</p>
            {facturas.filter((f) => (f.facturasOrigen?.length ?? 0) > 0).map((f) => (
              <p key={f.id} className="text-xs text-amber-800">
                Orden #{f.numero}: {f.facturasOrigen.map((o: any) => (
                  <button key={o.pedidoId} onClick={() => irAFactura(o.pedidoId)} className="underline mx-1">
                    #{o.numero} ({moneda(o.monto)})
                  </button>
                ))}
              </p>
            ))}
          </div>
        )}

        {/* Paginación */}
        {(data?.pages ?? 1) > 1 && (
          <div className="flex items-center justify-center gap-3">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
            <span className="text-sm text-slate-500">Página {page} de {data?.pages}</span>
            <Button variant="secondary" size="sm" disabled={page >= (data?.pages ?? 1)} onClick={() => setPage((p) => p + 1)}>Siguiente</Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
