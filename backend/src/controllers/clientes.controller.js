const prisma = require('../lib/prisma');
const asyncHandler = require('../utils/asyncHandler');
const { HttpError } = require('../middlewares/error.middleware');
const ioBus = require('../lib/io');
const {
  pickSyncMeta, stripSyncMeta, payloadHash,
  findOperation, createOperation, logDuplicate
} = require('../lib/idempotency');
const { construirSortKey, formatIdentificador, parseOrden } = require('../lib/orden');

const CLIENTE_INCLUDE = {
  creadoPor: { select: { id: true, nombre: true } },
  asignadoA: { select: { id: true, nombre: true } }
};

exports.listar = asyncHandler(async (req, res) => {
  const { q } = req.query;
  const clientes = await prisma.cliente.findMany({
    where: q ? {
      OR: [
        { nombre:   { contains: q } },
        { telefono: { contains: q } },
        { email:    { contains: q } }
      ]
    } : { activo: true },
    include: CLIENTE_INCLUDE,
    orderBy: { nombre: 'asc' }
  });
  res.json(clientes);
});

exports.obtener = asyncHandler(async (req, res) => {
  const cliente = await prisma.cliente.findUnique({
    where: { id: req.params.id },
    include: {
      ...CLIENTE_INCLUDE,
      pedidos: {
        where:   { eliminadoEn: null },
        orderBy: { createdAt: 'desc' },
        take:    10,
        include: { items: { include: { servicio: true } } }
      }
    }
  });
  if (!cliente) throw new HttpError(404, 'Cliente no encontrado');
  res.json(cliente);
});

exports.crear = asyncHandler(async (req, res) => {
  console.log('[clientes.crear] body:', req.body);

  const meta = pickSyncMeta(req.body);
  if (meta?.invalid) throw new HttpError(400, 'clientMutationId y deviceId deben enviarse juntos');

  const cargarCliente = (id) => prisma.cliente.findUnique({ where: { id }, include: CLIENTE_INCLUDE });

  if (meta) {
    const op = await findOperation(prisma, meta);
    if (op) {
      logDuplicate(op);
      const existente = await cargarCliente(op.entityId);
      if (existente) return res.status(200).json(existente);
    }
  }

  const clean = stripSyncMeta(req.body);
  const { nombre, telefono, email, direccion, notas } = clean;

  /* Auto-asignación:
   *  - Si quien crea NO es ADMIN (es EMPLEADO / RECOLECTOR / CAJERO), el
   *    cliente queda asignado a sí mismo para que aparezca de inmediato en
   *    su pantalla de "clientes asignados" en mobile.
   *  - Si es ADMIN y el body envía asignadoAId, se respeta ese valor.
   *  - Si es ADMIN y no envía nada, queda sin asignar (admin puede asignar
   *    después desde desktop). */
  let asignadoAId = null;
  if (Object.prototype.hasOwnProperty.call(clean, 'asignadoAId')) {
    asignadoAId = clean.asignadoAId ?? null;
  } else if (req.user?.rol && req.user.rol !== 'ADMIN') {
    asignadoAId = req.user.id;
  }
  console.log('[clientes.crear] asignación', {
    rolCreador:  req.user?.rol,
    creadoPorId: req.user?.id,
    asignadoAId
  });

  try {
    const cliente = await prisma.$transaction(async (tx) => {
      const creado = await tx.cliente.create({
        data: {
          nombre, telefono, email, direccion, notas,
          creadoPorId: req.user.id,
          asignadoAId
        },
        include: CLIENTE_INCLUDE
      });

      if (meta) {
        await createOperation(tx, meta, {
          entityType:  'CLIENTE',
          entityId:    creado.id,
          action:      'CREATE',
          payloadHash: payloadHash(clean)
        });
      }

      return creado;
    });

    ioBus.emit('nuevo-cliente', cliente);
    res.status(201).json(cliente);
  } catch (e) {
    console.error('[clientes.crear] error real:', e);

    if (e?.code === 'P2002' && meta) {
      const op = await findOperation(prisma, meta);
      if (op) {
        logDuplicate(op);
        const existente = await cargarCliente(op.entityId);
        if (existente) return res.status(200).json(existente);
      }
    }
    if (e?.code === 'P2002') throw new HttpError(409, 'Telefono ya registrado');
    throw e;
  }
});

exports.actualizar = asyncHandler(async (req, res) => {
  try {
    const cliente = await prisma.cliente.update({
      where: { id: req.params.id },
      data:  req.body
    });
    ioBus.emit('cliente-actualizado', cliente);
    res.json(cliente);
  } catch (e) {
    if (e?.code === 'P2025') throw new HttpError(404, 'Cliente no encontrado');
    if (e?.code === 'P2002') throw new HttpError(409, 'Telefono ya registrado');
    throw e;
  }
});

exports.desactivar = asyncHandler(async (req, res) => {
  try {
    const cliente = await prisma.cliente.update({
      where: { id: req.params.id },
      data:  { activo: false }
    });
    ioBus.emit('cliente-actualizado', cliente);
    res.json({ mensaje: 'Cliente desactivado' });
  } catch (e) {
    if (e?.code === 'P2025') throw new HttpError(404, 'Cliente no encontrado');
    throw e;
  }
});

/* ───────────────────────────────────────────────────────────────────────────
 * MÓDULO DE RUTAS / ASIGNACIONES
 * ─────────────────────────────────────────────────────────────────────────── */

/*
 * POST /api/clientes/importar-excel  (solo ADMIN)
 * Recibe filas ya parseadas por el desktop. Crea o actualiza clientes en la
 * base central. NO es atómico a propósito: cada fila se procesa de forma
 * independiente y se devuelve un resumen con los errores fila por fila.
 */
exports.importarExcel = asyncHandler(async (req, res) => {
  const { filas } = req.body;

  let nuevos = 0;
  let actualizados = 0;
  let duplicados = 0;
  const errores = [];

  const telefonosVistos = new Set();
  const identsVistos     = new Set();
  const ordenesVistos    = new Set();

  for (let i = 0; i < filas.length; i++) {
    const f = filas[i];
    const numFila = i + 2; // fila 1 = encabezados

    const nombre        = f.nombre_cliente != null ? String(f.nombre_cliente).trim() : '';
    const telefono      = f.numero_celular != null ? String(f.numero_celular).trim() : '';
    const direccionRaw  = f.direccion != null ? String(f.direccion).trim() : '';
    const direccion     = direccionRaw || null;
    const identRaw      = f.identificador_cliente != null ? String(f.identificador_cliente).trim() : '';
    const { ordenBase, subOrden } = parseOrden(f.orden, identRaw);

    if (!nombre || telefono.length < 6) {
      errores.push({ fila: numFila, motivo: 'nombre_cliente o numero_celular invalido' });
      continue;
    }

    // Duplicados dentro del mismo archivo
    const ordenClave = ordenBase != null ? `${ordenBase}_${subOrden}` : null;
    if (
      telefonosVistos.has(telefono) ||
      (identRaw && identsVistos.has(identRaw)) ||
      (ordenClave && ordenesVistos.has(ordenClave))
    ) {
      duplicados++;
      continue;
    }
    telefonosVistos.add(telefono);
    if (identRaw) identsVistos.add(identRaw);
    if (ordenClave) ordenesVistos.add(ordenClave);

    const sortKey       = construirSortKey(ordenBase, subOrden);
    const identificador = identRaw || formatIdentificador(ordenBase, subOrden);

    try {
      const existente = await prisma.cliente.findUnique({ where: { telefono } });
      if (existente) {
        await prisma.cliente.update({
          where: { id: existente.id },
          data:  { nombre, direccion, identificador, ordenBase, subOrden, sortKey, activo: true }
        });
        actualizados++;
      } else {
        await prisma.cliente.create({
          data: {
            nombre, telefono, direccion,
            identificador, ordenBase, subOrden, sortKey,
            creadoPorId: req.user.id
          }
        });
        nuevos++;
      }
    } catch (e) {
      if (e?.code === 'P2002') {
        const target = Array.isArray(e?.meta?.target) ? e.meta.target.join(',') : String(e?.meta?.target ?? '');
        errores.push({
          fila: numFila,
          motivo: target.includes('orden') || target.includes('subOrden')
            ? `El orden ${identificador ?? ordenBase} ya está en uso por otro cliente`
            : 'Teléfono ya registrado por otro cliente'
        });
      } else {
        console.error('[clientes.importarExcel] fila', numFila, e);
        errores.push({ fila: numFila, motivo: 'Error al guardar la fila' });
      }
    }
  }

  const resumen = {
    total: filas.length,
    nuevos,
    actualizados,
    duplicados,
    errores: errores.length
  };
  console.log('[clientes.importarExcel] resumen:', resumen);
  ioBus.emit('clientes-importados', resumen);
  res.json({ resumen, errores });
});

/*
 * GET /api/clientes/asignados
 * Devuelve SOLO los clientes asignados al usuario autenticado, ordenados por
 * el orden exacto de recorrido (sortKey).
 */
exports.listarAsignados = asyncHandler(async (req, res) => {
  const clientes = await prisma.cliente.findMany({
    where:   { asignadoAId: req.user.id, activo: true },
    include: CLIENTE_INCLUDE,
    orderBy: [
      { sortKey: { sort: 'asc', nulls: 'last' } },
      { nombre:  'asc' }
    ]
  });
  res.json(clientes);
});

/*
 * POST /api/clientes/asignar  (solo ADMIN)
 * Asigna clientes a un empleado, por lista explícita de ids o por rango de
 * ordenBase (del 1 al 60, del 61 al 120, etc.).
 */
exports.asignar = asyncHandler(async (req, res) => {
  const { usuarioId, clienteIds, desde, hasta } = req.body;

  const empleado = await prisma.usuario.findUnique({ where: { id: usuarioId } });
  if (!empleado) throw new HttpError(404, 'Empleado no encontrado');

  let where;
  if (Array.isArray(clienteIds) && clienteIds.length > 0) {
    where = { id: { in: clienteIds } };
  } else if (desde != null && hasta != null) {
    where = { ordenBase: { gte: Number(desde), lte: Number(hasta) } };
  } else {
    throw new HttpError(400, 'Debe enviar clienteIds o un rango desde/hasta');
  }

  const resultado = await prisma.cliente.updateMany({
    where,
    data: { asignadoAId: usuarioId }
  });

  console.log(`[clientes.asignar] ${resultado.count} clientes -> ${empleado.nombre} (${usuarioId})`);
  ioBus.emit('clientes-asignados', { usuarioId, total: resultado.count });
  res.json({ asignados: resultado.count, usuarioId, empleado: empleado.nombre });
});

/*
 * POST /api/clientes/crear-en-ruta
 * Crea un cliente nuevo ENTRE dos clientes existentes. El cliente queda
 * asignado al empleado autenticado. El backend es la autoridad del consecutivo:
 * busca el mayor subOrden existente para `ordenBaseRef` y asigna el siguiente.
 * Si dos celulares piden 52_1 a la vez, el índice único (ordenBase, subOrden)
 * provoca P2002 y reintentamos con el siguiente disponible (52_2, 52_3...).
 */
exports.crearEnRuta = asyncHandler(async (req, res) => {
  const meta = pickSyncMeta(req.body);
  if (meta?.invalid) throw new HttpError(400, 'clientMutationId y deviceId deben enviarse juntos');

  const cargarCliente = (id) => prisma.cliente.findUnique({ where: { id }, include: CLIENTE_INCLUDE });

  // Idempotencia: si ya procesamos esta mutación, devolvemos el cliente existente.
  if (meta) {
    const op = await findOperation(prisma, meta);
    if (op) {
      logDuplicate(op);
      const existente = await cargarCliente(op.entityId);
      if (existente) return res.status(200).json(existente);
    }
  }

  const clean = stripSyncMeta(req.body);
  const { nombre, telefono, email, direccion, notas, ordenBaseRef } = clean;
  const ordenBase = Number(ordenBaseRef);
  if (!Number.isFinite(ordenBase)) throw new HttpError(400, 'ordenBaseRef invalido');

  const MAX_INTENTOS = 8;
  for (let intento = 0; intento < MAX_INTENTOS; intento++) {
    const agg = await prisma.cliente.aggregate({
      where: { ordenBase },
      _max:  { subOrden: true }
    });
    const subOrden      = (agg._max.subOrden ?? 0) + 1;
    const sortKey       = construirSortKey(ordenBase, subOrden);
    const identificador = formatIdentificador(ordenBase, subOrden);

    try {
      const cliente = await prisma.$transaction(async (tx) => {
        const creado = await tx.cliente.create({
          data: {
            nombre, telefono, email, direccion, notas,
            identificador, ordenBase, subOrden, sortKey,
            asignadoAId: req.user.id,
            creadoPorId: req.user.id
          },
          include: CLIENTE_INCLUDE
        });

        if (meta) {
          await createOperation(tx, meta, {
            entityType:  'CLIENTE',
            entityId:    creado.id,
            action:      'CREATE_EN_RUTA',
            payloadHash: payloadHash(clean)
          });
        }
        return creado;
      });

      console.log(`[clientes.crearEnRuta] creado ${identificador} (intento ${intento + 1})`);
      ioBus.emit('nuevo-cliente', cliente);
      return res.status(201).json(cliente);
    } catch (e) {
      if (e?.code === 'P2002') {
        const target = Array.isArray(e?.meta?.target) ? e.meta.target.join(',') : String(e?.meta?.target ?? '');
        // Colisión en (ordenBase, subOrden): otro celular ganó este consecutivo.
        if (target.includes('orden') || target.includes('subOrden')) {
          console.warn(`[clientes.crearEnRuta] colisión en ${identificador}, reintentando`);
          continue;
        }
        // Colisión de teléfono: si es un reintento de la misma mutación, devolvemos el existente.
        if (meta) {
          const op = await findOperation(prisma, meta);
          if (op) {
            logDuplicate(op);
            const existente = await cargarCliente(op.entityId);
            if (existente) return res.status(200).json(existente);
          }
        }
        throw new HttpError(409, 'Telefono ya registrado');
      }
      console.error('[clientes.crearEnRuta] error real:', e);
      throw e;
    }
  }

  throw new HttpError(409, 'No se pudo asignar un consecutivo libre, reintente');
});
