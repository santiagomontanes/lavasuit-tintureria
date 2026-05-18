const prisma = require('../lib/prisma');
const asyncHandler = require('../utils/asyncHandler');
const { HttpError } = require('../middlewares/error.middleware');
const ioBus = require('../lib/io');
const { sesionAbiertaDeUsuario, recalcularSesionTrabajo } = require('../lib/sesionesTrabajo');
const {
  pickSyncMeta, stripSyncMeta, payloadHash,
  findOperation, createOperation, logDuplicate
} = require('../lib/idempotency');

const EPS = 0.0001;

exports.crear = asyncHandler(async (req, res) => {
  const meta = pickSyncMeta(req.body);
  if (meta?.invalid) throw new HttpError(400, 'clientMutationId y deviceId deben enviarse juntos');

  const cargarPago = (id) => prisma.pago.findUnique({
    where: { id },
    include: { usuario: { select: { id: true, nombre: true } }, sesionTrabajo: true }
  });

  if (meta) {
    const op = await findOperation(prisma, meta);
    if (op) {
      logDuplicate(op);
      const existente = await cargarPago(op.entityId);
      if (existente) return res.status(200).json(existente);
    }
  }

  const clean = stripSyncMeta(req.body);
  const { pedidoId, monto, metodo } = clean;
  const montoNum = Number(monto);

  let resultado;
  try {
    resultado = await prisma.$transaction(async (tx) => {
      const pedido = await tx.pedido.findFirst({
        where:   { id: pedidoId, eliminadoEn: null },
        include: { pagos: true }
      });
      if (!pedido) throw new HttpError(404, 'Pedido no encontrado');
      if (pedido.estado === 'CANCELADO') throw new HttpError(400, 'No se puede pagar un pedido cancelado');

      const total  = Number(pedido.total);
      const pagado = pedido.pagos.reduce((acc, p) => acc + Number(p.monto), 0);
      const saldo  = total - pagado;

      if (saldo <= EPS) throw new HttpError(400, 'El pedido ya esta pagado completamente');
      if (montoNum > saldo + EPS) {
        throw new HttpError(400, `Monto supera saldo pendiente (S/ ${saldo.toFixed(2)})`);
      }

      const sesion = await sesionAbiertaDeUsuario(tx, req.user.id);
      if (!sesion) {
        console.warn('[pagos.crear] WARNING: no hay SesionTrabajo ABIERTA para este empleado;',
          'el pago quedará con sesionTrabajoId=null. Se contará por pago.usuarioId.', {
            usuarioId: req.user.id
          });
      }
      const pago = await tx.pago.create({
        data: {
          pedidoId,
          usuarioId: req.user.id,                 // ← SIEMPRE el empleado autenticado
          sesionTrabajoId: sesion?.id ?? null,    // ← puede quedar null si no hay sesion abierta
          monto: montoNum,
          metodo
        },
        include: { usuario: { select: { id: true, nombre: true } }, sesionTrabajo: true }
      });

      console.log('[pagos.crear] pago guardado', {
        id:              pago.id,
        pedidoId:        pago.pedidoId,
        usuarioId:       pago.usuarioId,
        sesionTrabajoId: pago.sesionTrabajoId,
        pedidoUsuarioId: pedido.usuarioId,
        monto:           Number(pago.monto),
        metodo:          pago.metodo,
        createdAt:       pago.createdAt
      });

      if (sesion?.id) await recalcularSesionTrabajo(tx, sesion.id);

      if (meta) {
        await createOperation(tx, meta, {
          entityType:  'PAGO',
          entityId:    pago.id,
          action:      'CREATE',
          payloadHash: payloadHash(clean)
        });
      }

      const nuevoPagado = pagado + montoNum;
      const completado  = Math.abs(total - nuevoPagado) < EPS;

      /* AUTO-ENTREGA: si este pago salda el pedido y todavía no está entregado,
       * lo marcamos como ENTREGADO automáticamente. Se registra en el historial
       * de estados con el mismo usuario que cobró. */
      let entregadoAuto = false;
      if (completado && pedido.estado !== 'ENTREGADO' && pedido.estado !== 'CANCELADO') {
        await tx.pedido.update({
          where: { id: pedidoId },
          data:  { estado: 'ENTREGADO' }
        });
        await tx.pedidoEstadoHistorial.create({
          data: {
            pedidoId,
            usuarioId:     req.user.id,
            estadoAnterior: pedido.estado,
            estadoNuevo:   'ENTREGADO'
          }
        });
        entregadoAuto = true;
        console.log('[pagos.crear] auto-entrega aplicada', {
          pedidoId, usuarioId: req.user.id, estadoAnterior: pedido.estado
        });
      }

      return { pago, completado, entregadoAuto };
    });
  } catch (e) {
    if (e?.code === 'P2002' && meta) {
      const op = await findOperation(prisma, meta);
      if (op) {
        logDuplicate(op);
        const existente = await cargarPago(op.entityId);
        if (existente) return res.status(200).json(existente);
      }
    }
    throw e;
  }

  ioBus.emit('nuevo-pago', { pedidoId, pago: resultado.pago });
  if (resultado.entregadoAuto) {
    // Emitimos también el cambio de estado para que desktop/mobile se actualicen.
    const pedidoActualizado = await prisma.pedido.findUnique({
      where:   { id: pedidoId },
      include: { cliente: true }
    });
    ioBus.emit('estado-cambiado', {
      id:     pedidoId,
      estado: 'ENTREGADO',
      pedido: pedidoActualizado,
      motivo: 'pago-cubre-saldo'
    });
  }

  res.status(201).json({ ...resultado.pago, entregadoAuto: resultado.entregadoAuto });
});

exports.listarPorPedido = asyncHandler(async (req, res) => {
  const pagos = await prisma.pago.findMany({
    where:   { pedidoId: req.params.pedidoId },
    include: { usuario: { select: { id: true, nombre: true } }, sesionTrabajo: true },
    orderBy: { createdAt: 'desc' }
  });
  res.json(pagos);
});
