/*
 * Utilidades de orden de recorrido.
 *
 * Un cliente tiene:
 *  - ordenBase : consecutivo base del Excel (52, 53, 55...).
 *  - subOrden  : 0 para clientes base; 1, 2, 3... para los insertados entre dos.
 *
 * El identificador visible es "52" (subOrden 0) o "52_1" (subOrden 1).
 * El sortKey es una cadena rellenada con ceros que ordena lexicográficamente:
 *   52 -> "000000052.0000"
 *   52_1 -> "000000052.0001"
 *   53 -> "000000053.0000"
 * Así "52 < 52_1 < 52_2 < 53" funciona con un simple ORDER BY sortKey ASC.
 */

const PAD_BASE = 9;
const PAD_SUB = 4;

function construirSortKey(ordenBase, subOrden = 0) {
  if (ordenBase == null || ordenBase === '') return null;
  const base = Number(ordenBase);
  if (!Number.isFinite(base)) return null;
  const sub = Number(subOrden);
  const subSafe = Number.isFinite(sub) ? Math.trunc(sub) : 0;
  return `${String(Math.trunc(base)).padStart(PAD_BASE, '0')}.${String(subSafe).padStart(PAD_SUB, '0')}`;
}

function formatIdentificador(ordenBase, subOrden = 0) {
  if (ordenBase == null || ordenBase === '') return null;
  const base = Math.trunc(Number(ordenBase));
  if (!Number.isFinite(base)) return null;
  const sub = Math.trunc(Number(subOrden) || 0);
  return sub > 0 ? `${base}_${sub}` : `${base}`;
}

/*
 * Deriva { ordenBase, subOrden } a partir del valor de la columna `orden`
 * y, como respaldo, del `identificador_cliente`. Acepta "52", "52_1" y "52.1".
 */
function parseOrden(orden, identificador) {
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

module.exports = { construirSortKey, formatIdentificador, parseOrden };
