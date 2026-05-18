import dayjs from 'dayjs';

export type FormatoResumen = 'detallado' | 'corto';

interface OpcionesResumen {
  titulo:    string;
  rango:     string;
  empleado?: string;
  cliente?:  string;
  estado?:   string;
  formato:   FormatoResumen;
  pedidos:   any[];
}

const moneda = (v: number) =>
  `S/ ${Number(v ?? 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const esc = (s: any) => String(s ?? '').replace(/[<>&"]/g, (c) => ({
  '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;'
} as Record<string, string>)[c] ?? c);

const sumPagos = (p: any): number => {
  if (Array.isArray(p?.pagos)) return p.pagos.reduce((a: number, x: any) => a + Number(x?.monto ?? 0), 0);
  return Number(p?.totalPagado ?? p?.pagado ?? 0);
};

const baseCSS = `
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
         color: #0f172a; padding: 24px; margin: 0; font-size: 12px; }
  h1   { font-size: 18px; margin: 0; }
  h2   { font-size: 14px; margin: 18px 0 6px; color: #0f172a; }
  .meta { color: #475569; font-size: 11px; }
  .hdr  { display: flex; justify-content: space-between; align-items: flex-start;
          border-bottom: 1px solid #cbd5e1; padding-bottom: 12px; margin-bottom: 14px; }
  .filtros { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
  .tag { display: inline-block; background: #e2e8f0; color: #334155;
         padding: 2px 8px; border-radius: 999px; font-size: 10px; }
  .totales { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;
             margin: 12px 0 18px; padding: 10px 14px;
             background: #f1f5f9; border-radius: 8px; }
  .totales p { margin: 0; font-size: 11px; color: #475569; }
  .totales strong { display: block; font-size: 14px; color: #0f172a; margin-top: 2px; font-variant-numeric: tabular-nums; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th    { text-align: left; padding: 6px 8px; background: #0f172a; color: #fff; font-weight: 600; }
  td    { padding: 6px 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  tr:nth-child(even) td { background: #f8fafc; }
  .right { text-align: right; font-variant-numeric: tabular-nums; }
  .pill  { display: inline-block; padding: 2px 6px; border-radius: 4px;
           font-size: 9px; font-weight: 700; }
  .pill-r { background: #dbeafe; color: #1e3a8a; }
  .pill-p { background: #fef3c7; color: #92400e; }
  .pill-l { background: #dcfce7; color: #166534; }
  .pill-e { background: #e2e8f0; color: #475569; }
  .pill-c { background: #fee2e2; color: #991b1b; }
  .item   { font-size: 10px; color: #475569; }
  .item strong { color: #0f172a; }
  .ped    { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-bottom: 10px; }
  .ped-hdr { display: flex; justify-content: space-between; align-items: baseline; }
  .ped-hdr h3 { margin: 0; font-size: 13px; }
  .ped-meta { color: #475569; font-size: 10px; }
  .ped-tot  { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;
              margin-top: 8px; font-size: 11px; }
  .ped-tot div { background: #f8fafc; padding: 6px 8px; border-radius: 4px; }
  @media print {
    body { padding: 8px; }
    .ped { page-break-inside: avoid; }
  }
`;

const pillClase = (e: string) => {
  switch (e) {
    case 'RECIBIDO':   return 'pill-r';
    case 'EN_PROCESO': return 'pill-p';
    case 'LISTO':      return 'pill-l';
    case 'ENTREGADO':  return 'pill-e';
    case 'CANCELADO':  return 'pill-c';
    default: return 'pill-e';
  }
};

const num = (p: any): string => p?.numero != null ? `#${p.numero}` : (p?.numeroLocal ?? `#${String(p?.id ?? '').slice(0, 8)}`);

const filaCorta = (p: any): string => {
  const total  = Number(p?.total ?? 0);
  const pagado = sumPagos(p);
  const saldo  = Math.max(0, total - pagado);
  return `
    <tr>
      <td><strong>${esc(num(p))}</strong></td>
      <td>${esc(p?.cliente?.identificador ?? '-')}</td>
      <td>${esc(p?.cliente?.nombre ?? p?.clienteNombre ?? '-')}</td>
      <td class="right">${esc(moneda(total))}</td>
      <td class="right">${esc(moneda(pagado))}</td>
      <td class="right" style="color:${saldo > 0 ? '#92400e' : '#475569'}">${esc(moneda(saldo))}</td>
      <td><span class="pill ${pillClase(p?.estado)}">${esc(p?.estado ?? '-')}</span></td>
      <td>${esc(p?.estado === 'ENTREGADO' ? 'Si' : 'No')}</td>
    </tr>
  `;
};

const bloqueDetallado = (p: any): string => {
  const total  = Number(p?.total ?? 0);
  const pagado = sumPagos(p);
  const saldo  = Math.max(0, total - pagado);
  const fecha  = dayjs(p?.createdAt).format('DD/MM/YYYY HH:mm');
  const items  = Array.isArray(p?.items) ? p.items : [];

  const itemsHtml = items.length === 0 ? '<p class="item">— Sin items —</p>' :
    `<table style="margin-top:8px">
      <thead><tr>
        <th>Prenda / Servicio</th><th>Cant</th><th>Color</th><th>Obs</th>
        <th class="right">Precio</th><th class="right">Subtotal</th>
      </tr></thead>
      <tbody>
        ${items.map((it: any) => `
          <tr>
            <td><strong>${esc(it?.nombre ?? it?.servicio?.nombre ?? it?.servicioNombre ?? '-')}</strong></td>
            <td>${Number(it?.cantidad ?? 1)}</td>
            <td>${esc((it?.colorActual ?? '-') + ' → ' + (it?.colorDeseado ?? '-'))}</td>
            <td class="item">${esc(it?.observaciones ?? '')}</td>
            <td class="right">${esc(moneda(Number(it?.precio ?? 0)))}</td>
            <td class="right">${esc(moneda(Number(it?.subtotal ?? Number(it?.precio ?? 0) * Number(it?.cantidad ?? 1))))}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;

  return `
    <div class="ped">
      <div class="ped-hdr">
        <h3>${esc(num(p))} <span class="pill ${pillClase(p?.estado)}">${esc(p?.estado ?? '-')}</span></h3>
        <span class="ped-meta">${esc(fecha)}</span>
      </div>
      <p class="ped-meta">
        ${esc(p?.cliente?.identificador ? `[${p.cliente.identificador}] ` : '')}
        <strong>${esc(p?.cliente?.nombre ?? p?.clienteNombre ?? '-')}</strong>
        ${p?.cliente?.telefono ? ` · ${esc(p.cliente.telefono)}` : ''}
        ${p?.cliente?.direccion ? ` · ${esc(p.cliente.direccion)}` : ''}
      </p>
      <p class="ped-meta">Empleado: ${esc(p?.usuario?.nombre ?? '-')}</p>
      ${itemsHtml}
      <div class="ped-tot">
        <div><span class="ped-meta">Total</span><br><strong>${esc(moneda(total))}</strong></div>
        <div><span class="ped-meta">Pagado</span><br><strong style="color:#166534">${esc(moneda(pagado))}</strong></div>
        <div><span class="ped-meta">Saldo</span><br><strong style="color:${saldo > 0 ? '#92400e' : '#475569'}">${esc(moneda(saldo))}</strong></div>
      </div>
    </div>
  `;
};

export function printResumenOrdenes(opts: OpcionesResumen): void {
  const totales = opts.pedidos.reduce((acc, p) => {
    const t = Number(p?.total ?? 0);
    const pg = sumPagos(p);
    acc.total += t;
    acc.pagado += pg;
    acc.saldo += Math.max(0, t - pg);
    return acc;
  }, { total: 0, pagado: 0, saldo: 0 });

  const filtros = [
    opts.empleado ? `Empleado: ${opts.empleado}` : null,
    opts.cliente  ? `Cliente: ${opts.cliente}` : null,
    opts.estado   ? `Estado: ${opts.estado}` : null
  ].filter(Boolean);

  const body = opts.formato === 'corto'
    ? `<h2>Listado corto</h2>
       <table>
         <thead><tr>
           <th>#</th><th>ID Cli.</th><th>Cliente</th>
           <th class="right">Ordenado</th><th class="right">Pagado</th>
           <th class="right">Saldo</th><th>Estado</th><th>Entregado</th>
         </tr></thead>
         <tbody>${opts.pedidos.map(filaCorta).join('')}</tbody>
       </table>`
    : `<h2>Detalle por orden</h2>
       ${opts.pedidos.map(bloqueDetallado).join('')}`;

  const html = `<!doctype html>
    <html><head><meta charset="utf-8"><title>${esc(opts.titulo)}</title>
    <style>${baseCSS}</style></head>
    <body>
      <div class="hdr">
        <div>
          <h1>${esc(opts.titulo)}</h1>
          <p class="meta">Rango: ${esc(opts.rango)} · ${opts.pedidos.length} órdenes</p>
          ${filtros.length > 0 ? `<div class="filtros">${filtros.map((f) => `<span class="tag">${esc(f!)}</span>`).join('')}</div>` : ''}
        </div>
        <div class="meta">${esc(dayjs().format('DD/MM/YYYY HH:mm'))}</div>
      </div>
      <div class="totales">
        <p>Órdenes <strong>${opts.pedidos.length}</strong></p>
        <p>Ordenado <strong>${esc(moneda(totales.total))}</strong></p>
        <p>Pagado <strong style="color:#166534">${esc(moneda(totales.pagado))}</strong></p>
        <p>Saldo <strong style="color:#92400e">${esc(moneda(totales.saldo))}</strong></p>
      </div>
      ${opts.pedidos.length === 0 ? '<p class="meta">No hay órdenes para el filtro seleccionado.</p>' : body}
      <script>window.onload = () => setTimeout(() => window.print(), 250);</script>
    </body></html>`;

  const w = window.open('', '_blank', 'width=900,height=900');
  if (!w) {
    alert('No se pudo abrir la ventana de impresión. Permite ventanas emergentes.');
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
