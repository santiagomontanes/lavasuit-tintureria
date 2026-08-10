/* Generador de plantillas Excel de LavaSuit.
 *
 * - Usa exceljs (negrilla, freeze, anchos, merges, fills).
 * - Consulta la BD en vivo (Prisma) para marcas y servicios: NO se inventan
 *   datos. Las marcas/prendas de ejemplo salen exactamente de la base.
 * - Escribe en <repo>/excels.
 * - Al final RE-ABRE cada archivo con exceljs y valida hojas/tamaño/lectura.
 *
 * Columnas (fuente):
 *  - clientes/rutas: desktop/src/lib/excel.ts (COLUMNAS_REQUERIDAS) + backend
 *    clientes.controller.importarExcel.
 *  - prendas: backend importacion.controller.importarPrendas.
 *  - marcas:  backend importacion.controller.importarMarcas.
 *  - gastos:  Prisma Gasto + gastos.schema.js (NO hay importador → referencial).
 */
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const OUT_DIR = path.join(__dirname, '..', '..', 'excels');

// ── estilos ──────────────────────────────────────────────────────────────
const COLOR_HEADER = 'FF0F172A';   // slate-900
const COLOR_HEADER_TXT = 'FFFFFFFF';
const COLOR_EXPL = 'FFF1F5F9';     // slate-100
const COLOR_WARN = 'FFFEF3C7';     // amber-100
const COLOR_WARN_TXT = 'FF92400E'; // amber-800

const aplicarHeader = (ws, headers, rowIdx = 1) => {
  const row = ws.getRow(rowIdx);
  headers.forEach((h, i) => {
    const c = row.getCell(i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: COLOR_HEADER_TXT }, size: 11 };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_HEADER } };
    c.alignment = { vertical: 'middle', horizontal: 'left' };
    c.border = { bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
  });
  row.height = 20;
};

const aplicarFila = (ws, rowIdx, valores, { fill, txtColor, italic } = {}) => {
  const row = ws.getRow(rowIdx);
  valores.forEach((v, i) => {
    const c = row.getCell(i + 1);
    c.value = v;
    if (fill) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
    c.font = { italic: !!italic, color: txtColor ? { argb: txtColor } : undefined, size: 10 };
    c.alignment = { vertical: 'middle', wrapText: true };
  });
};

const banner = (ws, texto, ncols, rowIdx) => {
  ws.mergeCells(rowIdx, 1, rowIdx, ncols);
  const c = ws.getCell(rowIdx, 1);
  c.value = `⚠ ${texto}`;
  c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_WARN } };
  c.font = { bold: true, color: { argb: COLOR_WARN_TXT }, size: 11 };
  c.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
  ws.getRow(rowIdx).height = 28;
};

const anchos = (ws, ws_widths) => {
  ws_widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
};

const freezeTop = (ws, rows = 1) => { ws.views = [{ state: 'frozen', ySplit: rows }]; };

// ── clasificación de servicios reales vs prueba (heurística transparente) ──
const NOMBRES_COHERENTES = new Set([
  'camisa', 'pantalon hombre', 'pantalon dama', 'pantalon mujer', 'camisa formal',
  'edredon doble', 'edredón doble', 'edredon simple', 'edredón simple',
  'lavado + plancha', 'lavado en seco', 'lavado simple', 'terno completo',
  'tintura', 'tinturax', 'tintureria', 'tintorería', 'zapatos', 'prenda x',
  'chaqueta', 'vestido', 'falda'
]);
const esGibberish = (nombre) => {
  const n = String(nombre || '').trim().toLowerCase();
  if (!n) return true;
  if (!/[aeiouáéíóú]/.test(n)) return true;          // sin vocales
  if (/(.)\1{2,}/.test(n)) return true;               // 3+ repetidos (aaa, jsjs no, hhh)
  if (n.length < 3) return true;
  return false;
};
const clasificarServicio = (s) => {
  if (s.codigo) return 'Ejemplo real (catálogo, con código)';
  const n = String(s.nombre || '').trim().toLowerCase();
  if (NOMBRES_COHERENTES.has(n)) return 'Posible real (nombre coherente)';
  if (!esGibberish(n)) return 'Posible real (nombre coherente)';
  return 'Dato de prueba';
};

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const marcas = await prisma.marca.findMany({
    where: { deletedAt: null },
    select: { nombre: true, codigo: true, abreviaturas: true, activo: true },
    orderBy: { nombre: 'asc' }
  });
  const servicios = await prisma.servicio.findMany({
    where: { deletedAt: null },
    select: { nombre: true, codigo: true, categoria: true, precio: true, abreviaturas: true, activo: true },
    orderBy: { nombre: 'asc' }
  });

  // ════════════════════════════════════════════════════════════════════════
  // 1) clientes_importacion.xlsx
  // ════════════════════════════════════════════════════════════════════════
  {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('CLIENTES');
    const headers = ['identificador_cliente', 'nombre_cliente', 'numero_celular', 'direccion', 'orden'];
    aplicarHeader(ws, headers, 1);
    aplicarFila(ws, 2, [
      'Código/identificador del cliente (opcional, ej. 001 o 12_1)',
      'Nombre completo (OBLIGATORIO)',
      'Teléfono — debe ser único (OBLIGATORIO)',
      'Dirección (opcional)',
      'Orden de ruta: número o N_M (ej. 12 o 12_1). Define ordenBase/subOrden'
    ], { fill: COLOR_EXPL, italic: true });
    aplicarFila(ws, 3, ['001', 'Juan Pérez', '3001234567', 'Cra 10 # 5-20', '1']);
    anchos(ws, [24, 28, 18, 30, 28]);
    freezeTop(ws, 1);

    const ref = wb.addWorksheet('REFERENCIA_MODELO_CLIENTE');
    aplicarHeader(ref, ['campo', 'tipo', 'obligatorio', 'se_importa_por_excel', 'descripcion'], 1);
    const filasRef = [
      ['nombre', 'String(100)', 'Sí', 'Sí (nombre_cliente)', 'Nombre del cliente'],
      ['telefono', 'String(20) único', 'Sí', 'Sí (numero_celular)', 'Teléfono único'],
      ['identificador', 'String(40)', 'No', 'Sí (identificador_cliente)', 'Código visible del cliente'],
      ['ordenBase', 'Int', 'No', 'Sí (derivado de orden)', 'Posición base de ruta'],
      ['subOrden', 'Int (def 0)', 'No', 'Sí (derivado de orden, N_M)', 'Sub-posición de ruta'],
      ['sortKey', 'String(40)', 'No', 'Sí (calculado)', 'Clave de ordenamiento de ruta'],
      ['direccion', 'String(255)', 'No', 'Sí (direccion)', 'Dirección'],
      ['email', 'String(150)', 'No', 'NO (solo alta manual)', 'Correo — existe en el modelo, no se importa por Excel'],
      ['notas', 'Text', 'No', 'NO (solo alta manual)', 'Notas — existe en el modelo, no se importa por Excel'],
      ['asignadoAId', 'String (FK Usuario)', 'No', 'NO', 'Empleado dueño de la ruta (se asigna en pantalla Rutas)'],
      ['activo', 'Boolean (def true)', 'No', 'NO', 'Estado del cliente']
    ];
    filasRef.forEach((f, i) => aplicarFila(ref, i + 2, f));
    anchos(ref, [16, 20, 12, 24, 50]);
    freezeTop(ref, 1);

    await wb.xlsx.writeFile(path.join(OUT_DIR, 'clientes_importacion.xlsx'));
  }

  // ════════════════════════════════════════════════════════════════════════
  // 2) prendas_importacion.xlsx
  // ════════════════════════════════════════════════════════════════════════
  {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('PRENDAS');
    const headers = ['codigo', 'nombre', 'categoria', 'precio_base', 'abreviaturas', 'activo'];
    aplicarHeader(ws, headers, 1);
    aplicarFila(ws, 2, [
      'Código corto único (opcional, sirve para upsert)',
      'Nombre de la prenda/servicio (OBLIGATORIO)',
      'Categoría (opcional, texto libre)',
      'Precio base en COP (OBLIGATORIO, >= 0)',
      'Abreviaturas separadas por coma (opcional)',
      '1 = activo, 0 = inactivo'
    ], { fill: COLOR_EXPL, italic: true });
    // Ejemplos REALES de la BD: solo los que tienen código (catálogo curado).
    const coded = servicios.filter((s) => s.codigo);
    const ejemplos = (coded.length ? coded : servicios).slice(0, 3);
    ejemplos.forEach((s, i) => aplicarFila(ws, 3 + i, [
      s.codigo ?? '', s.nombre, s.categoria ?? '', Number(s.precio), s.abreviaturas ?? '', s.activo ? 1 : 0
    ]));
    anchos(ws, [12, 26, 16, 14, 22, 10]);
    freezeTop(ws, 1);

    // Hoja de catálogo real con clasificación (ejemplo real vs prueba).
    const cat = wb.addWorksheet('CATALOGO_BD_PRENDAS');
    banner(cat, 'Inventario REAL en la base de datos. Clasificación automática (heurística) de cuáles parecen reales y cuáles son datos de prueba.', 6, 1);
    aplicarHeader(cat, ['nombre', 'codigo', 'categoria', 'precio', 'activo', 'clasificacion'], 2);
    servicios.forEach((s, i) => aplicarFila(cat, i + 3, [
      s.nombre, s.codigo ?? '', s.categoria ?? '', Number(s.precio), s.activo ? 1 : 0, clasificarServicio(s)
    ]));
    anchos(cat, [26, 12, 16, 14, 10, 36]);
    freezeTop(cat, 2);

    await wb.xlsx.writeFile(path.join(OUT_DIR, 'prendas_importacion.xlsx'));
  }

  // ════════════════════════════════════════════════════════════════════════
  // 3) marcas_importacion.xlsx  (SOLO marcas reales de la BD)
  // ════════════════════════════════════════════════════════════════════════
  {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('MARCAS');
    const headers = ['codigo', 'nombre', 'abreviaturas', 'activo'];
    aplicarHeader(ws, headers, 1);
    aplicarFila(ws, 2, [
      'Código corto único (opcional, sirve para upsert)',
      'Nombre de la marca (OBLIGATORIO)',
      'Abreviaturas separadas por coma (opcional)',
      '1 = activo, 0 = inactivo'
    ], { fill: COLOR_EXPL, italic: true });
    // Ejemplos: EXCLUSIVAMENTE marcas existentes en la BD (sin inventar).
    if (marcas.length === 0) {
      banner(ws, 'No hay marcas en la base de datos para usar como ejemplo.', 4, 3);
    } else {
      marcas.forEach((m, i) => aplicarFila(ws, 3 + i, [
        m.codigo ?? '', m.nombre, m.abreviaturas ?? '', m.activo ? 1 : 0
      ]));
    }
    anchos(ws, [12, 26, 22, 10]);
    freezeTop(ws, 1);

    const cat = wb.addWorksheet('CATALOGO_BD_MARCAS');
    aplicarHeader(cat, ['nombre', 'codigo', 'abreviaturas', 'activo'], 1);
    marcas.forEach((m, i) => aplicarFila(cat, i + 2, [m.nombre, m.codigo ?? '', m.abreviaturas ?? '', m.activo ? 1 : 0]));
    anchos(cat, [26, 12, 22, 10]);
    freezeTop(cat, 1);

    await wb.xlsx.writeFile(path.join(OUT_DIR, 'marcas_importacion.xlsx'));
  }

  // ════════════════════════════════════════════════════════════════════════
  // 4) gastos_importacion.xlsx  (REFERENCIAL — no hay importador)
  // ════════════════════════════════════════════════════════════════════════
  {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('GASTOS');
    const headers = ['fecha', 'concepto', 'categoria', 'valor', 'metodoPago', 'descripcion'];
    banner(ws, 'Esta plantilla es referencial. Actualmente LavaSuit no cuenta con importación masiva de gastos.', headers.length, 1);
    aplicarHeader(ws, headers, 2);
    aplicarFila(ws, 3, [
      'Fecha YYYY-MM-DD (opcional, por defecto hoy)',
      'Concepto corto (OBLIGATORIO)',
      'Categoría (OBLIGATORIO, texto libre)',
      'Valor en COP (OBLIGATORIO, > 0)',
      'Método de pago (opcional): EFECTIVO/NEQUI/DAVIPLATA/TRANSFERENCIA/TARJETA/YAPE/PLIN/OTRO',
      'Descripción larga (opcional)'
    ], { fill: COLOR_EXPL, italic: true });
    aplicarFila(ws, 4, ['2026-06-21', 'Compra de detergente', 'Insumos', 85000, 'EFECTIVO', 'Caneca de 20L']);
    anchos(ws, [16, 26, 18, 14, 40, 30]);
    freezeTop(ws, 2);

    const val = wb.addWorksheet('VALORES_VALIDOS');
    aplicarHeader(val, ['categorias_sugeridas', 'metodos_pago_enum', 'metodos_pago_activos'], 1);
    const categorias = ['Arriendo', 'Servicios públicos', 'Nómina', 'Insumos', 'Bolsas', 'Detergentes', 'Transporte', 'Mantenimiento', 'Otros'];
    const metodos = ['EFECTIVO', 'NEQUI', 'DAVIPLATA', 'TRANSFERENCIA', 'TARJETA', 'YAPE', 'PLIN', 'OTRO'];
    const activos = ['EFECTIVO', 'NEQUI', 'DAVIPLATA', 'TRANSFERENCIA'];
    const maxLen = Math.max(categorias.length, metodos.length, activos.length);
    for (let i = 0; i < maxLen; i++) {
      aplicarFila(val, i + 2, [categorias[i] ?? '', metodos[i] ?? '', activos[i] ?? '']);
    }
    anchos(val, [24, 22, 22]);
    freezeTop(val, 1);

    await wb.xlsx.writeFile(path.join(OUT_DIR, 'gastos_importacion.xlsx'));
  }

  // ════════════════════════════════════════════════════════════════════════
  // 5) rutas_importacion.xlsx  (reutiliza el importador de clientes)
  // ════════════════════════════════════════════════════════════════════════
  {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('RUTAS');
    const headers = ['identificador_cliente', 'nombre_cliente', 'numero_celular', 'direccion', 'orden'];
    aplicarHeader(ws, headers, 1); // fila 1 = headers (necesario para el importador)
    banner(ws, 'La asignación de rutas a empleados se realiza posteriormente desde la pantalla de Rutas. Antes de importar, borre las filas 2, 3 y 4.', headers.length, 2);
    aplicarFila(ws, 3, [
      'Identificador del cliente (opcional)',
      'Nombre (OBLIGATORIO)',
      'Teléfono único (OBLIGATORIO)',
      'Dirección (opcional)',
      'Orden de ruta: N o N_M (ej. 12 o 12_1)'
    ], { fill: COLOR_EXPL, italic: true });
    aplicarFila(ws, 4, ['12', 'María López', '3019876543', 'Calle 8 # 3-15', '12']);
    anchos(ws, [24, 28, 18, 30, 18]);
    freezeTop(ws, 1);

    const ins = wb.addWorksheet('INSTRUCCIONES');
    aplicarHeader(ins, ['tema', 'detalle'], 1);
    const filas = [
      ['Importador', 'Rutas reutiliza el importador de Clientes (misma estructura de columnas).'],
      ['Asignación', 'La asignación de clientes a un empleado se hace en la pantalla de Rutas (no por Excel).'],
      ['Columna orden', 'Acepta "N" o "N_M". Se descompone en ordenBase (N) y subOrden (M) vía backend/src/lib/orden.js.'],
      ['Hoja a importar', 'El sistema lee la PRIMERA hoja del archivo (RUTAS).'],
      ['Antes de importar', 'Eliminar las filas 2, 3 y 4 (advertencia, explicación y ejemplo).']
    ];
    filas.forEach((f, i) => aplicarFila(ins, i + 2, f));
    anchos(ins, [22, 80]);
    freezeTop(ins, 1);

    await wb.xlsx.writeFile(path.join(OUT_DIR, 'rutas_importacion.xlsx'));
  }

  // ════════════════════════════════════════════════════════════════════════
  // 6) reportes_ejemplo.xlsx  (demostrativo, datos ficticios)
  // ════════════════════════════════════════════════════════════════════════
  {
    const wb = new ExcelJS.Workbook();

    const ventas = wb.addWorksheet('Ventas');
    aplicarHeader(ventas, ['fecha', 'total_vendido', 'total_recibido', 'efectivo', 'nequi', 'daviplata', 'transferencia', 'ordenes', 'prendas'], 1);
    [
      ['2026-06-18', 350000, 300000, 180000, 60000, 40000, 20000, 12, 40],
      ['2026-06-19', 420000, 410000, 250000, 90000, 50000, 20000, 15, 55],
      ['2026-06-20', 290000, 290000, 150000, 80000, 30000, 30000, 10, 33]
    ].forEach((f, i) => aplicarFila(ventas, i + 2, f));
    anchos(ventas, [14, 14, 14, 12, 12, 12, 14, 10, 10]);
    freezeTop(ventas, 1);

    const pagos = wb.addWorksheet('Pagos');
    aplicarHeader(pagos, ['fecha', 'orden', 'cliente', 'metodo', 'monto', 'cobrador'], 1);
    [
      ['2026-06-20 09:14', 'ORD-000045', 'Juan Pérez', 'EFECTIVO', 25000, 'Ana'],
      ['2026-06-20 11:02', 'ORD-000046', 'María López', 'NEQUI', 30000, 'Ana'],
      ['2026-06-20 16:40', 'ORD-000047', 'Carlos Ruiz', 'TRANSFERENCIA', 18000, 'Luis']
    ].forEach((f, i) => aplicarFila(pagos, i + 2, f));
    anchos(pagos, [18, 14, 22, 16, 12, 14]);
    freezeTop(pagos, 1);

    const gastos = wb.addWorksheet('Gastos');
    aplicarHeader(gastos, ['fecha', 'concepto', 'categoria', 'valor', 'metodoPago'], 1);
    [
      ['2026-06-20', 'Arriendo local', 'Arriendo', 1200000, 'TRANSFERENCIA'],
      ['2026-06-20', 'Detergente industrial', 'Insumos', 85000, 'EFECTIVO'],
      ['2026-06-20', 'Transporte recolección', 'Transporte', 20000, 'EFECTIVO']
    ].forEach((f, i) => aplicarFila(gastos, i + 2, f));
    anchos(gastos, [14, 26, 16, 14, 16]);
    freezeTop(gastos, 1);

    const util = wb.addWorksheet('Utilidad');
    aplicarHeader(util, ['periodo', 'ingresos', 'gastos', 'utilidad_estimada', 'saldo_por_cobrar'], 1);
    [
      ['2026-06-18', 300000, 50000, 250000, 50000],
      ['2026-06-19', 410000, 60000, 350000, 10000],
      ['2026-06-20', 290000, 1305000, -1015000, 0]
    ].forEach((f, i) => aplicarFila(util, i + 2, f));
    anchos(util, [14, 14, 14, 18, 18]);
    freezeTop(util, 1);

    const ley = wb.addWorksheet('LEYENDA');
    aplicarHeader(ley, ['concepto', 'definicion'], 1);
    [
      ['Ventas', 'Valor total ordenado (prendas) en el período. NO incluye deuda anterior consolidada.'],
      ['Pagos', 'Dinero realmente recibido (abonos) por método de pago. Es el ingreso real.'],
      ['Gastos', 'Egresos registrados en el período (arriendo, insumos, transporte, etc.).'],
      ['Utilidad', 'Utilidad estimada = Ingresos (pagos reales) − Gastos del período.'],
      ['Caja disponible', 'Caja disponible = Ingresos − Gastos (si el flag descontarGastosDeCaja está activo).']
    ].forEach((f, i) => aplicarFila(ley, i + 2, f));
    anchos(ley, [20, 86]);
    freezeTop(ley, 1);

    await wb.xlsx.writeFile(path.join(OUT_DIR, 'reportes_ejemplo.xlsx'));
  }

  // ── VALIDACIÓN: reabrir cada archivo con exceljs ──────────────────────────
  const archivos = [
    'clientes_importacion.xlsx', 'prendas_importacion.xlsx', 'marcas_importacion.xlsx',
    'gastos_importacion.xlsx', 'rutas_importacion.xlsx', 'reportes_ejemplo.xlsx'
  ];
  console.log('\n===== VALIDACIÓN =====');
  for (const nombre of archivos) {
    const ruta = path.join(OUT_DIR, nombre);
    const stat = fs.statSync(ruta);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(ruta);
    const hojas = wb.worksheets.map((w) => `${w.name}(${w.rowCount}f)`);
    console.log(`OK ${nombre} | ${(stat.size / 1024).toFixed(1)} KB | size>0:${stat.size > 0} | hojas: ${hojas.join(', ')}`);
  }

  await prisma.$disconnect();
  console.log('\nMarcas reales usadas:', marcas.map((m) => `${m.nombre}/${m.codigo}`).join(', ') || '(ninguna)');
  console.log('Servicios totales en BD:', servicios.length);
}

main().catch(async (e) => { console.error('ERROR:', e); await prisma.$disconnect(); process.exit(1); });
