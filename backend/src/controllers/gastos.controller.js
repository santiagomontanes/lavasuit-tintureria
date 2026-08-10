const prisma = require('../lib/prisma');
const asyncHandler = require('../utils/asyncHandler');
const { HttpError } = require('../middlewares/error.middleware');
const ioBus = require('../lib/io');
const {
  pickSyncMeta, stripSyncMeta, payloadHash,
  findOperation, createOperation, logDuplicate
} = require('../lib/idempotency');

const GASTO_INCLUDE = {
  creadoPor:      { select: { id: true, nombre: true, rol: true } },
  actualizadoPor: { select: { id: true, nombre: true, rol: true } }
};

/* Resuelve el usuarioId del JWT contra la tabla Usuario para evitar FK
 * violations (mismo patrón que servicios.controller). */
const resolverUsuarioId = async (req) => {
  const idJwt = req.user?.id ?? null;
  if (!idJwt) return null;
  const existe = await prisma.usuario.findUnique({ where: { id: idJwt }, select: { id: true } });
  return existe ? idJwt : null;
};

/* ADMIN ve/administra todo. EMPLEADO/CAJERO sólo sus propios gastos.
 * (RECOLECTOR queda bloqueado a nivel de ruta). */
const esAdmin = (req) => req.user?.rol === 'ADMIN';

/* Resuelve la sesión de caja a la que pertenece el gasto.
 *  - Si el cliente envía cajaSesionId (mobile, que conoce su sesión incluso al
 *    sincronizar un gasto creado offline), se respeta SOLO si esa sesión existe.
 *  - Si no, se infiere la caja ABIERTA del usuario al momento de crear el gasto
 *    (desktop / mobile online). Así el arqueo lo cuenta solo en su sesión. */
const resolverCajaSesionId = async (cajaSesionIdEnviada, usuarioId) => {
  if (cajaSesionIdEnviada) {
    const existe = await prisma.cajaSesion.findUnique({
      where: { id: String(cajaSesionIdEnviada) }, select: { id: true }
    });
    if (existe) return existe.id;
  }
  if (!usuarioId) return null;
  const abierta = await prisma.cajaSesion.findFirst({
    where:   { usuarioId, estado: 'ABIERTA' },
    orderBy: { fechaApertura: 'desc' },
    select:  { id: true }
  });
  return abierta?.id ?? null;
};

const sanitizarTexto = (v, max) => {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return max ? s.slice(0, max) : s;
};

exports.listar = asyncHandler(async (req, res) => {
  const { fechaInicio, fechaFin, categoria, usuarioId, metodoPago } = req.query;
  const where = { deletedAt: null };

  if (categoria)  where.categoria = String(categoria);
  if (metodoPago) where.metodoPago = String(metodoPago);

  // Permisos: si no es ADMIN, sólo ve sus propios gastos.
  if (!esAdmin(req)) {
    where.creadoPorId = req.user.id;
  } else if (usuarioId) {
    where.creadoPorId = String(usuarioId);
  }

  if (fechaInicio || fechaFin) {
    where.fecha = {};
    if (fechaInicio) {
      const d = new Date(`${fechaInicio}T00:00:00.000`);
      if (!Number.isNaN(d.getTime())) where.fecha.gte = d;
    }
    if (fechaFin) {
      const h = new Date(`${fechaFin}T23:59:59.999`);
      if (!Number.isNaN(h.getTime())) where.fecha.lte = h;
    }
    if (Object.keys(where.fecha).length === 0) delete where.fecha;
  }

  const [gastos, agg] = await Promise.all([
    prisma.gasto.findMany({ where, include: GASTO_INCLUDE, orderBy: { fecha: 'desc' } }),
    prisma.gasto.aggregate({ where, _sum: { valor: true }, _count: true })
  ]);

  res.json({
    gastos,
    total:    Number(agg._sum.valor ?? 0),
    cantidad: agg._count
  });
});

exports.obtener = asyncHandler(async (req, res) => {
  const gasto = await prisma.gasto.findFirst({
    where:   { id: req.params.id, deletedAt: null },
    include: GASTO_INCLUDE
  });
  if (!gasto) throw new HttpError(404, 'Gasto no encontrado');
  if (!esAdmin(req) && gasto.creadoPorId !== req.user.id) {
    throw new HttpError(403, 'Sin permiso para ver este gasto');
  }
  res.json(gasto);
});

exports.crear = asyncHandler(async (req, res) => {
  const meta = pickSyncMeta(req.body);
  if (meta?.invalid) throw new HttpError(400, 'clientMutationId y deviceId deben enviarse juntos');

  if (meta) {
    const op = await findOperation(prisma, meta);
    if (op) {
      logDuplicate(op);
      const existente = await prisma.gasto.findUnique({ where: { id: op.entityId }, include: GASTO_INCLUDE });
      if (existente) return res.status(200).json(existente);
    }
  }

  const METODOS_VALIDOS = ['EFECTIVO', 'NEQUI', 'DAVIPLATA', 'TRANSFERENCIA', 'TARJETA', 'YAPE', 'PLIN', 'OTRO'];
  const clean = stripSyncMeta(req.body);
  // Normalización defensiva: nunca bloquear el item por campos vacíos corregibles.
  const concepto    = sanitizarTexto(clean.concepto, 150) || sanitizarTexto(clean.categoria, 150) || 'Gasto';
  const categoria   = sanitizarTexto(clean.categoria, 60) || 'General';
  const descripcion = sanitizarTexto(clean.descripcion);     // null ok (columna nullable)
  const metodoRaw   = sanitizarTexto(clean.metodoPago, 20);
  const metodoPago  = metodoRaw && METODOS_VALIDOS.includes(metodoRaw.toUpperCase())
    ? metodoRaw.toUpperCase() : null;
  const valor       = Number(clean.valor);
  // fecha segura: si no parsea, usar ahora (evita "Invalid Date" → 500 de Prisma).
  let fecha = new Date();
  if (clean.fecha) { const d = new Date(clean.fecha); if (!Number.isNaN(d.getTime())) fecha = d; }

  if (!Number.isFinite(valor) || valor <= 0) throw new HttpError(400, 'Valor inválido (debe ser > 0)');

  const usuarioId = await resolverUsuarioId(req);
  const cajaSesionId = await resolverCajaSesionId(clean.cajaSesionId, usuarioId);

  const construirData = (creadoPorId, incluirCaja = true) => ({
    concepto, categoria, valor,
    metodoPago: metodoPago || null,
    descripcion,
    fecha,
    creadoPorId,
    actualizadoPorId: creadoPorId,
    ...(incluirCaja && cajaSesionId ? { cajaSesionId } : {})
  });

  /* SIN transacción: crear un gasto + registrar su operación de idempotencia no
   * requiere atomicidad estricta y mantenerlo en un $transaction interactivo
   * causaba P2028 (la tx quedaba bloqueada esperando un lock de la tabla
   * syncOperation que también tocaba /caja/cerrar). Son escrituras rápidas en
   * autocommit; createOperation es un upsert idempotente. */
  let gasto;
  try {
    gasto = await prisma.gasto.create({ data: construirData(usuarioId), include: GASTO_INCLUDE });
  } catch (e) {
    // FK creadoPorId violada → reintentar con null (usuario no existe en BD).
    if (e?.code === 'P2003' && usuarioId != null) {
      gasto = await prisma.gasto.create({ data: construirData(null), include: GASTO_INCLUDE });
    } else if (e?.code === 'P2003') {
      // FK cajaSesionId violada (sesión inexistente): crear sin vínculo de caja.
      gasto = await prisma.gasto.create({ data: construirData(usuarioId, false), include: GASTO_INCLUDE });
    } else {
      console.error('[gastos.crear] error real:', {
        code: e?.code, message: e?.message,
        payload: { concepto, categoria, valor, metodoPago, fecha, tieneDescripcion: descripcion != null }
      });
      throw e;
    }
  }

  /* Registrar idempotencia FUERA de cualquier transacción. upsert evita P2002.
   * Si fallara, el gasto ya quedó creado: no rompemos la respuesta. */
  if (meta) {
    try {
      await createOperation(prisma, meta, {
        entityType:  'GASTO',
        entityId:    gasto.id,
        action:      'CREATE',
        payloadHash: payloadHash(clean)
      });
    } catch (e) {
      console.warn('[gastos.crear] no se pudo registrar operación de idempotencia (gasto creado):', e?.message);
    }
  }

  ioBus.emit('gasto-creado', gasto);
  res.status(201).json(gasto);
});

const construirPatch = (body) => {
  const patch = {};
  if (Object.prototype.hasOwnProperty.call(body, 'concepto')) {
    const s = sanitizarTexto(body.concepto, 150);
    if (!s) throw new HttpError(400, 'Concepto requerido');
    patch.concepto = s;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'categoria')) {
    const s = sanitizarTexto(body.categoria, 60);
    if (!s) throw new HttpError(400, 'Categoría requerida');
    patch.categoria = s;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'valor')) {
    const n = Number(body.valor);
    if (!Number.isFinite(n) || n <= 0) throw new HttpError(400, 'Valor inválido (debe ser > 0)');
    patch.valor = n;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'metodoPago')) {
    patch.metodoPago = sanitizarTexto(body.metodoPago, 20) || null;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'descripcion')) {
    patch.descripcion = sanitizarTexto(body.descripcion);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'fecha') && body.fecha) {
    const d = new Date(body.fecha);
    if (!Number.isNaN(d.getTime())) patch.fecha = d;
  }
  return patch;
};


/* Snapshot de un gasto para la auditoría. Solo campos de negocio: ni tokens ni
 * datos técnicos. */
const snapshotGasto = (g) => JSON.stringify({
  concepto: g.concepto, categoria: g.categoria, valor: Number(g.valor ?? 0),
  metodoPago: g.metodoPago ?? null, descripcion: g.descripcion ?? null,
  fecha: g.fecha, cajaSesionId: g.cajaSesionId ?? null
});

/* Registra una edición/anulación. Nunca hace fallar la operación principal:
 * si la auditoría no se puede escribir, el gasto igual se guarda y queda el
 * aviso en el log. */
const auditarGasto = async (datos) => {
  try {
    await prisma.gastoAuditoria.create({ data: datos });
  } catch (e) {
    console.warn('[gastos] no se pudo registrar la auditoria:', e?.message ?? e);
  }
};

exports.actualizar = asyncHandler(async (req, res) => {
  const actual = await prisma.gasto.findFirst({ where: { id: req.params.id, deletedAt: null } });
  if (!actual) throw new HttpError(404, 'Gasto no encontrado');
  if (!esAdmin(req) && actual.creadoPorId !== req.user.id) {
    throw new HttpError(403, 'Sin permiso para editar este gasto');
  }

  const patch = construirPatch(req.body || {});
  if (Object.keys(patch).length === 0) throw new HttpError(400, 'No hay cambios para aplicar');
  patch.actualizadoPorId = await resolverUsuarioId(req);

  let gasto;
  try {
    gasto = await prisma.gasto.update({ where: { id: req.params.id }, data: patch, include: GASTO_INCLUDE });
  } catch (e) {
    if (e?.code === 'P2025') throw new HttpError(404, 'Gasto no encontrado');
    if (e?.code === 'P2003' && patch.actualizadoPorId != null) {
      gasto = await prisma.gasto.update({
        where: { id: req.params.id }, data: { ...patch, actualizadoPorId: null }, include: GASTO_INCLUDE
      });
    } else {
      throw e;
    }
  }

  /* Auditoría de la EDICIÓN: guarda cómo estaba antes y cómo quedó, para que
   * la línea de tiempo pueda mostrar "valor anterior → valor nuevo". */
  await auditarGasto({
    gastoId:        gasto.id,
    usuarioId:      patch.actualizadoPorId ?? null,
    accion:         'EDITADO',
    motivo:         (req.body?.motivo && String(req.body.motivo).trim()) || null,
    valorAntes:     Number(actual.valor ?? 0),
    valorDespues:   Number(gasto.valor ?? 0),
    snapshotAntes:  snapshotGasto(actual),
    snapshotDespues: snapshotGasto(gasto)
  });

  ioBus.emit('gasto-actualizado', gasto);
  res.json(gasto);
});

exports.eliminar = asyncHandler(async (req, res) => {
  const actual = await prisma.gasto.findFirst({ where: { id: req.params.id, deletedAt: null } });
  if (!actual) throw new HttpError(404, 'Gasto no encontrado');
  if (!esAdmin(req) && actual.creadoPorId !== req.user.id) {
    throw new HttpError(403, 'Sin permiso para eliminar este gasto');
  }

  const usuarioId = await resolverUsuarioId(req);
  let gasto;
  try {
    gasto = await prisma.gasto.update({
      where: { id: req.params.id },
      data:  { deletedAt: new Date(), actualizadoPorId: usuarioId },
      include: GASTO_INCLUDE
    });
  } catch (e) {
    if (e?.code === 'P2003' && usuarioId != null) {
      gasto = await prisma.gasto.update({
        where: { id: req.params.id }, data: { deletedAt: new Date(), actualizadoPorId: null }, include: GASTO_INCLUDE
      });
    } else {
      throw e;
    }
  }

  // Auditoría de la ANULACIÓN. El gasto no se borra (deletedAt), así que el
  // snapshot y el motivo quedan asociados a una fila que sigue existiendo.
  await auditarGasto({
    gastoId:       gasto.id,
    usuarioId,
    accion:        'ANULADO',
    motivo:        (req.body?.motivo && String(req.body.motivo).trim()) || null,
    valorAntes:    Number(actual.valor ?? 0),
    snapshotAntes: snapshotGasto(actual)
  });

  ioBus.emit('gasto-eliminado', { id: gasto.id });
  res.json({ mensaje: 'Gasto eliminado', gasto });
});
