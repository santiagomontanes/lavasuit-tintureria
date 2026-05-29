const prisma = require('../lib/prisma');
const asyncHandler = require('../utils/asyncHandler');
const { HttpError } = require('../middlewares/error.middleware');
const ioBus = require('../lib/io');
const { sesionAbiertaDeUsuario, recalcularSesionTrabajo } = require('../lib/sesionesTrabajo');
const {
  pickSyncMeta, stripSyncMeta, payloadHash,
  findOperation, createOperation, logDuplicate
} = require('../lib/idempotency');

const PEDIDO_INCLUDE = {
  cliente: true,
  usuario: { select: { id: true, nombre: true } },
  eliminadoPor: { select: { id: true, nombre: true } },
  sesionTrabajo: true,
  items:   { include: { servicio: true } },
  pagos:   { include: { usuario: { select: { id: true, nombre: true } } } },
  garantias: {
    include: {
      usuario: { select: { id: true, nombre: true } },
      pedidoItem: { include: { servicio: true } }
    },
    orderBy: { createdAt: 'desc' }
  },
  historialEstados: {
    include: { usuario: { select: { id: true, nombre: true } } },
    orderBy: { createdAt: 'desc' }
  },
  evidenciaEntrega: {
    include: { usuario: { select: { id: true, nombre: true } } }
  }
};

exports.listar = asyncHandler(async (req, res) => {
  const { estado, clienteId, usuarioId, desde, hasta, page = 1, limit = 20 } = req.query;
  const where = { eliminadoEn: null };
  if (estado)    where.estado    = estado;
  if (clienteId) where.clienteId = clienteId;
  if (usuarioId) where.usuarioId = usuarioId;

  // Rango de fechas (YYYY-MM-DD). Permite desde/hasta o sólo uno.
  if (desde || hasta) {
    where.createdAt = {};
    if (desde) {
      const d = new Date(`${desde}T00:00:00.000`);
      if (!Number.isNaN(d.getTime())) where.createdAt.gte = d;
    }
    if (hasta) {
      const h = new Date(`${hasta}T23:59:59.999`);
      if (!Number.isNaN(h.getTime())) where.createdAt.lte = h;
    }
    if (Object.keys(where.createdAt).length === 0) delete where.createdAt;
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [pedidos, total] = await Promise.all([
    prisma.pedido.findMany({
      where,
      include: PEDIDO_INCLUDE,
      orderBy: { createdAt: 'desc' },
      skip,
      take: Number(limit)
    }),
    prisma.pedido.count({ where })
  ]);

  res.json({
    pedidos,
    total,
    page:  Number(page),
    limit: Number(limit),
    pages: Math.ceil(total / Number(limit))
  });
});

exports.obtener = asyncHandler(async (req, res) => {
  const pedido = await prisma.pedido.findFirst({
    where:   { id: req.params.id, eliminadoEn: null },
    include: PEDIDO_INCLUDE
  });
  if (!pedido) throw new HttpError(404, 'Pedido no encontrado');
  res.json(pedido);
});

exports.crear = asyncHandler(async (req, res) => {
  const meta = pickSyncMeta(req.body);
  if (meta?.invalid) throw new HttpError(400, 'clientMutationId y deviceId deben enviarse juntos');

  const cargarPedido = (id) => prisma.pedido.findUnique({
    where: { id },
    include: PEDIDO_INCLUDE
  });

  if (meta) {
    const op = await findOperation(prisma, meta);
    if (op) {
      logDuplicate(op);
      const existente = await cargarPedido(op.entityId);
      if (existente) return res.status(200).json(existente);
    }
  }

  const clean = stripSyncMeta(req.body);
  const { clienteId, items, notas, fechaEntrega, numeroLocal } = clean;

  let pedido;
  try {
    pedido = await prisma.$transaction(async (tx) => {
      const cliente = await tx.cliente.findUnique({ where: { id: clienteId } });
      if (!cliente || !cliente.activo) throw new HttpError(400, 'Cliente no válido');

      const serviciosIds = items.map((i) => i.servicioId);
      // Aceptamos servicios "uso único" (activo=false) siempre que NO estén soft-deleted.
      const serviciosDb  = await tx.servicio.findMany({
        where: { id: { in: serviciosIds }, deletedAt: null }
      });
      const setEncontrados = new Set(serviciosDb.map((s) => s.id));
      const faltantes = serviciosIds.filter((id) => !setEncontrados.has(id));
      if (faltantes.length > 0) {
        throw new HttpError(400, `Servicios inválidos: ${faltantes.join(', ')}`);
      }

      const total = items.reduce(
        (acc, i) => acc + (Number(i.precio) * Number(i.cantidad)),
        0
      );
      const sesion = await sesionAbiertaDeUsuario(tx, req.user.id);

      const creado = await tx.pedido.create({
        data: {
          clienteId,
          usuarioId:    req.user.id,
          sesionTrabajoId: sesion?.id ?? null,
          numeroLocal:  numeroLocal || null,
          total,
          notas:        notas || null,
          fechaEntrega: fechaEntrega ? new Date(fechaEntrega) : null,
          items: {
            create: items.map((i) => ({
              servicioId: i.servicioId,
              nombre:     i.nombre || i.servicioNombre || null,
              cantidad:   i.cantidad,
              precio:     Number(i.precio),
              subtotal:   Number(i.precio) * Number(i.cantidad),
              colorActual:   i.colorActual || null,
              colorDeseado:  i.colorDeseado || null,
              observaciones: i.observaciones || i.observacion || null,
              marcaId:       i.marcaId || null,
              marcaNombre:   i.marcaNombre || null,
              marcaCodigo:   i.marcaCodigo || null
            }))
          }
        },
        include: PEDIDO_INCLUDE
      });

      if (sesion?.id) await recalcularSesionTrabajo(tx, sesion.id);

      if (meta) {
        await createOperation(tx, meta, {
          entityType:  'PEDIDO',
          entityId:    creado.id,
          action:      'CREATE',
          payloadHash: payloadHash(clean)
        });
      }

      return creado;
    });
  } catch (e) {
    if (e?.code === 'P2002' && meta) {
      const op = await findOperation(prisma, meta);
      if (op) {
        logDuplicate(op);
        const existente = await cargarPedido(op.entityId);
        if (existente) return res.status(200).json(existente);
      }
    }
    throw e;
  }

  ioBus.emit('nuevo-pedido', pedido);
  res.status(201).json(pedido);
});

exports.actualizarEstado = asyncHandler(async (req, res) => {
  const { estado } = req.body;

  if (estado === 'ENTREGADO') {
    throw new HttpError(400, 'Para marcar como ENTREGADO usa POST /api/pedidos/:id/entregar con foto obligatoria');
  }

  const pedido = await prisma.$transaction(async (tx) => {
    const actual = await tx.pedido.findFirst({
      where: { id: req.params.id, eliminadoEn: null }
    });
    if (!actual) throw new HttpError(404, 'Pedido no encontrado');
    if (actual.estado === estado) return actual;

    /* REGLA: si el pedido ya está ENTREGADO, solo ADMIN puede cambiarle el
     * estado. Empleado/recolector queda bloqueado. */
    if (actual.estado === 'ENTREGADO' && req.user?.rol !== 'ADMIN') {
      throw new HttpError(403, 'Solo un administrador puede modificar un pedido ya entregado');
    }

    const actualizado = await tx.pedido.update({
      where:   { id: req.params.id },
      data:    { estado },
      include: PEDIDO_INCLUDE
    });

    await tx.pedidoEstadoHistorial.create({
      data: {
        pedidoId: req.params.id,
        usuarioId: req.user.id,
        estadoAnterior: actual.estado,
        estadoNuevo: estado
      }
    });

    if (actual.sesionTrabajoId) await recalcularSesionTrabajo(tx, actual.sesionTrabajoId);
    return actualizado;
  });

  const pedidoCompleto = pedido.cliente
    ? pedido
    : await prisma.pedido.findUnique({ where: { id: pedido.id }, include: PEDIDO_INCLUDE });

  ioBus.emit('estado-cambiado', {
    id:     pedidoCompleto.id,
    estado: pedidoCompleto.estado,
    pedido: pedidoCompleto
  });
  res.json(pedidoCompleto);
});

exports.entregar = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!req.file) {
    throw new HttpError(400, 'La foto de entrega es obligatoria');
  }

  const fotoPath = req.file.filename;
  const fotoUrl  = `/uploads/entregas/${req.file.filename}`;
  const observacion = req.body?.observacion?.trim() || null;

  const pedido = await prisma.$transaction(async (tx) => {
    const actual = await tx.pedido.findFirst({
      where: { id, eliminadoEn: null }
    });
    if (!actual) throw new HttpError(404, 'Pedido no encontrado');
    if (actual.estado === 'ENTREGADO') throw new HttpError(400, 'El pedido ya fue entregado');
    if (actual.estado === 'CANCELADO') throw new HttpError(400, 'No se puede entregar un pedido cancelado');

    const sesion = await sesionAbiertaDeUsuario(tx, req.user.id);

    await tx.evidenciaEntrega.create({
      data: {
        pedidoId:       id,
        usuarioId:      req.user.id,
        sesionTrabajoId: sesion?.id ?? actual.sesionTrabajoId ?? null,
        fotoUrl,
        fotoPath,
        observacion
      }
    });

    const actualizado = await tx.pedido.update({
      where:   { id },
      data:    { estado: 'ENTREGADO' },
      include: PEDIDO_INCLUDE
    });

    await tx.pedidoEstadoHistorial.create({
      data: {
        pedidoId:      id,
        usuarioId:     req.user.id,
        estadoAnterior: actual.estado,
        estadoNuevo:   'ENTREGADO'
      }
    });

    if (actual.sesionTrabajoId) await recalcularSesionTrabajo(tx, actual.sesionTrabajoId);

    return actualizado;
  });

  const pedidoCompleto = await prisma.pedido.findUnique({
    where: { id: pedido.id },
    include: PEDIDO_INCLUDE
  });

  ioBus.emit('pedido-entregado', { id: pedidoCompleto.id, pedido: pedidoCompleto });
  ioBus.emit('estado-cambiado',  { id: pedidoCompleto.id, estado: 'ENTREGADO', pedido: pedidoCompleto });

  res.json(pedidoCompleto);
});

exports.obtenerEvidenciaEntrega = asyncHandler(async (req, res) => {
  const evidencia = await prisma.evidenciaEntrega.findUnique({
    where:   { pedidoId: req.params.id },
    include: { usuario: { select: { id: true, nombre: true } } }
  });
  res.json(evidencia ?? null);
});

exports.eliminar = asyncHandler(async (req, res) => {
  const pedido = await prisma.pedido.findFirst({
    where: { id: req.params.id, eliminadoEn: null }
  });
  if (!pedido) throw new HttpError(404, 'Pedido no encontrado');

  await prisma.pedido.update({
    where: { id: req.params.id },
    data:  { eliminadoEn: new Date(), eliminadoPorId: req.user.id }
  });
  if (pedido.sesionTrabajoId) {
    await prisma.$transaction((tx) => recalcularSesionTrabajo(tx, pedido.sesionTrabajoId));
  }
  ioBus.emit('pedido-eliminado', { id: req.params.id });
  res.json({ mensaje: 'Pedido eliminado' });
});
