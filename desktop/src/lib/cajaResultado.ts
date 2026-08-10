import { formatCurrencyCOP } from './currency';

/* Presentación clara del cierre de caja (NO cambia cálculos).
 *   diferencia = efectivoContado - efectivoEsperado
 *   < 0 → la lavandería quedó debiendo abs(diferencia)
 *   > 0 → la lavandería entregó diferencia de más
 *   = 0 → caja cuadrada */
export type TonoCaja = 'cuadrada' | 'debe' | 'mas';

export interface ResultadoCaja {
  texto: string;
  corto: string;                       // etiqueta breve para chips/badges
  tono: TonoCaja;
  badge: 'success' | 'danger' | 'info';
}

export function resultadoCaja(diferencia: number | null | undefined): ResultadoCaja | null {
  if (diferencia == null || Number.isNaN(Number(diferencia))) return null;
  const d = Number(diferencia);
  if (Math.abs(d) < 0.01) {
    return { texto: 'Caja cuadrada', corto: 'Cuadrada', tono: 'cuadrada', badge: 'success' };
  }
  if (d < 0) {
    const m = formatCurrencyCOP(Math.abs(d));
    return { texto: `Lavandería quedó debiendo ${m}`, corto: `Debe ${m}`, tono: 'debe', badge: 'danger' };
  }
  const m = formatCurrencyCOP(d);
  return { texto: `Lavandería entregó ${m} de más`, corto: `Entregó ${m} de más`, tono: 'mas', badge: 'info' };
}
