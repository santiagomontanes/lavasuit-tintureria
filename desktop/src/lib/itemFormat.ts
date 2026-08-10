/* Formateo POS de items para recibo HTML, preview React y listas.
 * Lógica espejo de mobile/src/utils/itemFormat.ts — mantener en sincronía.
 *
 * Reglas:
 *  - Prioriza `codigo` (PH, CAM, PD) sobre `nombre` para ahorrar papel.
 *  - Marca: prefiere `marcaCodigo` (NIK), si no `marcaNombre`; si no, vacío.
 *  - Colores: `negro→blanco` si hay ambos distintos; un color si solo uno; vacío si no.
 *  - Observación: solo si tiene contenido.
 *  - NUNCA imprimir etiquetas "Color:" / "Marca:" / "Prenda:".
 */

const limpiar = (v: unknown): string => String(v ?? '').trim();
const colapsar = (v: unknown): string =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export function codigoPrenda(item: any): string {
  const codigo = limpiar(
    item?.codigo ??
    item?.servicio?.codigo ??
    item?.servicioCodigo ??
    ''
  ).toUpperCase();
  if (codigo) return codigo;
  return limpiar(item?.nombre ?? item?.servicio?.nombre ?? item?.servicioNombre ?? '') || 'PRENDA';
}

export function marcaTag(item: any): string {
  const codigo = limpiar(item?.marcaCodigo ?? item?.marca?.codigo ?? '').toUpperCase();
  if (codigo) return codigo;
  return limpiar(item?.marcaNombre ?? item?.marca?.nombre ?? '');
}

export function coloresTexto(
  item: any,
  opts: { ascii?: boolean; upperDestino?: boolean } = {}
): string {
  const flecha = opts.ascii ? ' -> ' : ' → ';
  const actual = limpiar(item?.colorActual ?? item?.color ?? '');
  const deseado = limpiar(item?.colorDeseado ?? item?.colorFinal ?? '');
  // Regla UNIFICADA: si hay color destino, SIEMPRE mostrar "base -> DESTINO",
  // aunque base === destino (ej. "blanco -> BLANCO"). Destino en MAYÚSCULAS.
  // Nunca colapsar a un solo color cuando existe destino.
  if (actual && deseado) return `${actual}${flecha}${deseado.toUpperCase()}`;
  if (deseado) return deseado.toUpperCase();
  return actual || '';
}

export function cantidad(item: any): number {
  const n = Number(item?.cantidad ?? 1);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 1;
}

export function descripcionCompacta(
  item: any,
  opts: { ascii?: boolean; upperDestino?: boolean } = {}
): string {
  const parts: string[] = [];
  parts.push(codigoPrenda(item));
  const marca = marcaTag(item);
  if (marca) parts.push(marca);
  const colores = coloresTexto(item, opts);
  if (colores) parts.push(colores);
  return colapsar(parts.join(' '));
}

export function lineaCompacta(item: any, opts: { ascii?: boolean } = {}): string {
  return `${cantidad(item)} x ${descripcionCompacta(item, opts)}`;
}

export function observacionTexto(item: any): string {
  return colapsar(item?.observaciones ?? item?.observacion ?? item?.nota ?? '');
}
