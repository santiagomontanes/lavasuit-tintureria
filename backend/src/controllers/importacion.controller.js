const xlsx = require('xlsx');
const prisma = require('../lib/prisma');
const asyncHandler = require('../utils/asyncHandler');
const { HttpError } = require('../middlewares/error.middleware');
const ioBus = require('../lib/io');
const { serializarAbrev } = require('../lib/abreviaturas');

/* Lee el primer worksheet o uno específico y devuelve filas como objetos
 * usando la PRIMERA fila como headers normalizados (lowercase sin acentos).
 * Tolera ausencia de hoja con el nombre exacto: usa la primera hoja si no
 * encuentra match exacto, para facilitar el import desde Excel/Numbers/etc. */
const leerHoja = (buffer, nombreHoja) => {
  const wb = xlsx.read(buffer, { type: 'buffer', cellDates: false });
  const hojaExacta = wb.SheetNames.find(
    (n) => n.toLowerCase().trim() === String(nombreHoja || '').toLowerCase().trim()
  );
  const sheetName = hojaExacta || wb.SheetNames[0];
  if (!sheetName) throw new HttpError(400, 'Excel sin hojas legibles');
  const ws = wb.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json(ws, {
    header: 1, defval: null, raw: false, blankrows: false
  });
  if (rows.length === 0) return { headers: [], filas: [] };

  const headers = rows[0].map((h) =>
    String(h ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '')
      .toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
  );
  const filas = rows.slice(1)
    .map((arr, i) => {
      const obj = { __filaExcel: i + 2 };
      headers.forEach((h, idx) => { if (h) obj[h] = arr[idx]; });
      return obj;
    })
    .filter((obj) => Object.values(obj).some((v) => v != null && String(v).trim() !== ''));
  return { headers, filas };
};

const txt = (v, max) => {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return max ? s.slice(0, max) : s;
};
const num = (v) => {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(',', '.').replace(/[^\d.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
};
const bool = (v) => {
  if (v == null || v === '') return true;
  const s = String(v).trim().toLowerCase();
  return !(s === '0' || s === 'false' || s === 'no' || s === 'inactivo');
};

/* POST /api/servicios/importar-excel
 * Formato esperado, HOJA "prendas":
 *   codigo | nombre | categoria | precio_base | activo
 * El parser tolera variaciones: precio, precio_base; activo en {1,0,si,no,true,false}.
 * Upsert por (codigo, deletedAt=null). Devuelve reporte detallado. */
exports.importarPrendas = asyncHandler(async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Archivo Excel requerido (campo "archivo")');
  const { filas } = leerHoja(req.file.buffer, 'prendas');
  if (filas.length === 0) throw new HttpError(400, 'Hoja "prendas" vacía o sin datos');

  const usuarioId = req.user?.id ?? null;
  const reporte = { total: filas.length, creadas: 0, actualizadas: 0, errores: [] };

  for (const fila of filas) {
    try {
      const codigo       = txt(fila.codigo, 30);
      const nombre       = txt(fila.nombre, 100);
      const categoria    = txt(fila.categoria, 60);
      const precioRaw    = fila.precio_base ?? fila.precio;
      const precio       = num(precioRaw);
      const abreviaturas = serializarAbrev(fila.abreviaturas);
      const activo       = bool(fila.activo);

      if (!nombre)              throw new Error('nombre vacío');
      if (precio == null)       throw new Error('precio_base inválido');
      if (precio < 0)           throw new Error('precio_base negativo');

      // Match: si hay código y existe → update; si no, create.
      let existente = null;
      if (codigo) {
        existente = await prisma.servicio.findFirst({
          where: { codigo, deletedAt: null }
        });
      }

      if (existente) {
        await prisma.servicio.update({
          where: { id: existente.id },
          data:  {
            nombre, categoria, precio,
            abreviaturas: abreviaturas ?? existente.abreviaturas,
            activo,
            actualizadoPorId: usuarioId
          }
        });
        reporte.actualizadas++;
      } else {
        await prisma.servicio.create({
          data: {
            nombre, categoria, precio,
            codigo, abreviaturas,
            unidad: 'prenda',
            activo,
            creadoPorId: usuarioId,
            actualizadoPorId: usuarioId
          }
        });
        reporte.creadas++;
      }
    } catch (e) {
      reporte.errores.push({ fila: fila.__filaExcel, error: e.message });
    }
  }

  console.log('[importar-prendas]', {
    total: reporte.total, creadas: reporte.creadas,
    actualizadas: reporte.actualizadas, errores: reporte.errores.length
  });
  ioBus.emit('servicios-importados', { total: reporte.total });
  res.json(reporte);
});

/* POST /api/marcas/importar-excel
 * HOJA "marcas": codigo | nombre | activo
 * Upsert por (codigo, deletedAt=null). */
exports.importarMarcas = asyncHandler(async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Archivo Excel requerido (campo "archivo")');
  const { filas } = leerHoja(req.file.buffer, 'marcas');
  if (filas.length === 0) throw new HttpError(400, 'Hoja "marcas" vacía o sin datos');

  const usuarioId = req.user?.id ?? null;
  const reporte = { total: filas.length, creadas: 0, actualizadas: 0, errores: [] };

  for (const fila of filas) {
    try {
      const codigo       = txt(fila.codigo, 30);
      const nombre       = txt(fila.nombre, 100);
      const abreviaturas = serializarAbrev(fila.abreviaturas);
      const activo       = bool(fila.activo);

      if (!nombre) throw new Error('nombre vacío');

      let existente = null;
      if (codigo) {
        existente = await prisma.marca.findFirst({
          where: { codigo, deletedAt: null }
        });
      }

      if (existente) {
        await prisma.marca.update({
          where: { id: existente.id },
          data:  { nombre, abreviaturas: abreviaturas ?? existente.abreviaturas, activo, actualizadoPorId: usuarioId }
        });
        reporte.actualizadas++;
      } else {
        await prisma.marca.create({
          data: { nombre, codigo, abreviaturas, activo, creadoPorId: usuarioId, actualizadoPorId: usuarioId }
        });
        reporte.creadas++;
      }
    } catch (e) {
      reporte.errores.push({ fila: fila.__filaExcel, error: e.message });
    }
  }

  console.log('[importar-marcas]', {
    total: reporte.total, creadas: reporte.creadas,
    actualizadas: reporte.actualizadas, errores: reporte.errores.length
  });
  ioBus.emit('marcas-importadas', { total: reporte.total });
  res.json(reporte);
});

/* GET /api/servicios/plantilla-excel
 * Devuelve un xlsx vacío con headers y una fila ejemplo. */
exports.plantillaPrendas = asyncHandler(async (req, res) => {
  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.aoa_to_sheet([
    ['codigo', 'nombre', 'categoria', 'precio_base', 'abreviaturas', 'activo'],
    ['cam', 'Camisa', 'lavado', 8000, 'cam,c', 1],
    ['ph',  'Pantalón Hombre', 'tintura', 18000, 'ph,p', 1],
    ['pd',  'Pantalón Dama',   'tintura', 16000, 'pd', 1]
  ]);
  xlsx.utils.book_append_sheet(wb, ws, 'prendas');
  const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="plantilla_prendas.xlsx"');
  res.send(buf);
});

exports.plantillaMarcas = asyncHandler(async (req, res) => {
  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.aoa_to_sheet([
    ['codigo', 'nombre', 'abreviaturas', 'activo'],
    ['z',  'Zara',  'z,za',  1],
    ['ni', 'Nike',  'ni,nik', 1]
  ]);
  xlsx.utils.book_append_sheet(wb, ws, 'marcas');
  const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="plantilla_marcas.xlsx"');
  res.send(buf);
});
