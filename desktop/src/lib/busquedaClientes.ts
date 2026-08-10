/* Búsqueda de clientes — espejo exacto de mobile/src/utils/busquedaClientes.ts.
 *
 *   NÚMEROS → se busca por CÓDIGO/identificador.
 *   LETRAS  → se busca por NOMBRE.
 *   Nunca por teléfono.
 *
 * El término se compara como TEXTO: "007" no se convierte a 7, así que los
 * códigos con ceros a la izquierda siguen funcionando.
 */

export type ModoBusquedaCliente = 'codigo' | 'nombre' | 'vacio';

export function modoBusquedaCliente(termino: string): ModoBusquedaCliente {
  const t = String(termino ?? '').trim();
  if (!t) return 'vacio';
  return /^[0-9]+(?:[_.][0-9]+)?$/.test(t) ? 'codigo' : 'nombre';
}

const normalizar = (v: unknown): string =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

const codigoComparable = (v: unknown): string => String(v ?? '').trim().replace(/\./g, '_');

export function clienteCoincide(cliente: any, termino: string): boolean {
  const modo = modoBusquedaCliente(termino);
  if (modo === 'vacio') return true;

  if (modo === 'codigo') {
    const codigo = codigoComparable(cliente?.identificador);
    if (!codigo) return false;
    return codigo.includes(codigoComparable(termino));
  }

  return normalizar(cliente?.nombre).includes(normalizar(termino));
}

/** Filtra y ordena por relevancia: exacto → empieza por → contiene. */
export function filtrarClientes<T>(lista: T[], termino: string): T[] {
  const modo = modoBusquedaCliente(termino);
  if (modo === 'vacio') return lista;

  const t = modo === 'codigo' ? codigoComparable(termino) : normalizar(termino);

  const puntaje = (c: any): number => {
    const valor = modo === 'codigo' ? codigoComparable(c?.identificador) : normalizar(c?.nombre);
    if (!valor) return 99;
    if (valor === t) return 0;
    if (valor.startsWith(t)) return 1;
    return 2;
  };

  return lista
    .filter((c) => clienteCoincide(c, termino))
    .map((c, i) => ({ c, i, p: puntaje(c) }))
    .sort((a, b) => (a.p - b.p) || (a.i - b.i))
    .map(({ c }) => c);
}
