/* Utilidades de normalización y match de abreviaturas para autocomplete POS.
 *
 * - normalizar:      remueve acentos, baja a minúsculas y comprime espacios.
 * - parsearAbrev:    convierte "cam, ca, c" → ['cam','ca','c'] (deduplicado, min).
 * - serializarAbrev: convierte array → string CSV canónico para guardar en DB.
 * - matchAbrev:      true si alguna abreviatura empieza por el query (prefix).
 * - matchNombre:     true si el nombre (normalizado) empieza por el query o
 *                    cualquier palabra interior empieza por el query.
 *
 * Diseñado para ranking prefix-first típico de un POS rápido. */

const normalizar = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const parsearAbrev = (input) => {
  if (input == null) return [];
  const raw = Array.isArray(input) ? input.join(',') : String(input);
  const partes = raw
    .split(/[,;|\s]+/)
    .map((p) => normalizar(p).replace(/[^a-z0-9]/g, ''))
    .filter(Boolean);
  return Array.from(new Set(partes)).slice(0, 16);
};

const serializarAbrev = (arr) => {
  const norm = parsearAbrev(arr);
  return norm.length ? norm.join(',') : null;
};

const matchAbrev = (abreviaturasCsv, queryNorm) => {
  if (!abreviaturasCsv || !queryNorm) return false;
  const lista = String(abreviaturasCsv).split(',').map((s) => s.trim()).filter(Boolean);
  return lista.some((a) => a.startsWith(queryNorm));
};

const matchNombre = (nombre, queryNorm) => {
  const n = normalizar(nombre);
  if (!n || !queryNorm) return false;
  if (n.startsWith(queryNorm)) return true;
  return n.split(' ').some((w) => w.startsWith(queryNorm));
};

/* Score más alto = mejor match. Usado para ordenar resultados de autocomplete. */
const score = (item, queryNorm) => {
  if (!queryNorm) return 0;
  if (item.codigo && normalizar(item.codigo) === queryNorm) return 100;
  if (item.codigo && normalizar(item.codigo).startsWith(queryNorm)) return 90;
  if (matchAbrev(item.abreviaturas, queryNorm)) return 80;
  const n = normalizar(item.nombre);
  if (n === queryNorm)        return 70;
  if (n.startsWith(queryNorm)) return 60;
  if (n.split(' ').some((w) => w.startsWith(queryNorm))) return 50;
  return 0;
};

module.exports = {
  normalizar,
  parsearAbrev,
  serializarAbrev,
  matchAbrev,
  matchNombre,
  score
};
