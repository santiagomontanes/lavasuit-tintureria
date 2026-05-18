import React from 'react';
import dayjs from 'dayjs';
import { printHtml } from '../../utils/print';

const moneda = (v: number) =>
  `S/ ${Number(v ?? 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export type TipoRecibo = 'cliente' | 'vendedor';

interface Props {
  pedido: any;
  tipo:   TipoRecibo;
  pagado: number;
}

// ─── Generador de HTML para impresión ────────────────────────────────────────

export function generarHtmlRecibo(pedido: any, tipo: TipoRecibo, pagado: number): string {
  const total    = Number(pedido?.total ?? 0);
  const saldo    = Math.max(0, total - pagado);
  const cliente  = pedido?.cliente ?? {};
  const items    = pedido?.items  ?? [];
  const pagos    = pedido?.pagos  ?? [];
  const empleado = pedido?.usuario?.nombre ?? '—';
  const numero   = pedido?.numero ?? pedido?.id?.slice(0, 8) ?? '—';
  const fecha    = dayjs(pedido?.createdAt).format('DD/MM/YYYY HH:mm');

  const esCliente = tipo === 'cliente';
  const titulo    = esCliente ? 'RECIBO DE ORDEN' : 'COPIA RECOLECTOR / VENDEDOR';

  const filaItems = items.map((it: any) => `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">${it.nombre ?? it.servicio?.nombre ?? '—'}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:center;">${it.cantidad}</td>
      ${esCliente ? `
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">${it.colorActual ?? '—'}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">${it.colorDeseado ?? '—'}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">${it.observaciones ?? ''}</td>
      ` : `
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">${it.colorActual ?? '—'} → ${it.colorDeseado ?? '—'}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">${it.observaciones ?? ''}</td>
      `}
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right;">${moneda(Number(it.subtotal ?? 0))}</td>
    </tr>
  `).join('');

  const filaPagos = pagos.map((p: any) => `
    <tr>
      <td style="padding:4px 8px;">${p.metodo}</td>
      <td style="padding:4px 8px;text-align:right;font-weight:600;">${moneda(Number(p.monto))}</td>
      <td style="padding:4px 8px;color:#64748b;">${dayjs(p.createdAt).format('DD/MM HH:mm')}</td>
      ${!esCliente ? `<td style="padding:4px 8px;color:#64748b;">${p.usuario?.nombre ?? '—'}</td>` : ''}
    </tr>
  `).join('');

  const headersItems = esCliente
    ? '<th>Prenda / Servicio</th><th>Cant.</th><th>Color actual</th><th>Color deseado</th><th>Obs.</th><th>Subtotal</th>'
    : '<th>Prenda / Servicio</th><th>Cant.</th><th>Colores</th><th>Obs. internas</th><th>Subtotal</th>';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>${titulo} #${numero}</title>
  <style>
    @page { size: A4; margin: 18mm 18mm 22mm 18mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11.5px; color: #1a1a1a; line-height: 1.45; }
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
    hr { border: none; border-top: 2px solid #0f172a; margin: 10px 0; }
    .hr-thin { border: none; border-top: 1px solid #e2e8f0; margin: 8px 0; }
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
                    border-bottom: 1px solid #f1f5f9; font-size: 12px; }
    .total-row.main { border-bottom: 2px solid #0f172a; padding: 8px 0; font-weight: 900; font-size: 14px; }
    .total-row.saldo { font-weight: 900; color: ${saldo > 0.001 ? '#b45309' : '#15803d'}; }
    .estado-badge { display: inline-block; padding: 4px 14px; border-radius: 20px; font-size: 12px;
                    font-weight: 900; margin-top: 8px;
                    background: ${saldo < 0.001 ? '#dcfce7' : '#fef3c7'};
                    color: ${saldo < 0.001 ? '#15803d' : '#92400e'}; }
    .politicas { margin-top: 18px; padding: 12px; background: #f8fafc; border: 1px solid #e2e8f0;
                 border-radius: 6px; font-size: 10.5px; color: #475569; }
    .firma-box { margin-top: 18px; display: flex; gap: 30px; }
    .firma-linea { flex: 1; text-align: center; }
    .firma-linea .linea { border-bottom: 1px solid #334155; margin-bottom: 4px; height: 32px; }
    .firma-linea p { font-size: 10px; color: #64748b; }
    .control-interno { margin-top: 18px; padding: 10px 12px; background: #fffbeb;
                       border: 1px dashed #fcd34d; border-radius: 6px; }
    .control-interno p { font-size: 10.5px; color: #78350f; margin-bottom: 4px; font-weight: 700; }
    .control-interno .linea-ctrl { border-bottom: 1px dashed #fcd34d; height: 22px; margin-top: 8px; }
    @media print {
      body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    }
  </style>
</head>
<body>

  <!-- Encabezado -->
  <div class="header">
    <div>
      <div class="empresa-nombre">LavaSuit</div>
      <div class="empresa-sub">Servicio de lavandería profesional</div>
    </div>
    <div class="recibo-titulo">
      <h2>${titulo}</h2>
      <div class="num-orden">#${numero}</div>
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
      <div class="campo"><label>Teléfono</label><span>${cliente.telefono ?? '—'}</span></div>
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
          <td colspan="${esCliente ? 4 : 3}" style="padding:6px 8px;text-align:right;font-weight:700;">
            ${items.reduce((acc: number, it: any) => acc + Number(it.cantidad), 0)} prendas
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- Totales -->
  <div class="totales-grid">
    <div>
      <div class="seccion-titulo">Resumen financiero</div>
      <div class="total-row main"><span>Valor total ordenado</span><span>${moneda(total)}</span></div>
      <div class="total-row"><span>Abono / Pagos recibidos</span><span style="color:#15803d;font-weight:700;">${moneda(pagado)}</span></div>
      <div class="total-row saldo"><span>Saldo pendiente</span><span>${moneda(saldo)}</span></div>
      <div><span class="estado-badge">${saldo < 0.001 ? '✓ PAGADO' : 'PENDIENTE DE PAGO'}</span></div>
    </div>

    ${pagos.length > 0 ? `
    <div>
      <div class="seccion-titulo">Pagos recibidos</div>
      <table>
        <thead>
          <tr>
            <th>Método</th><th style="text-align:right">Monto</th><th>Fecha</th>
            ${!esCliente ? '<th>Cobrador</th>' : ''}
          </tr>
        </thead>
        <tbody>${filaPagos}</tbody>
      </table>
    </div>
    ` : '<div></div>'}
  </div>

  ${esCliente ? `
  <!-- Políticas -->
  <div class="politicas">
    <strong>Políticas de entrega:</strong>
    Presentar este recibo al momento de recoger sus prendas. No nos hacemos responsables por prendas
    no reclamadas después de 30 días. En caso de cualquier inconformidad, comunicarse dentro de las
    48 horas de recibida la entrega.
  </div>
  <div class="firma-box">
    <div class="firma-linea">
      <div class="linea"></div>
      <p>Firma del cliente / Recibido conforme</p>
    </div>
    <div class="firma-linea">
      <div class="linea"></div>
      <p>Sello / Firma LavaSuit</p>
    </div>
  </div>
  ` : `
  <!-- Control interno -->
  ${pedido?.notas ? `<div class="seccion"><div class="seccion-titulo">Observaciones del pedido</div><p style="font-size:11px;color:#334155;">${pedido.notas}</p></div>` : ''}
  <div class="control-interno">
    <p>Control interno — uso exclusivo recolector</p>
    <div style="display:flex;gap:20px;margin-top:6px;">
      <div style="flex:1">
        <div style="font-size:10px;color:#92400e;">Estado de sincronización</div>
        <div style="font-weight:700;">${pedido?.sincronizado ? 'Sincronizado ✓' : 'Pendiente de sincronización'}</div>
      </div>
      <div style="flex:1">
        <div style="font-size:10px;color:#92400e;">ID sistema</div>
        <div style="font-family:monospace;font-size:10px;">${pedido?.id?.slice(0, 16) ?? '—'}…</div>
      </div>
    </div>
    <div class="linea-ctrl"></div>
    <div class="linea-ctrl"></div>
  </div>
  `}

</body>
</html>`;
}

// ─── Componente React para preview ───────────────────────────────────────────

export default function ReciboPedido({ pedido, tipo, pagado }: Props) {
  const total  = Number(pedido?.total ?? 0);
  const saldo  = Math.max(0, total - pagado);
  const items  = pedido?.items   ?? [];
  const pagos  = pedido?.pagos   ?? [];
  const cliente = pedido?.cliente ?? {};
  const esCliente = tipo === 'cliente';

  return (
    <div className="font-sans text-sm text-slate-900 max-w-2xl mx-auto">
      {/* Encabezado */}
      <div className="flex justify-between items-start mb-4">
        <div>
          <p className="text-2xl font-black text-slate-900 tracking-tight">LavaSuit</p>
          <p className="text-xs text-slate-500">Servicio de lavandería profesional</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            {esCliente ? 'Recibo de orden' : 'Copia recolector / vendedor'}
          </p>
          <p className="text-2xl font-black text-sky-600">#{pedido?.numero ?? '—'}</p>
          <p className="text-xs text-slate-500">
            {dayjs(pedido?.createdAt).format('DD/MM/YYYY HH:mm')}
          </p>
        </div>
      </div>

      <div className={`inline-block text-xs font-bold uppercase tracking-wide px-3 py-1 rounded-full mb-3
        ${esCliente ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
        {esCliente ? 'Copia cliente' : 'Copia interna'}
      </div>
      <hr className="border-slate-900 border-t-2 mb-4" />

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
          <div><span className="text-xs text-slate-500">Teléfono</span><p className="font-semibold">{cliente.telefono ?? '—'}</p></div>
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
              {esCliente ? (
                <>
                  <th className="p-2 text-left">Color actual</th>
                  <th className="p-2 text-left">Color deseado</th>
                  <th className="p-2 text-left">Observación</th>
                </>
              ) : (
                <>
                  <th className="p-2 text-left">Colores</th>
                  <th className="p-2 text-left">Observaciones</th>
                </>
              )}
              <th className="p-2 text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it: any, i: number) => (
              <tr key={it.id ?? i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                <td className="p-2 border-b border-slate-100">{it.nombre ?? it.servicio?.nombre ?? '—'}</td>
                <td className="p-2 border-b border-slate-100 text-center">{it.cantidad}</td>
                {esCliente ? (
                  <>
                    <td className="p-2 border-b border-slate-100">{it.colorActual ?? '—'}</td>
                    <td className="p-2 border-b border-slate-100">{it.colorDeseado ?? '—'}</td>
                    <td className="p-2 border-b border-slate-100 text-slate-500">{it.observaciones ?? ''}</td>
                  </>
                ) : (
                  <>
                    <td className="p-2 border-b border-slate-100">{it.colorActual ?? '—'} → {it.colorDeseado ?? '—'}</td>
                    <td className="p-2 border-b border-slate-100 text-slate-500">{it.observaciones ?? ''}</td>
                  </>
                )}
                <td className="p-2 border-b border-slate-100 text-right font-medium">{moneda(Number(it.subtotal))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totales */}
      <div className="grid grid-cols-2 gap-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Resumen financiero</p>
          <div className="space-y-1 border-t-2 border-slate-900 pt-2">
            <div className="flex justify-between text-sm font-bold">
              <span>Valor total ordenado</span><span>{moneda(total)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Pagos recibidos</span>
              <span className="text-green-700 font-semibold">{moneda(pagado)}</span>
            </div>
            <div className={`flex justify-between text-sm font-bold pt-1 border-t border-slate-200 ${saldo > 0.001 ? 'text-amber-700' : 'text-green-700'}`}>
              <span>Saldo pendiente</span><span>{moneda(saldo)}</span>
            </div>
          </div>
          <div className={`mt-2 text-xs font-bold uppercase px-3 py-1 rounded-full inline-block
            ${saldo < 0.001 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
            {saldo < 0.001 ? '✓ Pagado' : 'Pendiente de pago'}
          </div>
        </div>

        {pagos.length > 0 && (
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Pagos recibidos</p>
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-100">
                  <th className="p-1 text-left">Método</th>
                  <th className="p-1 text-right">Monto</th>
                </tr>
              </thead>
              <tbody>
                {pagos.map((p: any, i: number) => (
                  <tr key={p.id ?? i} className="border-b border-slate-100">
                    <td className="p-1">{p.metodo}</td>
                    <td className="p-1 text-right font-semibold">{moneda(Number(p.monto))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {esCliente ? (
        <>
          <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-500">
            <strong>Políticas:</strong> Presentar este recibo al recoger las prendas. No nos hacemos responsables
            por prendas no reclamadas después de 30 días. Inconformidades reportar en 48 horas.
          </div>
          <div className="mt-4 flex gap-8">
            <div className="flex-1 text-center">
              <div className="h-8 border-b border-slate-400 mb-1"></div>
              <p className="text-xs text-slate-500">Firma del cliente / Recibido conforme</p>
            </div>
            <div className="flex-1 text-center">
              <div className="h-8 border-b border-slate-400 mb-1"></div>
              <p className="text-xs text-slate-500">Sello / Firma LavaSuit</p>
            </div>
          </div>
        </>
      ) : (
        <>
          {pedido?.notas && (
            <div className="mt-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-1">Observaciones</p>
              <p className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded p-2">{pedido.notas}</p>
            </div>
          )}
          <div className="mt-4 p-3 bg-amber-50 border border-dashed border-amber-300 rounded-lg">
            <p className="text-xs font-bold text-amber-800 mb-2">Control interno</p>
            <div className="flex gap-6 text-xs text-amber-700">
              <div>
                <p className="text-amber-600">Sincronización</p>
                <p className="font-semibold">{pedido?.sincronizado ? 'Sincronizado ✓' : 'Pendiente'}</p>
              </div>
              <div>
                <p className="text-amber-600">ID sistema</p>
                <p className="font-mono">{pedido?.id?.slice(0, 16) ?? '—'}…</p>
              </div>
            </div>
            <div className="mt-2 border-b border-dashed border-amber-300 pt-5"></div>
            <div className="mt-1 border-b border-dashed border-amber-300 pt-5"></div>
          </div>
        </>
      )}
    </div>
  );
}
