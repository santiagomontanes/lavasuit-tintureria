const prisma = require('../lib/prisma');
const asyncHandler = require('../utils/asyncHandler');
const { HttpError } = require('../middlewares/error.middleware');
const ioBus = require('../lib/io');

const COLOR_INCLUDE = {
  creadoPor:      { select: { id: true, nombre: true } },
  actualizadoPor: { select: { id: true, nombre: true } }
};

const sanitizar = (v, max) => {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return max ? s.slice(0, max) : s;
};

const normalizarHex = (v) => {
  const s = sanitizar(v, 9);
  if (!s) return null;
  // Acepta #RGB / #RRGGBB / #RRGGBBAA. Si no, descarta.
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(s) ? s : null;
};

const normalizar = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();

const resolverUsuarioId = async (req) => {
  const id = req.user?.id ?? null;
  if (!id) return null;
  const ok = await prisma.usuario.findUnique({ where: { id }, select: { id: true } });
  return ok ? id : null;
};

exports.listar = asyncHandler(async (req, res) => {
  const incluyeInactivos = String(req.query.incluyeInactivos ?? 'false') === 'true';
  const q = sanitizar(req.query.q, 100);
  const where = { deletedAt: null };
  if (!incluyeInactivos) where.activo = true;
  if (q) {
    where.OR = [
      { nombre: { contains: q } },
      { codigo: { contains: q } }
    ];
  }
  const colores = await prisma.color.findMany({
    where,
    include: COLOR_INCLUDE,
    orderBy: [{ activo: 'desc' }, { nombre: 'asc' }]
  });
  res.json(colores);
});

/* GET /api/colores/autocomplete?q=ne&limit=10
 * Sin abreviaturas, ranking simple: codigo exacto > codigo prefix > nombre prefix > contains. */
exports.autocomplete = asyncHandler(async (req, res) => {
  const q = sanitizar(req.query.q, 60);
  const queryNorm = q ? normalizar(q) : '';
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);

  const candidatos = await prisma.color.findMany({
    where:  { deletedAt: null, activo: true },
    select: { id: true, nombre: true, codigo: true, hex: true },
    take:   500
  });

  if (!queryNorm) {
    return res.json(candidatos.slice(0, limit));
  }

  const score = (c) => {
    const codigoN = normalizar(c.codigo);
    const nombreN = normalizar(c.nombre);
    if (codigoN && codigoN === queryNorm)          return 100;
    if (codigoN && codigoN.startsWith(queryNorm))  return 90;
    if (nombreN === queryNorm)                     return 70;
    if (nombreN.startsWith(queryNorm))             return 60;
    if (nombreN.split(' ').some((w) => w.startsWith(queryNorm))) return 50;
    if (nombreN.includes(queryNorm))               return 30;
    return 0;
  };

  const ranked = candidatos
    .map((c) => ({ c, s: score(c) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.c.nombre.localeCompare(b.c.nombre))
    .slice(0, limit)
    .map((x) => x.c);
  res.json(ranked);
});

exports.obtener = asyncHandler(async (req, res) => {
  const color = await prisma.color.findUnique({
    where:   { id: req.params.id },
    include: COLOR_INCLUDE
  });
  if (!color || color.deletedAt) throw new HttpError(404, 'Color no encontrado');
  res.json(color);
});

const construirDatos = (clean) => {
  const nombre = sanitizar(clean.nombre, 60);
  const codigo = sanitizar(clean.codigo, 30);
  const hex    = normalizarHex(clean.hex);
  const activo = clean.activo === false ? false : true;
  if (!nombre) throw new HttpError(400, 'Nombre requerido');
  return { nombre, codigo, hex, activo };
};

exports.crear = asyncHandler(async (req, res) => {
  const data = construirDatos(req.body || {});
  const usuarioId = await resolverUsuarioId(req);

  const color = await prisma.color.create({
    data:    { ...data, creadoPorId: usuarioId, actualizadoPorId: usuarioId },
    include: COLOR_INCLUDE
  });
  ioBus.emit('color-creado', color);
  res.status(201).json(color);
});

const CAMPOS_EDITABLES = ['nombre', 'codigo', 'hex', 'activo'];

const construirPatch = (body) => {
  const patch = {};
  for (const k of CAMPOS_EDITABLES) {
    if (!Object.prototype.hasOwnProperty.call(body, k)) continue;
    const v = body[k];
    if (k === 'nombre') {
      const s = sanitizar(v, 60);
      if (!s) throw new HttpError(400, 'Nombre requerido');
      patch.nombre = s;
    } else if (k === 'codigo')  patch.codigo = sanitizar(v, 30);
    else if   (k === 'hex')     patch.hex    = normalizarHex(v);
    else if   (k === 'activo')  patch.activo = v === true || v === 'true';
  }
  return patch;
};

const actualizarComun = async (req, res) => {
  const patch = construirPatch(req.body || {});
  if (Object.keys(patch).length === 0) throw new HttpError(400, 'No hay cambios para aplicar');
  patch.actualizadoPorId = await resolverUsuarioId(req);

  let color;
  try {
    color = await prisma.color.update({
      where:   { id: req.params.id },
      data:    patch,
      include: COLOR_INCLUDE
    });
  } catch (e) {
    if (e?.code === 'P2025') throw new HttpError(404, 'Color no encontrado');
    throw e;
  }
  ioBus.emit('color-actualizado', color);
  res.json(color);
};

exports.actualizar    = asyncHandler(actualizarComun);
exports.actualizarPut = asyncHandler(actualizarComun);

exports.desactivar = asyncHandler(async (req, res) => {
  const usuarioId = await resolverUsuarioId(req);
  let color;
  try {
    color = await prisma.color.update({
      where: { id: req.params.id },
      data:  { activo: false, deletedAt: new Date(), actualizadoPorId: usuarioId },
      include: COLOR_INCLUDE
    });
  } catch (e) {
    if (e?.code === 'P2025') throw new HttpError(404, 'Color no encontrado');
    throw e;
  }
  ioBus.emit('color-eliminado', { id: color.id });
  res.json({ mensaje: 'Color desactivado', color });
});
