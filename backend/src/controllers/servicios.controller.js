const prisma = require('../lib/prisma');
const asyncHandler = require('../utils/asyncHandler');
const { HttpError } = require('../middlewares/error.middleware');
const ioBus = require('../lib/io');
const {
  pickSyncMeta, stripSyncMeta, payloadHash,
  findOperation, createOperation, logDuplicate
} = require('../lib/idempotency');

const SERVICIO_INCLUDE = {
  creadoPor:      { select: { id: true, nombre: true } },
  actualizadoPor: { select: { id: true, nombre: true } }
};

const sanitizarTexto = (v, max) => {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return max ? s.slice(0, max) : s;
};

/* Resuelve el usuarioId del JWT contra la tabla Usuario.
 * Si el JWT trae un id que ya no existe (usuario borrado, base reseed, token
 * viejo, token offline), devuelve null para evitar FK violations (P2003). */
const resolverUsuarioId = async (req) => {
  const idJwt = req.user?.id ?? null;
  if (!idJwt) {
    console.log('[servicios] resolverUsuarioId: req.user.id=null');
    return null;
  }
  const existe = await prisma.usuario.findUnique({
    where:  { id: idJwt },
    select: { id: true }
  });
  console.log('[servicios] resolverUsuarioId', {
    'req.user.id': idJwt,
    existeUsuario: !!existe
  });
  return existe ? idJwt : null;
};

exports.listar = asyncHandler(async (req, res) => {
  const incluyeInactivos = String(req.query.incluyeInactivos ?? 'false') === 'true';
  const categoria        = sanitizarTexto(req.query.categoria, 60);
  const q                = sanitizarTexto(req.query.q, 100);

  const where = { deletedAt: null };
  if (!incluyeInactivos) where.activo = true;
  if (categoria)         where.categoria = categoria;
  if (q) {
    where.OR = [
      { nombre:      { contains: q } },
      { descripcion: { contains: q } },
      { categoria:   { contains: q } }
    ];
  }

  const servicios = await prisma.servicio.findMany({
    where,
    include: SERVICIO_INCLUDE,
    orderBy: [{ activo: 'desc' }, { nombre: 'asc' }]
  });
  res.json(servicios);
});

exports.crear = asyncHandler(async (req, res) => {
  const meta = pickSyncMeta(req.body);
  if (meta?.invalid) throw new HttpError(400, 'clientMutationId y deviceId deben enviarse juntos');

  if (meta) {
    const op = await findOperation(prisma, meta);
    if (op) {
      logDuplicate(op);
      const existente = await prisma.servicio.findUnique({
        where: { id: op.entityId },
        include: SERVICIO_INCLUDE
      });
      if (existente) return res.status(200).json(existente);
    }
  }

  const clean = stripSyncMeta(req.body);
  const nombre      = sanitizarTexto(clean.nombre, 100);
  const descripcion = sanitizarTexto(clean.descripcion);
  const categoria   = sanitizarTexto(clean.categoria, 60);
  const unidad      = sanitizarTexto(clean.unidad, 30) || 'prenda';
  const precio      = Number(clean.precio);
  const esPersonalizado = clean.esPersonalizado === true;
  const activo      = clean.activo === false ? false : true;

  if (!nombre) throw new HttpError(400, 'Nombre requerido');
  if (!Number.isFinite(precio) || precio < 0) throw new HttpError(400, 'Precio inválido (debe ser >= 0)');

  const usuarioIdValido = await resolverUsuarioId(req);
  console.log('[servicios] crear payload', {
    nombre,
    'creadoPorId final': usuarioIdValido
  });

  const construirData = (creadoPorId) => ({
    nombre,
    descripcion,
    categoria,
    precio,
    unidad,
    activo,
    esPersonalizado,
    creadoPorId,
    actualizadoPorId: creadoPorId
  });

  let servicio;
  try {
    servicio = await prisma.$transaction(async (tx) => {
      const creado = await tx.servicio.create({
        data:    construirData(usuarioIdValido),
        include: SERVICIO_INCLUDE
      });

      if (meta) {
        await createOperation(tx, meta, {
          entityType:  'SERVICIO',
          entityId:    creado.id,
          action:      'CREATE',
          payloadHash: payloadHash(clean)
        });
      }
      return creado;
    });
  } catch (e) {
    // Idempotencia: si ya existe el op por unique (clientMutationId, deviceId)
    if (e?.code === 'P2002' && meta) {
      const op = await findOperation(prisma, meta);
      if (op) {
        logDuplicate(op);
        const existente = await prisma.servicio.findUnique({
          where: { id: op.entityId },
          include: SERVICIO_INCLUDE
        });
        if (existente) return res.status(200).json(existente);
      }
    }
    // Defensa contra FK violada por usuarioId (race condition: el usuario
    // existía al verificar y se eliminó entre medias) — reintentar con null.
    if (e?.code === 'P2003' && usuarioIdValido != null) {
      console.warn('[servicios] FK creadoPorId violada, reintentando con creadoPorId=null', {
        'req.user.id': req.user?.id ?? null
      });
      servicio = await prisma.$transaction(async (tx) => {
        const creado = await tx.servicio.create({
          data:    construirData(null),
          include: SERVICIO_INCLUDE
        });
        if (meta) {
          await createOperation(tx, meta, {
            entityType:  'SERVICIO',
            entityId:    creado.id,
            action:      'CREATE',
            payloadHash: payloadHash(clean)
          });
        }
        return creado;
      });
    } else {
      throw e;
    }
  }

  ioBus.emit('servicio-creado', servicio);
  res.status(201).json(servicio);
});

const CAMPOS_EDITABLES = ['nombre', 'descripcion', 'categoria', 'precio', 'unidad', 'activo'];

const construirPatch = (body) => {
  const patch = {};
  for (const k of CAMPOS_EDITABLES) {
    if (!Object.prototype.hasOwnProperty.call(body, k)) continue;
    const v = body[k];
    if (k === 'precio') {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) throw new HttpError(400, 'Precio inválido (debe ser >= 0)');
      patch.precio = n;
    } else if (k === 'activo') {
      patch.activo = v === true || v === 'true';
    } else if (k === 'nombre') {
      const s = sanitizarTexto(v, 100);
      if (!s) throw new HttpError(400, 'Nombre requerido');
      patch.nombre = s;
    } else if (k === 'unidad') {
      patch.unidad = sanitizarTexto(v, 30) || 'prenda';
    } else if (k === 'categoria') {
      patch.categoria = sanitizarTexto(v, 60);
    } else if (k === 'descripcion') {
      patch.descripcion = sanitizarTexto(v);
    }
  }
  return patch;
};

const actualizarComun = async (req, res) => {
  const patch = construirPatch(req.body || {});
  if (Object.keys(patch).length === 0) {
    throw new HttpError(400, 'No hay cambios para aplicar');
  }
  const usuarioIdValido = await resolverUsuarioId(req);
  patch.actualizadoPorId = usuarioIdValido;
  console.log('[servicios] actualizar', {
    id: req.params.id,
    'actualizadoPorId final': usuarioIdValido
  });

  let servicio;
  try {
    servicio = await prisma.servicio.update({
      where:   { id: req.params.id },
      data:    patch,
      include: SERVICIO_INCLUDE
    });
  } catch (e) {
    if (e?.code === 'P2025') throw new HttpError(404, 'Servicio no encontrado');
    // Defensa: FK violada → reintentar con actualizadoPorId=null
    if (e?.code === 'P2003' && usuarioIdValido != null) {
      console.warn('[servicios] FK actualizadoPorId violada, reintentando con null');
      servicio = await prisma.servicio.update({
        where:   { id: req.params.id },
        data:    { ...patch, actualizadoPorId: null },
        include: SERVICIO_INCLUDE
      });
    } else {
      throw e;
    }
  }

  ioBus.emit('servicio-actualizado', servicio);
  res.json(servicio);
};

exports.actualizar    = asyncHandler(actualizarComun);
exports.actualizarPut = asyncHandler(actualizarComun);

exports.desactivar = asyncHandler(async (req, res) => {
  const usuarioIdValido = await resolverUsuarioId(req);
  console.log('[servicios] desactivar', {
    id: req.params.id,
    'actualizadoPorId final': usuarioIdValido
  });

  let servicio;
  try {
    servicio = await prisma.servicio.update({
      where: { id: req.params.id },
      data:  {
        activo:           false,
        deletedAt:        new Date(),
        actualizadoPorId: usuarioIdValido
      },
      include: SERVICIO_INCLUDE
    });
  } catch (e) {
    if (e?.code === 'P2025') throw new HttpError(404, 'Servicio no encontrado');
    if (e?.code === 'P2003' && usuarioIdValido != null) {
      console.warn('[servicios] FK actualizadoPorId violada en desactivar, reintentando con null');
      servicio = await prisma.servicio.update({
        where: { id: req.params.id },
        data:  { activo: false, deletedAt: new Date(), actualizadoPorId: null },
        include: SERVICIO_INCLUDE
      });
    } else {
      throw e;
    }
  }

  ioBus.emit('servicio-eliminado', { id: servicio.id });
  res.json({ mensaje: 'Servicio desactivado', servicio });
});
