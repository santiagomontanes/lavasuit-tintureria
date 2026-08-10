const prisma = require('../lib/prisma');
const asyncHandler = require('../utils/asyncHandler');
const { HttpError } = require('../middlewares/error.middleware');
const ioBus = require('../lib/io');
const { sesionAbiertaDeUsuario, recalcularSesionTrabajo } = require('../lib/sesionesTrabajo');
const { sumaPagos, totalAPagar } = require('../lib/saldos');
const {
  pickSyncMeta, stripSyncMeta, payloadHash,
  findOperation, createOperation, logDuplicate
} = require('../lib/idempotency');

const EPS = 0.0001;

/* Resuelve la sesión de caja a la que pertenece el pago (mismo criterio que
 * gastos.resolverCajaSesionId):
 *  - Si el cliente envía cajaSesionId (mobile, que conoce su sesión incluso al
 *    sincronizar un pago creado offline), se respeta SOLO si esa sesión existe.
 *  - Si no, se infiere la caja ABIERTA del usuario. Así el arqueo cuenta el pago
 *    únicamente en su sesión (filtro ESTRICTO en el resumen). Si no hay caja
 *    abierta, queda null → no entra a ningún arqueo. */
const resolverCajaSesionIdPago = async (client, cajaSesionIdEnviada, usuarioId) => {
  if (cajaSesionIdEnviada) {
    const existe = await client.cajaSesion.findUnique({
      where: { id: String(cajaSesionIdEnviada) }, select: { id: true }
    });
    if (existe) return existe.id;
  }
  if (!usuarioId) return null;
  const abierta = await client.cajaSesion.findFirst({
    where:   { usuarioId, estado: 'ABIERTA' },
    orderBy: { fechaApertura: 'desc' },
    select:  { id: true }
  });
  return abierta?.id ?? null;
};

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
  const { pedidoId, monto, metodo, cajaSesionId: cajaSesionIdEnviada } = clean;
  const montoNum = Number(monto);

  let resultado;
  try {
    resultado = await prisma.$transaction(async (tx) => {
      let pedido = await tx.pedido.findFirst({
        where:   { id: pedidoId, eliminadoEn: null },
        include: { pagos: true }
      });
      if (!pedido) throw new HttpError(404, 'Pedido no encontrado');

      /* Si la factura fue CONSOLIDADA en otra orden, su saldo se migró al
       * destino: el pago debe ir AHÍ, no a la factura origen (evita el 400
       * "factura consolidada" que bloqueaba abonos válidos del flujo
       * "nueva orden + llamar deuda + abonar"). Seguimos la cadena hasta el
       * destino vivo. La idempotencia (clientMutationId) evita duplicar. */
      let saltos = 0;
      while (pedido.consolidadoEnPedidoId && saltos++ < 10) {
        const destino = await tx.pedido.findFirst({
          where:   { id: pedido.consolidadoEnPedidoId, eliminadoEn: null },
          include: { pagos: true }
        });
        if (!destino) break;            // destino borrado → caer al guard de abajo
        pedido = destino;
      }
      if (pedido.consolidadoEnPedidoId) {
        // No se pudo resolver un destino vivo (cadena rota): mensaje claro.
        throw new HttpError(400, 'Esta factura fue consolidada en otra orden. Registra el pago en la factura destino.');
      }
      if (pedido.estado === 'CANCELADO') throw new HttpError(400, 'No se puede pagar un pedido cancelado');
      // A partir de aquí, `pedido` es SIEMPRE el destino vivo y el pago se
      // registra contra su id (puede diferir del pedidoId solicitado).
      const pedidoIdDestino = pedido.id;

      // "Total a pagar" = prendas + deuda anterior consolidada. El saldo se
      // mide contra ESE total, no sólo contra las prendas: así se permite abonar
      // más que el valor de las prendas cuando hay deuda anterior absorbida.
      const totalPrendas = Number(pedido.total);
      const totalPagar   = totalAPagar(pedido);
      const pagado       = sumaPagos(pedido);
      const saldo        = totalPagar - pagado;

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
      // Sesión de caja (arqueo ESTRICTO por sesión): respeta la enviada por
      // mobile si existe; si no, infiere la caja abierta del usuario.
      const cajaSesionId = await resolverCajaSesionIdPago(tx, cajaSesionIdEnviada, req.user.id);
      const pago = await tx.pago.create({
        data: {
          pedidoId: pedidoIdDestino,              // ← destino vivo (sigue consolidación)
          usuarioId: req.user.id,                 // ← SIEMPRE el empleado autenticado
          sesionTrabajoId: sesion?.id ?? null,    // ← puede quedar null si no hay sesion abierta
          cajaSesionId,                           // ← vínculo con la caja para el arqueo
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
      // Auto-entrega al cubrir el valor de las PRENDAS (decisión de negocio):
      // la ropa se entrega aunque quede deuda anterior pendiente; la deuda se
      // sigue cobrando aparte sobre el saldo total.
      const completado  = nuevoPagado >= totalPrendas - EPS;

      /* AUTO-ENTREGA: si este pago salda el pedido y todavía no está entregado,
       * lo marcamos como ENTREGADO automáticamente.
       *
       * El registro en PedidoEstadoHistorial SE MANTIENE (es evidencia: explica
       * por qué la orden cambió de estado y quién cobró), pero se marca
       * `origen: 'AUTO_PAGO'`. Ese marcador es el que permite que la actividad
       * del empleado NO liste un "Cambió estado: RECIBIDO → ENTREGADO" como si
       * fuera un movimiento hecho a mano: el empleado registró UN abono, no dos
       * acciones. Ver empleados.routes → /:id/actividad. */
      let entregadoAuto = false;
      if (completado && pedido.estado !== 'ENTREGADO' && pedido.estado !== 'CANCELADO') {
        await tx.pedido.update({
          where: { id: pedidoIdDestino },
          data:  { estado: 'ENTREGADO' }
        });
        await tx.pedidoEstadoHistorial.create({
          data: {
            pedidoId:       pedidoIdDestino,
            usuarioId:      req.user.id,
            estadoAnterior: pedido.estado,
            estadoNuevo:    'ENTREGADO',
            origen:         'AUTO_PAGO',
            accion:         'AUTO_ENTREGA_PAGO',
            observacion:    'Entrega automática: el abono cubrió el valor de las prendas.'
          }
        });
        entregadoAuto = true;
        console.log('[pagos.crear] auto-entrega aplicada', {
          pedidoId: pedidoIdDestino, usuarioId: req.user.id, estadoAnterior: pedido.estado
        });
      }

      return { pago, completado, entregadoAuto, pedidoId: pedidoIdDestino };
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

  // Usamos el pedido DESTINO real (puede diferir del solicitado si hubo
  // consolidación) para que clientes actualicen la factura correcta.
  const pedidoIdFinal = resultado.pedidoId ?? pedidoId;
  ioBus.emit('nuevo-pago', { pedidoId: pedidoIdFinal, pago: resultado.pago });
  if (resultado.entregadoAuto) {
    // Emitimos también el cambio de estado para que desktop/mobile se actualicen.
    const pedidoActualizado = await prisma.pedido.findUnique({
      where:   { id: pedidoIdFinal },
      include: { cliente: true }
    });
    ioBus.emit('estado-cambiado', {
      id:     pedidoIdFinal,
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
