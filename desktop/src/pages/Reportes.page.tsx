import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import dayjs from 'dayjs';
import {
  FileSpreadsheet, Printer, DollarSign, Package, Truck, Hourglass,
  PackageCheck, Boxes, Wallet, Coins, TrendingDown, TrendingUp
} from 'lucide-react';
import api from '../services/api';
import PageHeader from '../components/ui/PageHeader';
import StatCard from '../components/ui/StatCard';
import { Card, CardHeader, CardTitle } from '../components/ui/Card';
import { Table, TableContainer, THead, TH, TBody, TR, TD } from '../components/ui/Table';
import { Field, Input, Select } from '../components/ui/Input';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import LoadingState from '../components/ui/LoadingState';

/* Reportes del negocio: cierre del día, inventario operativo de prendas y
 * resumen por rango (top prendas/clientes, cobros por empleado y método).
 * Consume endpoints aditivos /reportes/cierre-dia, /inventario y
 * /resumen-negocio. Exporta a Excel (xlsx) y a PDF (diálogo de impresión). */

import { formatCurrencyCOP } from '../lib/currency';
const moneda = formatCurrencyCOP;

const hoy = () => dayjs().format('YYYY-MM-DD');

const get = (url: string, params: Record<string, string | undefined>) =>
  api.get(url, { params }).then((r) => r.data);

/* Envoltura de estado para cada tabla: carga / error / vacío / contenido.
 * Evita las "tablas en blanco" — siempre muestra algo claro. */
function EstadoTabla(
  { loading, error, vacio, vacioTexto = 'Sin datos para este rango', children }:
  { loading: boolean; error: boolean; vacio: boolean; vacioTexto?: string; children: React.ReactNode }
) {
  if (loading) return <LoadingState label="Cargando datos..." className="border-0 shadow-none rounded-none" />;
  if (error)   return <div className="px-4 py-8 text-center text-sm text-danger-600">No se pudieron cargar los datos. Reintenta.</div>;
  if (vacio)   return <EmptyState title={vacioTexto} compact />;
  return <>{children}</>;
}

export default function ReportesPage() {
  const [desde, setDesde] = useState(hoy());
  const [hasta, setHasta] = useState(hoy());
  const [empleadoId, setEmpleadoId] = useState('');

  const filtro = empleadoId || undefined;

  const cierre = useQuery({
    queryKey: ['reportes', 'cierre-dia', desde, empleadoId],
    queryFn: () => get('/reportes/cierre-dia', { fecha: desde, usuarioId: filtro })
  });
  const inventario = useQuery({
    queryKey: ['reportes', 'inventario', desde, hasta],
    queryFn: () => get('/reportes/inventario', { desde, hasta })
  });
  const resumen = useQuery({
    queryKey: ['reportes', 'resumen-negocio', desde, hasta, empleadoId],
    queryFn: () => get('/reportes/resumen-negocio', { desde, hasta, usuarioId: filtro })
  });
  const empleados = useQuery({
    queryKey: ['reportes', 'por-empleado-lista'],
    queryFn: () => api.get('/reportes/por-empleado').then((r) => r.data)
  });
  const deudas = useQuery({
    queryKey: ['reportes', 'deudas'],
    queryFn: () => api.get('/reportes/deudas').then((r) => r.data)
  });
  const consolidaciones = useQuery({
    queryKey: ['reportes', 'consolidaciones', desde, hasta],
    queryFn: () => get('/reportes/consolidaciones', { desde, hasta })
  });

  const c = cierre.data ?? {};
  const inv = inventario.data ?? {};
  const res = resumen.data ?? {};
  const d  = deudas.data ?? {};
  const co = consolidaciones.data ?? {};

  // Logs temporales de diagnóstico (quitar tras verificar en producción).
  console.log('[reportes] data', { cierre: cierre.data, inventario: inventario.data, resumen: resumen.data });
  console.log('[reportes] topPrendas', res.topPrendas);
  console.log('[reportes] topClientes', res.topClientes);

  const nombreEmpleado =
    empleadoId
      ? ((empleados.data?.empleados ?? []).find((e: any) => e.usuario.id === empleadoId)?.usuario.nombre ?? '')
      : 'Todos los empleados';

  /* ---- Exportar a Excel: una hoja por bloque ---- */
  const exportarExcel = () => {
    const wb = XLSX.utils.book_new();

    const resumenRows = [
      ['Reporte LavaSuit', ''],
      ['Fecha cierre', dayjs(desde).format('DD/MM/YYYY')],
      ['Rango resumen', `${dayjs(desde).format('DD/MM/YYYY')} - ${dayjs(hasta).format('DD/MM/YYYY')}`],
      ['Empleado', nombreEmpleado],
      [],
      ['Total vendido', Number(c.totalVendido ?? 0)],
      ['Total recibido', Number(c.totalRecibido ?? 0)],
      ['Efectivo', Number(c.totalEfectivo ?? 0)],
      ['Nequi', Number(c.totalNequi ?? 0)],
      ['Daviplata', Number(c.totalDaviplata ?? 0)],
      ['Transferencia', Number(c.totalTransferencia ?? 0)],
      ['Abonos', Number(c.totalAbonos ?? 0)],
      ['Saldos pendientes', Number(c.totalSaldosPendientes ?? 0)],
      ['Total órdenes', Number(c.totalOrdenes ?? 0)],
      ['Total prendas', Number(c.totalPrendas ?? 0)],
      ['Entregadas hoy', Number(c.totalEntregadas ?? 0)],
      ['Pendientes', Number(c.totalPendientes ?? 0)],
      [],
      ['— Indicadores del período —', ''],
      ['Prendas recibidas', Number(res.prendasRecibidas ?? 0)],
      ['Prendas entregadas', Number(res.prendasEntregadas ?? 0)],
      ['Prendas en tienda', Number(res.prendasEnTienda ?? 0)],
      ['Ingresos del período', Number(res.ingresosPeriodo ?? 0)],
      ['Gastos del período', Number(res.gastosPeriodo ?? 0)],
      ['Utilidad estimada', Number(res.utilidadEstimada ?? 0)],
      ['Saldo por cobrar', Number(res.saldoPendientePorCobrar ?? 0)]
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumenRows), 'Cierre');

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet((c.porEmpleado ?? []).map((e: any) => ({
        Empleado: e.usuario?.nombre, Ordenes: e.totalOrdenes, Pagos: e.totalPagos, Cobrado: e.totalCobrado
      }))),
      'Por empleado'
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet((inv.porTipo ?? []).map((t: any) => ({ Tipo: t.tipo, Pendientes: t.prendas }))),
      'Inventario por tipo'
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet((res.topPrendas ?? []).map((t: any) => ({ Prenda: t.tipo, Cantidad: t.cantidad }))),
      'Top prendas'
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet((res.topClientes ?? []).map((t: any) => ({
        Cliente: t.nombre, Identificador: t.identificador ?? '', Ordenes: t.totalOrdenes, Valor: t.valor
      }))),
      'Top clientes'
    );

    XLSX.writeFile(wb, `reporte-lavasuit-${desde}.xlsx`);
  };

  /* ---- Exportar a PDF: HTML imprimible vía iframe (Guardar como PDF) ---- */
  const exportarPDF = () => {
    const fila = (k: string, v: string | number) => `<tr><td>${k}</td><td style="text-align:right">${v}</td></tr>`;
    const tabla = (titulo: string, head: string[], rows: string[][]) => `
      <h3>${titulo}</h3>
      <table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((r) => `<tr>${r.map((cell, i) => `<td style="${i === 0 ? '' : 'text-align:right'}">${cell}</td>`).join('')}</tr>`).join('')}</tbody></table>`;

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Reporte LavaSuit</title>
      <style>
        body{font-family:Arial,Helvetica,sans-serif;color:#0f172a;padding:24px;font-size:12px}
        h1{font-size:18px;margin:0 0 4px} h3{margin:18px 0 6px;font-size:13px}
        .muted{color:#64748b;font-size:11px}
        table{width:100%;border-collapse:collapse;margin-top:4px}
        th,td{border:1px solid #e2e8f0;padding:5px 8px;text-align:left}
        th{background:#f1f5f9;font-size:11px}
      </style></head><body>
      <h1>Reporte LavaSuit</h1>
      <p class="muted">Cierre: ${dayjs(desde).format('DD/MM/YYYY')} · Rango: ${dayjs(desde).format('DD/MM/YYYY')} - ${dayjs(hasta).format('DD/MM/YYYY')} · Empleado: ${nombreEmpleado}</p>
      <h3>Cierre del día</h3>
      <table><tbody>
        ${fila('Total vendido', moneda(c.totalVendido))}
        ${fila('Total recibido', moneda(c.totalRecibido))}
        ${fila('Efectivo', moneda(c.totalEfectivo))}
        ${fila('Nequi', moneda(c.totalNequi))}
        ${fila('Daviplata', moneda(c.totalDaviplata))}
        ${fila('Transferencia', moneda(c.totalTransferencia))}
        ${fila('Abonos', moneda(c.totalAbonos))}
        ${fila('Saldos pendientes', moneda(c.totalSaldosPendientes))}
        ${fila('Total órdenes', c.totalOrdenes ?? 0)}
        ${fila('Total prendas', c.totalPrendas ?? 0)}
        ${fila('Entregadas hoy', c.totalEntregadas ?? 0)}
        ${fila('Pendientes', c.totalPendientes ?? 0)}
        ${fila('Gastos del día', moneda(c.totalGastos))}
        ${fila('Utilidad del día', moneda(c.utilidadDia))}
      </tbody></table>
      <h3>Contabilidad del período</h3>
      <table><tbody>
        ${fila('Ingresos del período', moneda(res.ingresosPeriodo))}
        ${fila('Gastos del período', moneda(res.gastosPeriodo))}
        ${fila('Utilidad estimada', moneda(res.utilidadEstimada))}
      </tbody></table>
      ${tabla('Cobros por empleado', ['Empleado', 'Órdenes', 'Cobrado'],
        (c.porEmpleado ?? []).map((e: any) => [e.usuario?.nombre ?? '—', String(e.totalOrdenes), moneda(e.totalCobrado)]))}
      ${tabla('Inventario en tienda por tipo', ['Tipo', 'Pendientes'],
        (inv.porTipo ?? []).map((t: any) => [t.tipo, String(t.prendas)]))}
      ${tabla('Top prendas', ['Prenda', 'Cantidad'],
        (res.topPrendas ?? []).map((t: any) => [t.tipo, String(t.cantidad)]))}
      ${tabla('Top clientes', ['Cliente', 'Valor'],
        (res.topClientes ?? []).map((t: any) => [t.nombre, moneda(t.valor)]))}
      </body></html>`;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();
    iframe.contentWindow?.focus();
    setTimeout(() => {
      iframe.contentWindow?.print();
      setTimeout(() => document.body.removeChild(iframe), 1000);
    }, 300);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Reportes"
        title="Reportes del negocio"
        description="Cierre del día, inventario de prendas y desempeño comercial. Exporta a Excel o PDF."
        actions={(
          <div className="flex items-end gap-2">
            <Field label="Desde">
              <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </Field>
            <Field label="Hasta">
              <Input type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} />
            </Field>
            <Field label="Empleado">
              <Select value={empleadoId} onChange={(e) => setEmpleadoId(e.target.value)} className="w-48">
                <option value="">Todos los empleados</option>
                {(empleados.data?.empleados ?? []).map((r: any) => (
                  <option key={r.usuario.id} value={r.usuario.id}>{r.usuario.nombre}</option>
                ))}
              </Select>
            </Field>
            <Button variant="secondary" leftIcon={<FileSpreadsheet size={15} />} onClick={exportarExcel}>Excel</Button>
            <Button variant="secondary" leftIcon={<Printer size={15} />} onClick={exportarPDF}>PDF</Button>
          </div>
        )}
      />

      {/* KPIs del cierre */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard tone="success" label="Total recibido" value={moneda(c.totalRecibido ?? 0)}
          hint={`Vendido: ${moneda(c.totalVendido ?? 0)}`} icon={<DollarSign size={18} />} />
        <StatCard tone="warning" label="Saldos pendientes" value={moneda(c.totalSaldosPendientes ?? 0)}
          hint={`Abonos: ${moneda(c.totalAbonos ?? 0)}`} icon={<Hourglass size={18} />} />
        <StatCard tone="primary" label="Prendas en tienda" value={Number(inv.totalEnTienda ?? 0)}
          hint={`Recibidas hoy: ${Number(inv.prendasRecibidasHoy ?? 0)}`} icon={<Package size={18} />} />
        <StatCard tone="info" label="Entregadas hoy" value={Number(inv.prendasEntregadasHoy ?? 0)}
          hint={`Órdenes entregadas: ${Number(c.totalEntregadas ?? 0)}`} icon={<Truck size={18} />} />
      </section>

      {/* KPIs del período (rango desde–hasta) */}
      <section>
        <h3 className="mb-3 text-sm font-semibold text-slate-700">Indicadores del período</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
          <StatCard tone="primary" label="Total prendas recibidas" value={Number(res.prendasRecibidas ?? 0)}
            hint="Creadas en el rango" icon={<Package size={18} />} />
          <StatCard tone="info" label="Total prendas entregadas" value={Number(res.prendasEntregadas ?? 0)}
            hint="Entregadas en el rango" icon={<PackageCheck size={18} />} />
          <StatCard tone="primary" label="Prendas en tienda" value={Number(res.prendasEnTienda ?? inv.totalEnTienda ?? 0)}
            hint="Actualmente" icon={<Boxes size={18} />} />
          <StatCard tone="success" label="Ingresos del período" value={moneda(res.ingresosPeriodo ?? 0)}
            hint="Pagos recibidos" icon={<Coins size={18} />} />
          <StatCard tone="warning" label="Saldo por cobrar" value={moneda(res.saldoPendientePorCobrar ?? 0)}
            hint="Pendiente del rango" icon={<Wallet size={18} />} />
        </div>
      </section>

      {/* Contabilidad: ingresos vs gastos = utilidad */}
      <section>
        <h3 className="mb-3 text-sm font-semibold text-slate-700">Contabilidad del período</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard tone="success" label="Ingresos del período" value={moneda(res.ingresosPeriodo ?? 0)}
            hint="Pagos recibidos" icon={<TrendingUp size={18} />} />
          <StatCard tone="danger" label="Gastos del período" value={moneda(res.gastosPeriodo ?? 0)}
            hint="Salidas de dinero" icon={<TrendingDown size={18} />} />
          <StatCard tone={Number(res.utilidadEstimada ?? 0) >= 0 ? 'primary' : 'warning'}
            label="Utilidad estimada" value={moneda(res.utilidadEstimada ?? 0)}
            hint="Ingresos − Gastos" icon={<DollarSign size={18} />} />
        </div>
      </section>

      {/* Prendas por estado (rango) */}
      <section>
        <Card className="overflow-hidden">
          <CardHeader><CardTitle>Prendas por estado (rango)</CardTitle></CardHeader>
          <EstadoTabla
            loading={inventario.isLoading} error={inventario.isError}
            vacio={!inventario.data && !inventario.isLoading}
            vacioTexto="Sin prendas para el rango"
          >
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 p-5">
              {[
                ['Recibidas', inv.porEstado?.RECIBIDO, 'bg-slate-50 text-slate-700'],
                ['En proceso', inv.porEstado?.EN_PROCESO, 'bg-blue-50 text-blue-700'],
                ['Listas', inv.porEstado?.LISTO, 'bg-emerald-50 text-emerald-700'],
                ['Entregadas', inv.porEstado?.ENTREGADO, 'bg-indigo-50 text-indigo-700'],
                ['Garantía', inv.porEstado?.GARANTIA, 'bg-amber-50 text-amber-700']
              ].map(([label, val, cls]) => (
                <div key={String(label)} className={`rounded-xl px-4 py-3 ${cls}`}>
                  <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</p>
                  <p className="mt-1 text-2xl font-bold num">{Number(val ?? 0)}</p>
                </div>
              ))}
            </div>
          </EstadoTabla>
        </Card>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Cierre por método de pago */}
        <Card>
          <CardHeader><CardTitle>Cierre del día por método</CardTitle></CardHeader>
          <EstadoTabla loading={cierre.isLoading} error={cierre.isError} vacio={!cierre.data && !cierre.isLoading}>
            <TableContainer className="border-0 shadow-none rounded-none">
              <Table>
                <TBody>
                  {[
                    ['Efectivo', c.totalEfectivo], ['Nequi', c.totalNequi],
                    ['Daviplata', c.totalDaviplata], ['Transferencia', c.totalTransferencia],
                    ['Total recibido', c.totalRecibido], ['Total vendido', c.totalVendido],
                    ['Abonos', c.totalAbonos], ['Saldos pendientes', c.totalSaldosPendientes]
                  ].map(([k, v]) => (
                    <TR key={String(k)}>
                      <TD className="font-medium text-slate-800">{k}</TD>
                      <TD align="right" className="num font-semibold text-slate-900">{moneda(Number(v ?? 0))}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableContainer>
          </EstadoTabla>
        </Card>

        {/* Cobros por empleado */}
        <Card className="overflow-hidden">
          <CardHeader><CardTitle>Cobros por empleado</CardTitle></CardHeader>
          <EstadoTabla
            loading={cierre.isLoading} error={cierre.isError}
            vacio={(c.porEmpleado ?? []).length === 0}
            vacioTexto="Sin cobros para el filtro seleccionado"
          >
            <TableContainer className="border-0 shadow-none rounded-none">
              <Table>
                <THead><TR><TH>Empleado</TH><TH align="right">Órdenes</TH><TH align="right">Cobrado</TH></TR></THead>
                <TBody>
                  {(c.porEmpleado ?? []).map((e: any) => (
                    <TR key={e.usuario?.id}>
                      <TD className="font-medium text-slate-900">{e.usuario?.nombre}</TD>
                      <TD align="right" className="num">{e.totalOrdenes}</TD>
                      <TD align="right" className="num font-semibold text-success-700">{moneda(e.totalCobrado)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableContainer>
          </EstadoTabla>
        </Card>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Inventario por tipo */}
        <Card className="overflow-hidden">
          <CardHeader><CardTitle>Inventario en tienda</CardTitle></CardHeader>
          <EstadoTabla
            loading={inventario.isLoading} error={inventario.isError}
            vacio={(inv.porTipo ?? []).length === 0}
            vacioTexto="No hay prendas en tienda"
          >
            <TableContainer className="border-0 shadow-none rounded-none">
              <Table>
                <THead><TR><TH>Tipo</TH><TH align="right">Pendientes</TH></TR></THead>
                <TBody>
                  {(inv.porTipo ?? []).map((t: any) => (
                    <TR key={t.tipo}>
                      <TD className="font-mono font-medium text-slate-900">{t.tipo}</TD>
                      <TD align="right" className="num font-semibold">{t.prendas}</TD>
                    </TR>
                  ))}
                  <TR>
                    <TD className="font-semibold text-slate-900">Total en tienda</TD>
                    <TD align="right" className="num font-bold text-primary-700">{Number(inv.totalEnTienda ?? 0)}</TD>
                  </TR>
                </TBody>
              </Table>
            </TableContainer>
          </EstadoTabla>
        </Card>

        {/* Top prendas */}
        <Card className="overflow-hidden">
          <CardHeader><CardTitle>Top prendas (rango)</CardTitle></CardHeader>
          <EstadoTabla loading={resumen.isLoading} error={resumen.isError} vacio={(res.topPrendas ?? []).length === 0}>
            <TableContainer className="border-0 shadow-none rounded-none">
              <Table>
                <THead><TR><TH>Prenda</TH><TH align="right">Cantidad</TH></TR></THead>
                <TBody>
                  {(res.topPrendas ?? []).map((t: any) => (
                    <TR key={t.tipo}>
                      <TD className="font-mono font-medium text-slate-900">{t.tipo}</TD>
                      <TD align="right" className="num font-semibold">{t.cantidad}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableContainer>
          </EstadoTabla>
        </Card>

        {/* Top clientes */}
        <Card className="overflow-hidden">
          <CardHeader><CardTitle>Top clientes (rango)</CardTitle></CardHeader>
          <EstadoTabla loading={resumen.isLoading} error={resumen.isError} vacio={(res.topClientes ?? []).length === 0}>
            <TableContainer className="border-0 shadow-none rounded-none">
              <Table>
                <THead><TR><TH>Cliente</TH><TH align="right">Órdenes</TH><TH align="right">Valor</TH></TR></THead>
                <TBody>
                  {(res.topClientes ?? []).map((t: any) => (
                    <TR key={t.clienteId ?? t.nombre}>
                      <TD className="font-medium text-slate-900">{t.nombre}</TD>
                      <TD align="right" className="num">{t.totalOrdenes}</TD>
                      <TD align="right" className="num font-semibold text-success-700">{moneda(t.valor)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableContainer>
          </EstadoTabla>
        </Card>
      </section>

      {/* Deudas y consolidaciones (punto 9) */}
      <section>
        <h3 className="mb-3 text-sm font-semibold text-slate-700">Deudas y consolidaciones</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard tone="warning" label="Deuda vigente por cobrar" value={moneda(d.deudaVigente ?? 0)}
            hint={`${Number(d.clientesConDeuda ?? 0)} cliente(s)`} icon={<Wallet size={18} />} />
          <StatCard tone="primary" label="Deuda consolidada" value={moneda(d.deudaConsolidada ?? 0)}
            hint={`${Number(d.consolidacionesVigentes ?? 0)} factura(s) migrada(s)`} icon={<Coins size={18} />} />
          <StatCard tone="info" label="Consolidaciones (rango)" value={Number(co.totalConsolidaciones ?? 0)}
            hint="Realizadas en el rango" icon={<TrendingDown size={18} />} />
          <StatCard tone="success" label="Monto consolidado (rango)" value={moneda(co.montoTotal ?? 0)}
            hint="No genera ingreso" icon={<DollarSign size={18} />} />
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Clientes con mayor deuda */}
        <Card className="overflow-hidden">
          <CardHeader><CardTitle>Clientes con mayor deuda</CardTitle></CardHeader>
          <EstadoTabla loading={deudas.isLoading} error={deudas.isError} vacio={(d.clientesConMayorDeuda ?? []).length === 0}
            vacioTexto="Sin deudas pendientes">
            <TableContainer className="border-0 shadow-none rounded-none">
              <Table>
                <THead><TR><TH>Cliente</TH><TH align="right">Facturas</TH><TH align="right">Deuda</TH></TR></THead>
                <TBody>
                  {(d.clientesConMayorDeuda ?? []).map((cl: any) => (
                    <TR key={cl.clienteId ?? cl.nombre}>
                      <TD className="font-medium text-slate-900">
                        {cl.identificador ? <span className="font-mono text-xs text-slate-500 mr-1">{cl.identificador}</span> : null}
                        {cl.nombre}
                      </TD>
                      <TD align="right" className="num">{cl.facturas}</TD>
                      <TD align="right" className="num font-semibold text-amber-700">{moneda(cl.deuda)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableContainer>
          </EstadoTabla>
        </Card>

        {/* Consolidaciones por empleado */}
        <Card className="overflow-hidden">
          <CardHeader><CardTitle>Consolidaciones por empleado (rango)</CardTitle></CardHeader>
          <EstadoTabla loading={consolidaciones.isLoading} error={consolidaciones.isError}
            vacio={(co.porEmpleado ?? []).length === 0} vacioTexto="Sin consolidaciones en el rango">
            <TableContainer className="border-0 shadow-none rounded-none">
              <Table>
                <THead><TR><TH>Empleado</TH><TH align="right">Cantidad</TH><TH align="right">Monto</TH></TR></THead>
                <TBody>
                  {(co.porEmpleado ?? []).map((e: any) => (
                    <TR key={e.usuarioId ?? e.nombre}>
                      <TD className="font-medium text-slate-900">
                        {e.nombre}{e.rol ? <span className="text-slate-400"> ({e.rol})</span> : null}
                      </TD>
                      <TD align="right" className="num">{e.cantidad}</TD>
                      <TD align="right" className="num font-semibold">{moneda(e.monto)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableContainer>
          </EstadoTabla>
        </Card>
      </section>

      <p className="text-xs text-slate-400">
        Conteo de pedidos en el rango — creados: {Number(res.pedidosCreados ?? 0)} ·
        entregados: {Number(res.pedidosEntregados ?? 0)} ·
        pendientes: {Number(res.pedidosPendientes ?? 0)}
      </p>
    </div>
  );
}
