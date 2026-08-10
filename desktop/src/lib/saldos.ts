/* Cálculo de saldos de un pedido para el desktop. Espejo del helper único del
 * backend (backend/src/lib/saldos.js) para que detalle, caja, clientes y recibos
 * usen exactamente la misma regla y no se descuadren.
 *
 *  - "Total a pagar" = total (prendas) + deudaConsolidada (deuda anterior
 *    absorbida por esta orden). `total` NUNCA incluye la deuda.
 *  - Si el pedido es ORIGEN consolidado (consolidadoEnPedidoId seteado) su saldo
 *    cuenta como 0: la deuda se migró al destino y se cobra allá.
 *  - pendiente = max(0, totalAPagar - pagado).
 */

export function sumaPagos(pedido: any): number {
  return (pedido?.pagos ?? []).reduce((acc: number, p: any) => acc + Number(p?.monto ?? 0), 0);
}

export function totalAPagar(pedido: any): number {
  return Number(pedido?.total ?? 0) + Number(pedido?.deudaConsolidada ?? 0);
}

export function pendienteDePedido(pedido: any, pagadoOpt?: number): number {
  if (pedido?.consolidadoEnPedidoId) return 0;
  const pagado = pagadoOpt != null ? Number(pagadoOpt) : sumaPagos(pedido);
  return Math.max(0, totalAPagar(pedido) - pagado);
}
