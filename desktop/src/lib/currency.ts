/* Helper central de moneda para TODO el desktop de LavaSuit.
 *
 * LavaSuit opera en pesos colombianos (COP). El formato colombiano usa el
 * punto como separador de miles y normalmente NO muestra centavos:
 *   23000  ->  "$23.000"
 *
 * Reglas:
 *  - No altera valores numéricos en BD ni en cálculos; es solo presentación.
 *  - Redondea a entero (COP no maneja centavos en recibos/reportes), igual que
 *    el recibo térmico del mobile, para mantener consistencia entre apps.
 *  - Usar SIEMPRE este helper en pantallas/exportes en vez de repetir lógica.
 */
export function formatCurrencyCOP(valor: number | string | null | undefined): string {
  const n = Number(valor ?? 0);
  const seguro = Number.isFinite(n) ? n : 0;
  return `$${Math.round(seguro).toLocaleString('es-CO')}`;
}
