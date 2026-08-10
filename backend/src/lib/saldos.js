/* Cálculo centralizado del saldo pendiente de un pedido (punto 9).
 *
 * Regla única para TODO el sistema (reportes, caja, recibos, snapshots):
 *  - Si el pedido fue consolidado en otra orden (consolidadoEnPedidoId seteado)
 *    su saldo cuenta como 0: la deuda se migró, no se cobra dos veces.
 *  - "Total a pagar" = total (prendas) + deudaConsolidada (deuda anterior
 *    absorbida). `total` NUNCA incluye la deuda, para no inflar ventas.
 *  - pendiente = max(0, totalAPagar - pagado).
 *
 * Mantener esta lógica en un solo lugar evita descuadres entre módulos.
 */

const sumaPagos = (pedido) =>
  (pedido?.pagos ?? []).reduce((acc, p) => acc + Number(p?.monto ?? 0), 0);

const totalAPagar = (pedido) =>
  Number(pedido?.total ?? 0) + Number(pedido?.deudaConsolidada ?? 0);

/* pagadoOpt permite reusar una suma ya calculada (evita recorrer pagos 2x). */
const pendienteDePedido = (pedido, pagadoOpt) => {
  if (pedido?.consolidadoEnPedidoId) return 0;
  const pagado = pagadoOpt != null ? Number(pagadoOpt) : sumaPagos(pedido);
  return Math.max(0, totalAPagar(pedido) - pagado);
};

module.exports = { sumaPagos, totalAPagar, pendienteDePedido };
