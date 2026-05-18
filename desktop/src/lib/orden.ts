/*
 * Utilidades de orden de recorrido (espejo de backend/src/lib/orden.js).
 *
 * ordenBase : consecutivo base del Excel (52, 53, 55...).
 * subOrden  : 0 para clientes base; 1, 2... para los insertados entre dos.
 * sortKey   : cadena rellenada con ceros que ordena lexicográficamente, de
 *             modo que "52 < 52_1 < 52_2 < 53" con un simple ORDER BY ASC.
 */

const PAD_BASE = 9;
const PAD_SUB = 4;

export function construirSortKey(
  ordenBase: number | null | undefined,
  subOrden: number | null | undefined = 0
): string | null {
  if (ordenBase == null) return null;
  const base = Number(ordenBase);
  if (!Number.isFinite(base)) return null;
  const sub = Number(subOrden);
  const subSafe = Number.isFinite(sub) ? Math.trunc(sub) : 0;
  return `${String(Math.trunc(base)).padStart(PAD_BASE, '0')}.${String(subSafe).padStart(PAD_SUB, '0')}`;
}

export function formatIdentificador(
  ordenBase: number | null | undefined,
  subOrden: number | null | undefined = 0
): string | null {
  if (ordenBase == null) return null;
  const base = Math.trunc(Number(ordenBase));
  if (!Number.isFinite(base)) return null;
  const sub = Math.trunc(Number(subOrden) || 0);
  return sub > 0 ? `${base}_${sub}` : `${base}`;
}

export function parseOrden(
  orden: unknown,
  identificador?: unknown
): { ordenBase: number | null; subOrden: number } {
  for (const fuente of [orden, identificador]) {
    if (fuente == null) continue;
    const txt = String(fuente).trim();
    if (!txt) continue;
    const m = txt.match(/^(\d+)(?:[_.](\d+))?$/);
    if (m) {
      return {
        ordenBase: parseInt(m[1], 10),
        subOrden: m[2] ? parseInt(m[2], 10) : 0
      };
    }
  }
  return { ordenBase: null, subOrden: 0 };
}
