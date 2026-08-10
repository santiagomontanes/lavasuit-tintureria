import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Eye, HandCoins } from 'lucide-react';
import dayjs from 'dayjs';
import api from '../../services/api';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '../ui/Card';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '../ui/Table';
import RegistrarPagoModal from '../forms/RegistrarPago.modal';
import { useNavStore } from '../../store/nav.store';
import { formatCurrencyCOP } from '../../lib/currency';

const moneda = formatCurrencyCOP;

const ESTADOS = ['', 'RECIBIDO', 'EN_PROCESO', 'LISTO', 'ENTREGADO'];
const ESTADO_TONE: Record<string, any> = {
  RECIBIDO: 'info', EN_PROCESO: 'warning', LISTO: 'success', ENTREGADO: 'neutral'
};

/* #4 Facturas pendientes por cobrar. Usa /reportes/facturas-pendientes, que
 * calcula el saldo con el MISMO helper que Reportes/Pedidos (pendienteDePedido),
 * por lo que la suma cuadra con los reportes. Sólo muestra saldo real > 0. */
export default function FacturasPendientes() {
  const navegar = useNavStore((s) => s.navegar);

  const [q, setQ]         = useState('');
  const [estado, setEstado] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [pago, setPago]   = useState<{ pedidoId: string; saldo: number } | null>(null);

  const params = useMemo(() => {
    const p: Record<string, string> = {};
    if (q.trim()) p.q = q.trim();
    if (estado)   p.estado = estado;
    if (desde)    p.desde = desde;
    if (hasta)    p.hasta = hasta;
    return p;
  }, [q, estado, desde, hasta]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['facturas-pendientes', params],
    queryFn:  () => api.get('/reportes/facturas-pendientes', { params }).then((r) => r.data)
  });

  const facturas: any[] = data?.facturas ?? [];
  const totalPendiente  = Number(data?.totalPendiente ?? 0);

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertCircle size={16} /> Facturas pendientes por cobrar
        </CardTitle>
        <Badge tone="warning">{moneda(totalPendiente)} · {facturas.length}</Badge>
      </CardHeader>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 px-4 pt-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cliente o código"
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[160px] focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value)}
          className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
        >
          {ESTADOS.map((e) => <option key={e} value={e}>{e || 'Todos los estados'}</option>)}
        </select>
        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
          className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm" title="Desde" />
        <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
          className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm" title="Hasta" />
        {(q || estado || desde || hasta) && (
          <Button variant="secondary" onClick={() => { setQ(''); setEstado(''); setDesde(''); setHasta(''); }}>
            Limpiar
          </Button>
        )}
      </div>

      {isLoading ? (
        <CardBody><p className="text-center text-slate-400 py-4">Cargando…</p></CardBody>
      ) : facturas.length === 0 ? (
        <CardBody><p className="text-center text-slate-400 py-4">No hay facturas con saldo pendiente para estos filtros.</p></CardBody>
      ) : (
        <TableContainer className="border-0 shadow-none rounded-none">
          <Table>
            <THead>
              <TR>
                <TH>Factura</TH><TH>Creada</TH><TH>Cliente</TH><TH>Empleado</TH>
                <TH align="right">Total</TH><TH align="right">Abonado</TH>
                <TH align="right">Deuda cons.</TH><TH align="right">Saldo</TH>
                <TH>Estado</TH><TH align="right">Acciones</TH>
              </TR>
            </THead>
            <TBody>
              {facturas.map((f) => (
                <TR key={f.id}>
                  <TD className="font-mono font-semibold text-slate-950">
                    {f.numero != null ? `#${f.numero}` : (f.numeroLocal ?? '---')}
                  </TD>
                  <TD className="text-slate-500">
                    <p>{dayjs(f.createdAt).format('DD/MM/YYYY')}</p>
                    <p className="text-xs">{dayjs(f.createdAt).format('HH:mm')}</p>
                  </TD>
                  <TD>
                    <p className="font-medium text-slate-900">{f.cliente?.nombre ?? '---'}</p>
                    {f.identificador && <p className="text-xs font-mono text-slate-400">{f.identificador}</p>}
                  </TD>
                  <TD className="text-slate-600">{f.empleado?.nombre ?? '---'}</TD>
                  <TD align="right" className="num">{moneda(f.total)}</TD>
                  <TD align="right" className="num text-success-700">{moneda(f.pagado)}</TD>
                  <TD align="right" className="num text-slate-500">{f.deudaConsolidada > 0 ? moneda(f.deudaConsolidada) : '—'}</TD>
                  <TD align="right" className="num font-bold text-warning-700">{moneda(f.saldo)}</TD>
                  <TD><Badge tone={ESTADO_TONE[f.estado] ?? 'neutral'} outline>{f.estado}</Badge></TD>
                  <TD align="right">
                    <div className="flex justify-end gap-1">
                      <Button variant="secondary" onClick={() => navegar({ kind: 'pedido-detalle', id: f.id })}>
                        <Eye size={14} /> Ver
                      </Button>
                      {f.estado !== 'ENTREGADO' && (
                        <Button onClick={() => setPago({ pedidoId: f.id, saldo: f.saldo })}>
                          <HandCoins size={14} /> Pago
                        </Button>
                      )}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableContainer>
      )}

      {pago && (
        <RegistrarPagoModal
          open={!!pago}
          pedidoId={pago.pedidoId}
          saldo={pago.saldo}
          onClose={() => { setPago(null); refetch(); }}
        />
      )}
    </Card>
  );
}
