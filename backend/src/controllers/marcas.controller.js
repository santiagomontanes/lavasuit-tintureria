const prisma = require('../lib/prisma');
const asyncHandler = require('../utils/asyncHandler');
const { HttpError } = require('../middlewares/error.middleware');
const ioBus = require('../lib/io');
const {
  pickSyncMeta, stripSyncMeta, payloadHash,
  findOperation, createOperation, logDuplicate
} = require('../lib/idempotency');
const { serializarAbrev, normalizar, score } = require('../lib/abreviaturas');

const MARCA_INCLUDE = {
  creadoPor:      { select: { id: true, nombre: true } },
  actualizadoPor: { select: { id: true, nombre: true } }
};

const sanitizar = (v, max) => {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return max ? s.slice(0, max) : s;
};

const resolverUsuarioId = async (req) => {
  const id = req.user?.id ?? null;
  if (!id) return null;
  const ok = await prisma.usuario.findUnique({ where: { id }, select: { id: true } });
  return ok ? id : null;
};

exports.listar = asyncHandler(async (req, res) => {
  const incluyeInactivas = String(req.query.incluyeInactivas ?? 'false') === 'true';
  const q = sanitizar(req.query.q, 100);
  const where = { deletedAt: null };
  if (!incluyeInactivas) where.activo = true;
  if (q) {
    where.OR = [
      { nombre:       { contains: q } },
      { codigo:       { contains: q } },
      { abreviaturas: { contains: q } }
    ];
  }
  const marcas = await prisma.marca.findMany({
    where,
    include: MARCA_INCLUDE,
    orderBy: [{ activo: 'desc' }, { nombre: 'asc' }]
  });
  res.json(marcas);
});

/* Endpoint optimizado para autocomplete POS.
 * - Si no hay query: devuelve top 20 alfabético.
 * - Si hay query: filtra y rankea por prefix (código > abreviatura > nombre). */
exports.autocomplete = asyncHandler(async (req, res) => {
  const q = sanitizar(req.query.q, 60);
  const queryNorm = q ? normalizar(q) : '';
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);

  const candidatas = await prisma.marca.findMany({
    where:  { deletedAt: null, activo: true },
    select: { id: true, nombre: true, codigo: true, abreviaturas: true },
    take:   500
  });

  if (!queryNorm) {
    return res.json(candidatas.slice(0, limit));
  }
  const ranked = candidatas
    .map((m) => ({ m, s: score(m, queryNorm) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.m.nombre.localeCompare(b.m.nombre))
    .slice(0, limit)
    .map((x) => x.m);
  res.json(ranked);
});

exports.obtener = asyncHandler(async (req, res) => {
  const marca = await prisma.marca.findUnique({
    where:   { id: req.params.id },
    include: MARCA_INCLUDE
  });
  if (!marca || marca.deletedAt) throw new HttpError(404, 'Marca no encontrada');
  res.json(marca);
});

const construirCrear = (clean) => {
  const nombre       = sanitizar(clean.nombre, 100);
  const codigo       = sanitizar(clean.codigo, 30);
  const abreviaturas = serializarAbrev(clean.abreviaturas);
  const activo       = clean.activo === false ? false : true;
  if (!nombre) throw new HttpError(400, 'Nombre requerido');
  return { nombre, codigo, abreviaturas, activo };
};

exports.crear = asyncHandler(async (req, res) => {
  const meta = pickSyncMeta(req.body);
  if (meta?.invalid) throw new HttpError(400, 'clientMutationId y deviceId deben enviarse juntos');

  if (meta) {
    const op = await findOperation(prisma, meta);
    if (op) {
      logDuplicate(op);
      const existente = await prisma.marca.findUnique({ where: { id: op.entityId }, include: MARCA_INCLUDE });
      if (existente) return res.status(200).json(existente);
    }
  }

  const clean = stripSyncMeta(req.body);
  const data  = construirCrear(clean);
  const usuarioId = await resolverUsuarioId(req);

  const marca = await prisma.$transaction(async (tx) => {
    const creada = await tx.marca.create({
      data: { ...data, creadoPorId: usuarioId, actualizadoPorId: usuarioId },
      include: MARCA_INCLUDE
    });
    if (meta) {
      await createOperation(tx, meta, {
        entityType:  'MARCA',
        entityId:    creada.id,
        action:      'CREATE',
        payloadHash: payloadHash(clean)
      });
    }
    return creada;
  });

  ioBus.emit('marca-creada', marca);
  res.status(201).json(marca);
});

const CAMPOS_EDITABLES = ['nombre', 'codigo', 'abreviaturas', 'activo'];

const construirPatch = (body) => {
  const patch = {};
  for (const k of CAMPOS_EDITABLES) {
    if (!Object.prototype.hasOwnProperty.call(body, k)) continue;
    const v = body[k];
    if (k === 'nombre') {
      const s = sanitizar(v, 100);
      if (!s) throw new HttpError(400, 'Nombre requerido');
      patch.nombre = s;
    } else if (k === 'codigo')       patch.codigo       = sanitizar(v, 30);
    else if  (k === 'abreviaturas')  patch.abreviaturas = serializarAbrev(v);
    else if  (k === 'activo')        patch.activo       = v === true || v === 'true';
  }
  return patch;
};

const actualizarComun = async (req, res) => {
  const patch = construirPatch(req.body || {});
  if (Object.keys(patch).length === 0) throw new HttpError(400, 'No hay cambios para aplicar');
  patch.actualizadoPorId = await resolverUsuarioId(req);

  let marca;
  try {
    marca = await prisma.marca.update({
      where:   { id: req.params.id },
      data:    patch,
      include: MARCA_INCLUDE
    });
  } catch (e) {
    if (e?.code === 'P2025') throw new HttpError(404, 'Marca no encontrada');
    throw e;
  }
  ioBus.emit('marca-actualizada', marca);
  res.json(marca);
};

exports.actualizar    = asyncHandler(actualizarComun);
exports.actualizarPut = asyncHandler(actualizarComun);

exports.desactivar = asyncHandler(async (req, res) => {
  const usuarioId = await resolverUsuarioId(req);
  let marca;
  try {
    marca = await prisma.marca.update({
      where: { id: req.params.id },
      data:  { activo: false, deletedAt: new Date(), actualizadoPorId: usuarioId },
      include: MARCA_INCLUDE
    });
  } catch (e) {
    if (e?.code === 'P2025') throw new HttpError(404, 'Marca no encontrada');
    throw e;
  }
  ioBus.emit('marca-eliminada', { id: marca.id });
  res.json({ mensaje: 'Marca desactivada', marca });
});
