import * as XLSX from 'xlsx';

/*
 * Lectura del Excel de clientes en el desktop.
 * El desktop parsea el archivo y envía las filas como JSON al backend
 * (POST /api/clientes/importar-excel). El backend no necesita manejar archivos.
 *
 * Columnas mínimas esperadas:
 *   identificador_cliente, nombre_cliente, numero_celular, direccion, orden
 */

export interface FilaExcel {
  identificador_cliente: string;
  nombre_cliente: string;
  numero_celular: string;
  direccion: string;
  orden: string;
}

export const COLUMNAS_REQUERIDAS = [
  'identificador_cliente',
  'nombre_cliente',
  'numero_celular',
  'direccion',
  'orden'
] as const;

export interface ResultadoLectura {
  filas: FilaExcel[];
  columnasFaltantes: string[];
}

/* Normaliza un encabezado: minúsculas, sin acentos, espacios -> "_". */
const ACENTOS: Record<string, string> = {
  á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n'
};
const normalizarClave = (k: string): string =>
  String(k)
    .trim()
    .toLowerCase()
    .replace(/[áéíóúüñ]/g, (c) => ACENTOS[c] ?? c)
    .replace(/\s+/g, '_');

const aTexto = (v: unknown): string => (v == null ? '' : String(v).trim());

export async function leerExcelClientes(file: File): Promise<ResultadoLectura> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const hoja = workbook.Sheets[workbook.SheetNames[0]];
  if (!hoja) return { filas: [], columnasFaltantes: [...COLUMNAS_REQUERIDAS] };

  const crudo = XLSX.utils.sheet_to_json<Record<string, unknown>>(hoja, { defval: '' });
  if (crudo.length === 0) return { filas: [], columnasFaltantes: [...COLUMNAS_REQUERIDAS] };

  // Mapa: clave normalizada -> nombre real de columna en el archivo
  const headerMap: Record<string, string> = {};
  for (const key of Object.keys(crudo[0])) {
    headerMap[normalizarClave(key)] = key;
  }

  const columnasFaltantes = COLUMNAS_REQUERIDAS.filter((c) => !(c in headerMap));

  const valor = (row: Record<string, unknown>, col: string): string => {
    const real = headerMap[col];
    return real ? aTexto(row[real]) : '';
  };

  const filas: FilaExcel[] = crudo.map((row) => ({
    identificador_cliente: valor(row, 'identificador_cliente'),
    nombre_cliente:        valor(row, 'nombre_cliente'),
    numero_celular:        valor(row, 'numero_celular'),
    direccion:             valor(row, 'direccion'),
    orden:                 valor(row, 'orden')
  }));

  return { filas, columnasFaltantes };
}
