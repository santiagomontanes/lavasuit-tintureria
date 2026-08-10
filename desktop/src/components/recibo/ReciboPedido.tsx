import React from 'react';
import dayjs from 'dayjs';
import { codigoPrenda, marcaTag, coloresTexto, observacionTexto } from '../../lib/itemFormat';

import { formatCurrencyCOP } from '../../lib/currency';
const moneda = formatCurrencyCOP;

export type TipoRecibo = 'cliente' | 'vendedor';

interface Props {
  pedido: any;
  tipo:   TipoRecibo;
  pagado: number;
  /** Flag de Opciones Avanzadas: si es false, oculta el nombre de la empresa
   *  (deja solo fecha/encabezado). Default true = comportamiento actual. */
  mostrarNombre?: boolean;
  /** Flag: si es true, muestra el desglose de la deuda consolidada y el "Total
   *  a pagar". Default false. Solo afecta visualización. */
  mostrarConsolidada?: boolean;
}

/* Resumen económico unificado (puntos 1 y 9).
 *  - total factura = valor de las prendas (pedido.total).
 *  - deuda anterior = pedido.deudaConsolidada (deuda consolidada en esta orden).
 *  - total a pagar = total factura + deuda anterior.
 *  - abono = pagos recibidos.
 *  - deuda = total factura - abono (de esta orden).
 *  - saldo total = total a pagar - abono (obligación final pendiente). */
export function calcResumenRecibo(pedido: any, pagado: number) {
  const totalFactura  = Number(pedido?.total ?? 0);
  const deudaAnterior = Number(pedido?.deudaConsolidada ?? 0);
  const totalAPagar   = totalFactura + deudaAnterior;
  const abono         = Number(pagado ?? 0);
  // Factura ORIGEN consolidada: su saldo se migró a la orden destino y se cobra
  // allá. Aquí se muestra saldo 0 y la referencia a la factura destino.
  const esOrigenConsolidado = !!pedido?.consolidadoEnPedidoId;
  const consolidadoEnNumero = pedido?.consolidadoEn?.numero ?? null;
  // Nota: la línea "DEUDA" se eliminó del ticket impreso a pedido del cliente.
  const saldoTotal    = esOrigenConsolidado ? 0 : Math.max(0, totalAPagar - abono);
  return {
    totalFactura, deudaAnterior, totalAPagar, abono, saldoTotal,
    esOrigenConsolidado, consolidadoEnNumero
  };
}

const encargadoTexto = (pedido: any): string =>
  (pedido?.encargadoEntrega && String(pedido.encargadoEntrega).trim()) || 'No registrado';

/* Desglose de la deuda anterior consolidada (filas ConsolidacionDeuda). */
function consolidacionesDe(pedido: any): any[] {
  return pedido?.consolidacionesDestino ?? pedido?.consolidaciones ?? [];
}

// ─── Generador de HTML para impresión ────────────────────────────────────────

export function generarHtmlRecibo(
  pedido: any, tipo: TipoRecibo, pagado: number,
  opts: { mostrarNombre?: boolean; mostrarConsolidada?: boolean } = {}
): string {
  const mostrarNombre = opts.mostrarNombre !== false;
  const mostrarConsolidada = opts.mostrarConsolidada === true;
  const r        = calcResumenRecibo(pedido, pagado);
  const cliente  = pedido?.cliente ?? {};
  const items    = pedido?.items  ?? [];
  const pagos    = pedido?.pagos  ?? [];
  const empleado = pedido?.usuario?.nombre ?? '—';
  const numero   = pedido?.numero ?? pedido?.id?.slice(0, 8) ?? '—';
  const fecha    = dayjs(pedido?.createdAt).format('DD/MM/YYYY HH:mm');
  const hayDeuda = r.deudaAnterior > 0.001;
  const consolidaciones = consolidacionesDe(pedido);

  const esCliente = tipo === 'cliente';
  const titulo    = esCliente ? 'RECIBO DE ORDEN' : 'COPIA RECOLECTOR / VENDEDOR';

  const filaItems = items.map((it: any) => {
    const codigo  = codigoPrenda(it);
    const marca   = marcaTag(it);
    const colores = coloresTexto(it, { upperDestino: true });
    const obs     = observacionTexto(it);
    const prendaCell = `<strong>${codigo}</strong>${marca ? ` <span style="color:#64748b">${marca}</span>` : ''}`;
    return `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">${prendaCell}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:center;">${it.cantidad}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">${colores}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;color:#64748b;">${obs}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right;">${moneda(Number(it.subtotal ?? 0))}</td>
    </tr>
  `;
  }).join('');

  // En recibo vendedor NO se imprime el método de pago (a pedido del cliente).
  const filaPagos = pagos.map((p: any) => `
    <tr>
      ${esCliente ? `<td style="padding:4px 8px;">${p.metodo}</td>` : ''}
      <td style="padding:4px 8px;text-align:right;font-weight:600;">${moneda(Number(p.monto))}</td>
      <td style="padding:4px 8px;color:#64748b;">${dayjs(p.createdAt).format('DD/MM HH:mm')}</td>
      ${!esCliente ? `<td style="padding:4px 8px;color:#64748b;">${p.usuario?.nombre ?? '—'}</td>` : ''}
    </tr>
  `).join('');

  const headersItems =
    '<th>Prenda</th><th>Cant.</th><th>Colores</th><th>Obs.</th><th>Subtotal</th>';

  const filasConsolidacion = consolidaciones.map((c: any) => {
    const ord = c?.pedidoOrigen?.numero != null
      ? `Factura #${c.pedidoOrigen.numero}`
      : (c?.pedidoOrigen?.numeroLocal ?? 'Factura anterior');
    return `<div class="total-row"><span>${ord}</span><span>${moneda(Number(c.montoConsolidado ?? 0))}</span></div>`;
  }).join('');

  // Bloque de resumen económico (puntos 1 y 9). El flag mostrarConsolidada solo
  // afecta la VISUALIZACIÓN (Total a pagar + desglose); los números no cambian.
  const lineaAbono = `<div class="total-row"><span>Abono</span><span style="color:#15803d;font-weight:700;">${moneda(r.abono)}</span></div>`;
  const lineaDeudaAnterior = `<div class="total-row"><span>Deuda anterior</span><span style="color:#b45309;font-weight:700;">${moneda(r.deudaAnterior)}</span></div>`;
  const resumenHtml = `
    <div class="seccion-titulo">Resumen financiero</div>
    <div class="total-row main"><span>Total factura</span><span>${moneda(r.totalFactura)}</span></div>
    ${hayDeuda ? (mostrarConsolidada ? `
      ${lineaDeudaAnterior}
      <div class="total-row main"><span>Total a pagar</span><span>${moneda(r.totalAPagar)}</span></div>
      ${lineaAbono}
    ` : `
      ${lineaDeudaAnterior}
      ${lineaAbono}
    `) : `
      ${lineaAbono}
    `}
    <div class="total-row saldo"><span>Saldo total</span><span>${moneda(r.saldoTotal)}</span></div>
    ${r.esOrigenConsolidado
      ? `<div style="margin-top:6px;font-size:11px;font-weight:700;color:#92400e;">Saldo consolidado en factura ${r.consolidadoEnNumero != null ? `#${r.consolidadoEnNumero}` : 'destino'}</div>`
      : `<div><span class="estado-badge">${r.saldoTotal < 0.001 ? '✓ PAGADO' : 'PENDIENTE DE PAGO'}</span></div>`}
  `;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>${titulo}${esCliente ? '' : ` #${numero}`}</title>
  <style>
    @page { size: A4; margin: 18mm 18mm 22mm 18mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 12.5px; color: #1a1a1a; line-height: 1.45; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
    .empresa-nombre { font-size: 22px; font-weight: 900; color: #0f172a; letter-spacing: -0.5px; }
    .empresa-sub    { font-size: 11px; color: #64748b; margin-top: 2px; }
    .recibo-titulo  { text-align: right; }
    .recibo-titulo h2 { font-size: 15px; font-weight: 900; text-transform: uppercase; color: #0f172a; }
    .recibo-titulo .num-orden { font-size: 22px; font-weight: 900; color: #0284c7; margin-top: 2px; }
    .recibo-titulo .fecha     { font-size: 11px; color: #64748b; margin-top: 2px; }
    .tipo-badge {
      display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 10px;
      font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 14px;
      background: ${esCliente ? '#dcfce7' : '#fef3c7'};
      color: ${esCliente ? '#15803d' : '#92400e'};
    }
    hr { border: none; border-top: 3px solid #0f172a; margin: 12px 0; }
    .hr-thin { border: none; border-top: 2px solid #64748b; margin: 8px 0; }
    .seccion { margin-bottom: 16px; }
    .seccion-titulo { font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px;
                      color: #64748b; margin-bottom: 6px; }
    .cliente-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 20px; }
    .cliente-id   { font-size: 28px; font-weight: 900; color: #0f172a; letter-spacing: -1px;
                    margin: 8px 0; padding: 8px 12px; background: #f1f5f9;
                    border-radius: 6px; display: inline-block; }
    .campo label  { font-size: 10px; color: #64748b; display: block; }
    .campo span   { font-weight: 600; color: #1e293b; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #0f172a; color: #fff; padding: 7px 8px; text-align: left; font-size: 10px;
         text-transform: uppercase; letter-spacing: 0.4px; }
    .totales-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 20px; margin-top: 12px; }
    .total-row    { display: flex; justify-content: space-between; padding: 5px 0;
                    border-bottom: 1px solid #cbd5e1; font-size: 13px; }
    .total-row.main { border-bottom: 3px solid #0f172a; padding: 8px 0; font-weight: 900; font-size: 15px; }
    .total-row.saldo { font-weight: 900; color: ${r.saldoTotal > 0.001 ? '#b45309' : '#15803d'}; }
    .estado-badge { display: inline-block; padding: 4px 14px; border-radius: 20px; font-size: 12px;
                    font-weight: 900; margin-top: 8px;
                    background: ${r.saldoTotal < 0.001 ? '#dcfce7' : '#fef3c7'};
                    color: ${r.saldoTotal < 0.001 ? '#15803d' : '#92400e'}; }
    .politicas { margin-top: 18px; padding: 12px; background: #f8fafc; border: 1px solid #e2e8f0;
                 border-radius: 6px; font-size: 11px; color: #475569; }
    .consolidacion { margin-top: 12px; padding: 10px 12px; background: #fffbeb;
                     border: 1px solid #fcd34d; border-radius: 6px; }
    .consolidacion .titulo { font-size: 11px; font-weight: 900; color: #92400e; margin-bottom: 6px;
                             text-transform: uppercase; letter-spacing: 0.4px; }
    @media print {
      body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    }
  </style>
</head>
<body>

  <!-- Encabezado -->
  <div class="header">
    <div>
      ${mostrarNombre ? `<div class="empresa-nombre">LavaSuit</div>
      <div class="empresa-sub">Servicio de lavandería profesional</div>` : ''}
    </div>
    <div class="recibo-titulo">
      <h2>${titulo}</h2>
      ${esCliente ? '' : `<div class="num-orden">#${numero}</div>`}
      <div class="fecha">${fecha}</div>
    </div>
  </div>
  <div class="tipo-badge">${esCliente ? 'Copia cliente' : 'Copia interna'}</div>
  <hr/>

  <!-- Info cliente -->
  <div class="seccion">
    <div class="seccion-titulo">Cliente</div>
    ${cliente.identificador ? `<div class="cliente-id">${cliente.identificador}</div>` : ''}
    <div class="cliente-grid">
      <div class="campo"><label>Nombre</label><span>${cliente.nombre ?? '—'}</span></div>
      <div class="campo"><label>Encargado</label><span>${encargadoTexto(pedido)}</span></div>
      <div class="campo"><label>Teléfono</label><span>${cliente.telefono ?? '—'}</span></div>
      <div class="campo"><label>Cantidad de prendas</label><span>${items.reduce((acc: number, it: any) => acc + Number(it.cantidad), 0)}</span></div>
      ${cliente.direccion ? `<div class="campo" style="grid-column:1/-1"><label>Dirección</label><span>${cliente.direccion}</span></div>` : ''}
    </div>
  </div>
  ${!esCliente ? `
  <div class="seccion">
    <div class="seccion-titulo">Recolector / Vendedor</div>
    <div class="campo"><span>${empleado}</span></div>
  </div>
  ` : ''}

  <!-- Detalle de prendas -->
  <div class="seccion">
    <div class="seccion-titulo">Detalle de prendas / servicios</div>
    <table>
      <thead><tr>${headersItems}</tr></thead>
      <tbody>
        ${filaItems}
        <tr>
          <td colspan="2" style="padding:6px 8px;text-align:right;font-size:10px;color:#64748b;">Total prendas</td>
          <td colspan="3" style="padding:6px 8px;text-align:right;font-weight:700;">
            ${items.reduce((acc: number, it: any) => acc + Number(it.cantidad), 0)} prendas
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  ${hayDeuda && mostrarConsolidada && consolidaciones.length > 0 ? `
  <div class="consolidacion">
    <div class="titulo">Deuda anterior consolidada</div>
    ${filasConsolidacion}
    <div class="total-row main" style="border-bottom:none;"><span>Total consolidado</span><span>${moneda(r.deudaAnterior)}</span></div>
  </div>
  ` : ''}

  <hr/>
  <!-- Totales -->
  <div class="totales-grid">
    <div>
      ${resumenHtml}
    </div>

    ${pagos.length > 0 ? `
    <div>
      <div class="seccion-titulo">Pagos recibidos</div>
      <table>
        <thead>
          <tr>
            ${esCliente ? '<th>Método</th>' : ''}<th style="text-align:right">Monto</th><th>Fecha</th>
            ${!esCliente ? '<th>Cobrador</th>' : ''}
          </tr>
        </thead>
        <tbody>${filaPagos}</tbody>
      </table>
    </div>
    ` : '<div></div>'}
  </div>

  <hr/>
  ${esCliente ? `
  <!-- Políticas -->
  <div class="politicas">
    <strong>Políticas de entrega:</strong>
    Presentar este recibo al momento de recoger sus prendas. No nos hacemos responsables por prendas
    no reclamadas después de 30 días. En caso de cualquier inconformidad, comunicarse dentro de las
    48 horas de recibida la entrega.
  </div>
  ` : `
  ${pedido?.notas ? `<div class="seccion"><div class="seccion-titulo">Observaciones del pedido</div><p style="font-size:11px;color:#334155;">${pedido.notas}</p></div>` : ''}
  `}

  <div style="margin-top:14px;padding-top:8px;border-top:2px solid #64748b;text-align:center;font-size:9px;color:#94a3b8;line-height:1.4;">
    Software diseñado por <strong style="color:#64748b">SISTETECNI</strong><br/>
    LavaSuit — Software para Tintorerías y Lavanderías
  </div>

</body>
</html>`;
}

// ─── Componente React para preview ───────────────────────────────────────────

export default function ReciboPedido({ pedido, tipo, pagado, mostrarNombre = true, mostrarConsolidada = false }: Props) {
  const r       = calcResumenRecibo(pedido, pagado);
  const items   = pedido?.items   ?? [];
  const pagos   = pedido?.pagos   ?? [];
  const cliente = pedido?.cliente ?? {};
  const esCliente = tipo === 'cliente';
  const hayDeuda  = r.deudaAnterior > 0.001;
  const consolidaciones = consolidacionesDe(pedido);
  const totalPrendas = items.reduce((acc: number, it: any) => acc + Number(it.cantidad), 0);

  return (
    <div className="font-sans text-sm text-slate-900 max-w-2xl mx-auto">
      {/* Encabezado */}
      <div className="flex justify-between items-start mb-4">
        <div>
          {mostrarNombre && (
            <>
              <p className="text-2xl font-black text-slate-900 tracking-tight">LavaSuit</p>
              <p className="text-xs text-slate-500">Servicio de lavandería profesional</p>
            </>
          )}
        </div>
        <div className="text-right">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            {esCliente ? 'Recibo de orden' : 'Copia recolector / vendedor'}
          </p>
          {!esCliente && <p className="text-2xl font-black text-sky-600">#{pedido?.numero ?? '—'}</p>}
          <p className="text-xs text-slate-500">
            {dayjs(pedido?.createdAt).format('DD/MM/YYYY HH:mm')}
          </p>
        </div>
      </div>

      <div className={`inline-block text-xs font-bold uppercase tracking-wide px-3 py-1 rounded-full mb-3
        ${esCliente ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
        {esCliente ? 'Copia cliente' : 'Copia interna'}
      </div>
      <hr className="border-slate-900 border-t-[3px] mb-4" />

      {/* Cliente */}
      <div className="mb-4">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Cliente</p>
        {cliente.identificador && (
          <p className="text-3xl font-black text-slate-900 bg-slate-100 inline-block px-3 py-1 rounded-lg mb-2 tracking-tight">
            {cliente.identificador}
          </p>
        )}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          <div><span className="text-xs text-slate-500">Nombre</span><p className="font-semibold">{cliente.nombre ?? '—'}</p></div>
          <div><span className="text-xs text-slate-500">Encargado</span><p className="font-semibold">{encargadoTexto(pedido)}</p></div>
          <div><span className="text-xs text-slate-500">Teléfono</span><p className="font-semibold">{cliente.telefono ?? '—'}</p></div>
          <div><span className="text-xs text-slate-500">Cantidad de prendas</span><p className="font-semibold">{totalPrendas}</p></div>
          {cliente.direccion && (
            <div className="col-span-2"><span className="text-xs text-slate-500">Dirección</span><p className="font-semibold">{cliente.direccion}</p></div>
          )}
        </div>
      </div>

      {!esCliente && (
        <div className="mb-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-1">Recolector / Vendedor</p>
          <p className="font-semibold">{pedido?.usuario?.nombre ?? '—'}</p>
        </div>
      )}

      {/* Items */}
      <div className="mb-4">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Prendas / Servicios</p>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-slate-900 text-white">
              <th className="p-2 text-left">Prenda</th>
              <th className="p-2 text-center">Cant.</th>
              <th className="p-2 text-left">Colores</th>
              <th className="p-2 text-left">Obs.</th>
              <th className="p-2 text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it: any, i: number) => {
              const codigo  = codigoPrenda(it);
              const marca   = marcaTag(it);
              const colores = coloresTexto(it, { upperDestino: true });
              const obs     = observacionTexto(it);
              return (
                <tr key={it.id ?? i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  <td className="p-2 border-b border-slate-100">
                    <strong>{codigo}</strong>
                    {marca ? <span className="text-slate-500"> {marca}</span> : null}
                  </td>
                  <td className="p-2 border-b border-slate-100 text-center">{it.cantidad}</td>
                  <td className="p-2 border-b border-slate-100">{colores}</td>
                  <td className="p-2 border-b border-slate-100 text-slate-500">{obs}</td>
                  <td className="p-2 border-b border-slate-100 text-right font-medium">{moneda(Number(it.subtotal))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {hayDeuda && mostrarConsolidada && consolidaciones.length > 0 && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-300 rounded-lg">
          <p className="text-xs font-bold uppercase tracking-wide text-amber-800 mb-2">Deuda anterior consolidada</p>
          {consolidaciones.map((c: any, i: number) => (
            <div key={c.id ?? i} className="flex justify-between text-sm">
              <span>{c?.pedidoOrigen?.numero != null ? `Factura #${c.pedidoOrigen.numero}` : (c?.pedidoOrigen?.numeroLocal ?? 'Factura anterior')}</span>
              <span>{moneda(Number(c.montoConsolidado ?? 0))}</span>
            </div>
          ))}
          <div className="flex justify-between text-sm font-black border-t border-amber-300 mt-1 pt-1">
            <span>Total consolidado</span><span>{moneda(r.deudaAnterior)}</span>
          </div>
        </div>
      )}

      <hr className="border-slate-900 border-t-[3px] my-4" />
      {/* Totales */}
      <div className="grid grid-cols-2 gap-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Resumen financiero</p>
          <div className="space-y-1 border-t-2 border-slate-900 pt-2">
            <div className="flex justify-between text-sm font-black">
              <span>Total factura</span><span>{moneda(r.totalFactura)}</span>
            </div>
            {hayDeuda && (
              <div className="flex justify-between text-sm">
                <span className="text-amber-700">Deuda anterior</span>
                <span className="text-amber-700 font-semibold">{moneda(r.deudaAnterior)}</span>
              </div>
            )}
            {hayDeuda && mostrarConsolidada ? (
              <>
                <div className="flex justify-between text-sm font-black border-t border-slate-200 pt-1">
                  <span>Total a pagar</span><span>{moneda(r.totalAPagar)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Abono</span>
                  <span className="text-green-700 font-semibold">{moneda(r.abono)}</span>
                </div>
              </>
            ) : (
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Abono</span>
                <span className="text-green-700 font-semibold">{moneda(r.abono)}</span>
              </div>
            )}
            <div className={`flex justify-between text-sm font-black pt-1 border-t border-slate-200 ${r.saldoTotal > 0.001 ? 'text-amber-700' : 'text-green-700'}`}>
              <span>Saldo total</span><span>{moneda(r.saldoTotal)}</span>
            </div>
          </div>
          {r.esOrigenConsolidado ? (
            <div className="mt-2 text-xs font-bold text-amber-700">
              Saldo consolidado en factura {r.consolidadoEnNumero != null ? `#${r.consolidadoEnNumero}` : 'destino'}
            </div>
          ) : (
            <div className={`mt-2 text-xs font-bold uppercase px-3 py-1 rounded-full inline-block
              ${r.saldoTotal < 0.001 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
              {r.saldoTotal < 0.001 ? '✓ Pagado' : 'Pendiente de pago'}
            </div>
          )}
        </div>

        {pagos.length > 0 && (
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Pagos recibidos</p>
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-100">
                  {esCliente && <th className="p-1 text-left">Método</th>}
                  <th className="p-1 text-right">Monto</th>
                </tr>
              </thead>
              <tbody>
                {pagos.map((p: any, i: number) => (
                  <tr key={p.id ?? i} className="border-b border-slate-100">
                    {esCliente && <td className="p-1">{p.metodo}</td>}
                    <td className="p-1 text-right font-semibold">{moneda(Number(p.monto))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {esCliente ? (
        <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-500">
          <strong>Políticas:</strong> Presentar este recibo al recoger las prendas. No nos hacemos responsables
          por prendas no reclamadas después de 30 días. Inconformidades reportar en 48 horas.
        </div>
      ) : (
        pedido?.notas && (
          <div className="mt-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-1">Observaciones</p>
            <p className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded p-2">{pedido.notas}</p>
          </div>
        )
      )}
      <div className="mt-4 pt-2 border-t border-slate-200 text-center text-[9px] text-slate-400 leading-tight">
        Software diseñado por <strong className="text-slate-500">SISTETECNI</strong><br/>
        LavaSuit — Software para Tintorerías y Lavanderías
      </div>
    </div>
  );
}
