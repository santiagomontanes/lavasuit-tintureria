const fs = require('fs');
const path = require('path');
const prisma = require('../lib/prisma');
const asyncHandler = require('../utils/asyncHandler');
const { HttpError } = require('../middlewares/error.middleware');
const ioBus = require('../lib/io');
const { sesionAbiertaDeUsuario } = require('../lib/sesionesTrabajo');
const {
  pickSyncMeta, stripSyncMeta, payloadHash,
  findOperation, createOperation, logDuplicate
} = require('../lib/idempotency');

const GARANTIA_INCLUDE = {
  pedido: {
    select: {
      id: true,
      numero: true,
      cliente: { select: { id: true, nombre: true, telefono: true } }
    }
  },
  pedidoItem: { include: { servicio: true } },
  usuario: { select: { id: true, nombre: true } },
  sesionTrabajo: true
};

const publicUploadUrl = (req, filename) =>
  `${req.protocol}://${req.get('host')}/uploads/garantias/${filename}`;

const removeUploadedFile = (file) => {
  if (!file?.path) return;
  fs.unlink(file.path, () => {});
};

const cargarGarantia = (id) =>
  prisma.garantia.findUnique({
    where: { id },
    include: GARANTIA_INCLUDE
  });

exports.listar = asyncHandler(async (req, res) => {
  const { estado, pedidoId, usuarioId, page = 1, limit = 50 } = req.query;
  const where = {};
  if (estado) where.estado = estado;
  if (pedidoId) where.pedidoId = pedidoId;
  if (usuarioId) where.usuarioId = usuarioId;

  const skip = (Number(page) - 1) * Number(limit);
  const [garantias, total] = await Promise.all([
    prisma.garantia.findMany({
      where,
      include: GARANTIA_INCLUDE,
      orderBy: { createdAt: 'desc' },
      skip,
      take: Number(limit)
    }),
    prisma.garantia.count({ where })
  ]);

  res.json({
    garantias,
    total,
    page: Number(page),
    limit: Number(limit),
    pages: Math.ceil(total / Number(limit))
  });
});

exports.listarPorPedido = asyncHandler(async (req, res) => {
  const garantias = await prisma.garantia.findMany({
    where: { pedidoId: req.params.pedidoId },
    include: GARANTIA_INCLUDE,
    orderBy: { createdAt: 'desc' }
  });
  res.json(garantias);
});

exports.crear = asyncHandler(async (req, res) => {
  console.log('[garantias.crear] usuarioId:', req.user?.id);
  console.log('[garantias.crear] file:', req.file
    ? { filename: req.file.filename, size: req.file.size, mimetype: req.file.mimetype }
    : 'NO FILE');
  console.log('[garantias.crear] body:', {
    pedidoId:         req.body?.pedidoId         ?? null,
    pedidoItemId:     req.body?.pedidoItemId      ?? null,
    clientMutationId: req.body?.clientMutationId  ?? null,
    deviceId:         req.body?.deviceId          ?? null
  });

  const meta = pickSyncMeta(req.body);
  if (meta?.invalid) {
    removeUploadedFile(req.file);
    throw new HttpError(400, 'clientMutationId y deviceId deben enviarse juntos');
  }

  if (meta) {
    const op = await findOperation(prisma, meta);
    if (op) {
      console.log('[garantias.crear] duplicado detectado clientMutationId:', meta.clientMutationId, '-> entityId:', op.entityId);
      removeUploadedFile(req.file);
      logDuplicate(op);
      const existente = await cargarGarantia(op.entityId);
      if (existente) return res.status(200).json(existente);
    }
  }

  const clean = stripSyncMeta(req.body);
  const { pedidoId, pedidoItemId, descripcion } = clean;
  const filename = req.file.filename;
  const fotoPath = path.posix.join('uploads', 'garantias', filename);
  const fotoUrl = publicUploadUrl(req, filename);

  let garantia;
  try {
    garantia = await prisma.$transaction(async (tx) => {
      const pedido = await tx.pedido.findFirst({
        where: { id: pedidoId, eliminadoEn: null }
      });
      if (!pedido) throw new HttpError(404, 'Pedido no encontrado');

      if (pedidoItemId) {
        const item = await tx.pedidoItem.findFirst({
          where: { id: pedidoItemId, pedidoId }
        });
        if (!item) throw new HttpError(400, 'Item no pertenece al pedido');
      }

      const sesion = await sesionAbiertaDeUsuario(tx, req.user.id);
      const creada = await tx.garantia.create({
        data: {
          pedidoId,
          pedidoItemId: pedidoItemId || null,
          usuarioId: req.user.id,
          sesionTrabajoId: sesion?.id ?? null,
          descripcion,
          fotoUrl,
          fotoPath,
          estado: 'ABIERTA'
        },
        include: GARANTIA_INCLUDE
      });

      if (meta) {
        await createOperation(tx, meta, {
          entityType: 'GARANTIA',
          entityId: creada.id,
          action: 'CREATE',
          payloadHash: payloadHash({ ...clean, fotoPath })
        });
      }

      return creada;
    });
  } catch (e) {
    if (e?.code === 'P2002' && meta) {
      const op = await findOperation(prisma, meta);
      if (op) {
        removeUploadedFile(req.file);
        logDuplicate(op);
        const existente = await cargarGarantia(op.entityId);
        if (existente) return res.status(200).json(existente);
      }
    }
    removeUploadedFile(req.file);
    throw e;
  }

  console.log('[garantias.crear] garantia creada id:', garantia.id, 'fotoUrl:', garantia.fotoUrl);
  ioBus.emit('nueva-garantia', garantia);
  res.status(201).json(garantia);
});

exports.actualizarEstado = asyncHandler(async (req, res) => {
  const actual = await prisma.garantia.findUnique({
    where: { id: req.params.id }
  });
  if (!actual) throw new HttpError(404, 'Garantia no encontrada');

  const garantia = await prisma.garantia.update({
    where: { id: req.params.id },
    data: { estado: req.body.estado },
    include: GARANTIA_INCLUDE
  });

  ioBus.emit('garantia-actualizada', garantia);
  res.json(garantia);
});
