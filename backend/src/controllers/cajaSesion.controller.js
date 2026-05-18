const prisma = require('../lib/prisma');
const asyncHandler = require('../utils/asyncHandler');
const { HttpError } = require('../middlewares/error.middleware');
const { sesionAbiertaDeUsuario } = require('../lib/sesionesTrabajo');
const { calcularTotalesPago } = require('../lib/metodosPago');
const {
  pickSyncMeta, stripSyncMeta, payloadHash,
  findOperation, createOperation, logDuplicate
} = require('../lib/idempotency');

/**
 * Evalúa si un pago debe contarse en la caja del empleado.
 *
 * Regla LavaSuit:
 *  - Pedido válido: NO cancelado y NO eliminado.
 *  - Cuenta si CUALQUIERA de estas condiciones se cumple:
 *      a) pago.usuarioId === empleado                     (cobró el empleado)
 *      b) pago.sesionTrabajoId === caja.sesionTrabajoId   (misma sesión)
 *      c) pago.pedido.usuarioId === empleado              (pedido del empleado)
 *  - Aunque sesionTrabajoId del pago sea null, si (a) o (c) se cumple, cuenta.
 */
const evaluarMatch = (p, usuarioId, sesionTrabajoId) => {
  const pedidoOk = !!p.pedido && p.pedido.estado !== 'CANCELADO' && p.pedido.eliminadoEn == null;
  const matchUsuario = p.usuarioId === usuarioId;
  const matchSesion  = !!sesionTrabajoId && p.sesionTrabajoId === sesionTrabajoId;
  const matchPedido  = !!p.pedido && p.pedido.usuarioId === usuarioId;
  const incluido     = pedidoOk && (matchUsuario || matchSesion || matchPedido);

  let motivo = null;
  if (!pedidoOk) {
    motivo = !p.pedido
      ? 'pedido_inexistente'
      : (p.pedido.estado === 'CANCELADO' ? 'pedido_cancelado' : 'pedido_eliminado');
  } else if (!incluido) {
    motivo = 'sin_match_usuario_ni_sesion_ni_pedido_usuario';
  }
  return { incluido, motivo, matchUsuario, matchSesion, matchPedido, pedidoOk };
};

/**
 * Calcula el resumen financiero de una caja dado un rango de fechas y usuario.
 * Se usa tanto en GET /actual (live) como en POST /cerrar (snapshot final).
 *
 * Estrategia diagnóstica:
 *  - Traemos TODOS los pagos del rango (sin filtros de usuario/sesion en SQL).
 *  - Filtramos en JS aplicando `evaluarMatch` para tener trazabilidad total.
 *  - Loguamos cada pago con su evaluación, así se ve por qué se incluye o no.
 */
const calcularResumen = async ({
  usuarioId, sesionTrabajoId = null,
  desde, hasta,                  // rango de PAGOS (sesión de caja)
  desdeOrdenes, hastaOrdenes,    // rango de PEDIDOS (día del empleado); opcional
  reqTag = 'caja'
}) => {
  /* Si el llamador no especifica rango distinto para pedidos, usamos el mismo
   * que para pagos. /caja/actual usa rango día completo para pedidos; /cerrar
   * (snapshot histórico) usa el rango de la sesión para ambos. */
  const dOrd = desdeOrdenes ?? desde;
  const hOrd = hastaOrdenes ?? hasta;

  /* PAGOS — todos los del rango de sesión; filtramos en JS con evaluarMatch.
   * PEDIDOS — set A: creados por el empleado en el rango de órdenes (día).
   * Luego sumamos set B: pedidos referenciados por los pagos incluidos,
   * aunque sean de otro día o de otro empleado. */
  const [pagosEnRango, pedidosUsuarioRango] = await Promise.all([
    prisma.pago.findMany({
      where: { createdAt: { gte: desde, lte: hasta } },
      include: {
        pedido: { select: { id: true, numero: true, usuarioId: true, estado: true, eliminadoEn: true } }
      },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.pedido.findMany({
      where: {
        usuarioId,
        createdAt: { gte: dOrd, lte: hOrd },
        estado: { not: 'CANCELADO' },
        eliminadoEn: null
      },
      include: { pagos: true, cliente: { select: { id: true, nombre: true, identificador: true } } }
    })
  ]);

  console.log(`[${reqTag}] rangos:`, {
    pagos:   { desde, hasta },
    ordenes: { desde: dOrd, hasta: hOrd }
  });
  console.log(`[${reqTag}] filtros pagos:`, { usuarioId, sesionTrabajoId });
  console.log(`[${reqTag}] pagos en rango (sin filtro):`, pagosEnRango.length);
  console.log(`[${reqTag}] pedidos del usuario en rango orden (set A):`, pedidosUsuarioRango.length);

  // Filtro JS + diagnóstico por pago
  const pagos = [];
  for (const p of pagosEnRango) {
    const ev = evaluarMatch(p, usuarioId, sesionTrabajoId);
    console.log(`[${reqTag}] eval pago.id=${p.id}`, {
      monto:           Number(p.monto),
      metodo:          p.metodo,
      usuarioId:       p.usuarioId,
      sesionTrabajoId: p.sesionTrabajoId,
      pedidoId:        p.pedidoId,
      pedidoUsuarioId: p.pedido?.usuarioId ?? null,
      pedidoEstado:    p.pedido?.estado ?? null,
      pedidoEliminado: p.pedido?.eliminadoEn != null,
      createdAt:       p.createdAt,
      matchUsuario:    ev.matchUsuario,
      matchSesion:     ev.matchSesion,
      matchPedido:     ev.matchPedido,
      pedidoOk:        ev.pedidoOk,
      incluido:        ev.incluido,
      motivo:          ev.motivo
    });
    if (ev.incluido) pagos.push(p);
  }
  console.log(`[${reqTag}] cantidad pagos INCLUIDOS:`, pagos.length);

  /* SET B — pedidos a los que apuntan los pagos incluidos (sin fecha/usuario). */
  const idsSetA = new Set(pedidosUsuarioRango.map((p) => p.id));
  const idsDesdePagos = Array.from(new Set(pagos.map((p) => p.pedidoId).filter(Boolean)));
  const idsExtra = idsDesdePagos.filter((id) => !idsSetA.has(id));
  console.log(`[${reqTag}] pedidoIds desde pagos incluidos:`, idsDesdePagos);
  console.log(`[${reqTag}] pedidoIds extra a traer (no en set A):`, idsExtra);

  const pedidosDesdePagos = idsExtra.length === 0 ? [] : await prisma.pedido.findMany({
    where: {
      id: { in: idsExtra },
      estado: { not: 'CANCELADO' },
      eliminadoEn: null
    },
    include: { pagos: true, cliente: { select: { id: true, nombre: true, identificador: true } } }
  });
  console.log(`[${reqTag}] pedidos extra encontrados (set B):`, pedidosDesdePagos.length);

  /* UNIÓN y dedupe por id */
  const mapaPedidos = new Map();
  for (const p of pedidosUsuarioRango) mapaPedidos.set(p.id, p);
  for (const p of pedidosDesdePagos)   mapaPedidos.set(p.id, p);
  const pedidos = Array.from(mapaPedidos.values());
  console.log(`[${reqTag}] pedidos finales (deduplicados):`, pedidos.length,
    pedidos.map((p) => ({ id: p.id, numero: p.numero, usuarioId: p.usuarioId, total: Number(p.total) })));

  const {
    porMetodo,
    totalRecibido,
    totalEfectivo,
    totalNequi,
    totalDaviplata,
    totalTransferencia,
    totalTarjeta,
    totalOtro,
  } = calcularTotalesPago(pagos);

  /* Pendiente real por pedido = total - SUMA DE TODOS sus pagos (no solo
   * los del rango). El array p.pagos viene ya con todos los pagos del
   * pedido por el include arriba. */
  const pedidosConSaldo = pedidos.map((p) => {
    const pagado     = p.pagos.reduce((acc, pg) => acc + Number(pg.monto), 0);
    const pendiente  = Math.max(0, Number(p.total) - pagado);
    return { ...p, pagado, pendiente };
  });

  const totalPendiente    = pedidosConSaldo.reduce((acc, p) => acc + p.pendiente, 0);
  const totalOrdenes      = pedidos.length;
  const valorOrdenado     = pedidos.reduce((acc, p) => acc + Number(p.total), 0);
  const pedidosPagados    = pedidosConSaldo.filter((p) => p.pendiente < 0.001).length;
  const pedidosPendientes = pedidosConSaldo.filter((p) => p.pendiente > 0).length;

  console.log(`[${reqTag}] totales:`, {
    totalRecibido, totalEfectivo, totalNequi, totalDaviplata, totalTransferencia,
    totalOrdenes, valorOrdenado, pedidosPagados, pedidosPendientes, totalPendiente
  });

  return {
    totalRecibido, totalEfectivo, totalNequi, totalDaviplata, totalTransferencia, totalTarjeta, totalOtro,
    totalOtros: totalOtro,
    pagosPorMetodo: porMetodo,
    totalPendiente, totalOrdenes, valorOrdenado, pedidosPagados, pedidosPendientes,
    pagos: pagos.map((p) => ({
      id: p.id, pedidoId: p.pedidoId, monto: Number(p.monto),
      metodo: p.metodo, usuarioId: p.usuarioId, sesionTrabajoId: p.sesionTrabajoId,
      createdAt: p.createdAt, pedido: p.pedido
    }))
  };
};

// ─── POST /api/caja/abrir ────────────────────────────────────────────────────

exports.abrir = asyncHandler(async (req, res) => {
  const meta = pickSyncMeta(req.body);
  if (meta?.invalid) throw new HttpError(400, 'clientMutationId y deviceId deben enviarse juntos');

  const cargarCaja = (id) => prisma.cajaSesion.findUnique({
    where: { id },
    include: { usuario: { select: { id: true, nombre: true } } }
  });

  if (meta) {
    const op = await findOperation(prisma, meta);
    if (op) {
      logDuplicate(op);
      const existente = await cargarCaja(op.entityId);
      if (existente) return res.status(200).json(existente);
    }
  }

  const clean = stripSyncMeta(req.body);
  const { montoBase = 0, observacionApertura } = clean;

  console.log('[caja.abrir] usuarioId:', req.user.id, '| montoBase:', montoBase);

  const cajaActiva = await prisma.cajaSesion.findFirst({
    where: { usuarioId: req.user.id, estado: 'ABIERTA' }
  });
  if (cajaActiva) {
    throw new HttpError(
      409,
      `Ya tienes una caja abierta desde ${new Date(cajaActiva.fechaApertura).toLocaleString()}`
    );
  }

  const montoBaseNum = Number(montoBase);
  if (isNaN(montoBaseNum) || montoBaseNum < 0) {
    throw new HttpError(400, 'montoBase debe ser un número mayor o igual a 0');
  }

  const sesion = await sesionAbiertaDeUsuario(prisma, req.user.id);

  const caja = await prisma.$transaction(async (tx) => {
    const creada = await tx.cajaSesion.create({
      data: {
        usuarioId:           req.user.id,
        sesionTrabajoId:     sesion?.id ?? null,
        montoBase:           montoBaseNum,
        observacionApertura: observacionApertura?.trim() || null,
        estado:              'ABIERTA'
      },
      include: { usuario: { select: { id: true, nombre: true } } }
    });

    if (meta) {
      await createOperation(tx, meta, {
        entityType:  'CAJA_SESION',
        entityId:    creada.id,
        action:      'ABRIR',
        payloadHash: payloadHash(clean)
      });
    }

    return creada;
  });

  console.log('[caja.abrir] caja creada id:', caja.id);
  res.status(201).json(caja);
});

// ─── GET /api/caja/actual ────────────────────────────────────────────────────

exports.actual = asyncHandler(async (req, res) => {
  console.log('[caja.actual] req.user.id:', req.user.id);

  const caja = await prisma.cajaSesion.findFirst({
    where:   { usuarioId: req.user.id, estado: 'ABIERTA' },
    orderBy: { fechaApertura: 'desc' },
    include: { usuario: { select: { id: true, nombre: true } } }
  });

  if (!caja) return res.json(null);
  console.log('[caja.actual] cajaSesion abierta encontrada:', {
    id: caja.id,
    usuarioId: caja.usuarioId,
    sesionTrabajoId: caja.sesionTrabajoId,
    fechaApertura: caja.fechaApertura,
  });

  /* Dos rangos:
   *  - pagos: desde la apertura de la caja hasta ahora (lo recaudado en la sesión)
   *  - ordenes: desde el inicio del día hasta el fin del día (todas las órdenes
   *    del empleado en el día, incluso creadas antes de abrir caja o sin pago)
   */
  const desde       = caja.fechaApertura;
  const hasta       = new Date();
  const desdeOrdenes = new Date();
  desdeOrdenes.setHours(0, 0, 0, 0);
  const hastaOrdenes = new Date(desdeOrdenes);
  hastaOrdenes.setDate(hastaOrdenes.getDate() + 1);
  // hastaOrdenes = inicio del día siguiente. La query usa lte, así que ajustamos
  // a 23:59:59.999 del día actual para no incluir el siguiente día.
  hastaOrdenes.setMilliseconds(hastaOrdenes.getMilliseconds() - 1);

  const resumen          = await calcularResumen({
    usuarioId: req.user.id,
    sesionTrabajoId: caja.sesionTrabajoId,
    desde,
    hasta,
    desdeOrdenes,
    hastaOrdenes,
    reqTag: 'caja.actual',
  });
  const efectivoEsperado = Number(caja.montoBase) + resumen.totalEfectivo;

  console.log(
    '[caja.actual] id:', caja.id,
    '| totalRecibido:', resumen.totalRecibido,
    '| efectivoEsperado:', efectivoEsperado
  );

  res.json({ cajaSesion: caja, resumen: { ...resumen, efectivoEsperado } });
});

// ─── POST /api/caja/cerrar ───────────────────────────────────────────────────

exports.cerrar = asyncHandler(async (req, res) => {
  const meta = pickSyncMeta(req.body);
  if (meta?.invalid) throw new HttpError(400, 'clientMutationId y deviceId deben enviarse juntos');

  const cargarCajaCerrada = (id) => prisma.cajaSesion.findUnique({
    where: { id },
    include: { usuario: { select: { id: true, nombre: true } } }
  });

  if (meta) {
    const op = await findOperation(prisma, meta);
    if (op) {
      logDuplicate(op);
      const existente = await cargarCajaCerrada(op.entityId);
      if (existente) return res.status(200).json(existente);
    }
  }

  const clean = stripSyncMeta(req.body);
  const { cajaSesionId, efectivoContado, observacionCierre } = clean;

  console.log(
    '[caja.cerrar] usuarioId:', req.user.id,
    '| cajaSesionId:', cajaSesionId ?? 'auto',
    '| efectivoContado:', efectivoContado
  );

  let caja;
  if (cajaSesionId) {
    caja = await prisma.cajaSesion.findFirst({
      where: { id: cajaSesionId, usuarioId: req.user.id }
    });
    if (!caja) throw new HttpError(404, 'Caja no encontrada');
  } else {
    caja = await prisma.cajaSesion.findFirst({
      where:   { usuarioId: req.user.id, estado: 'ABIERTA' },
      orderBy: { fechaApertura: 'desc' }
    });
    if (!caja) throw new HttpError(404, 'No hay caja abierta para cerrar');
  }

  if (caja.estado === 'CERRADA') {
    throw new HttpError(409, 'La caja ya está cerrada');
  }

  const desde = caja.fechaApertura;
  const hasta  = new Date();

  const resumen          = await calcularResumen({
    usuarioId: req.user.id,
    sesionTrabajoId: caja.sesionTrabajoId,
    desde,
    hasta,
    reqTag: 'caja.cerrar',
  });
  const efectivoEsperado = Number(caja.montoBase) + resumen.totalEfectivo;
  const contado          = efectivoContado != null ? Number(efectivoContado) : null;
  const diferencia       = contado != null ? contado - efectivoEsperado : null;

  const cajaCerrada = await prisma.$transaction(async (tx) => {
    const cerrada = await tx.cajaSesion.update({
      where: { id: caja.id },
      data: {
        estado:              'CERRADA',
        fechaCierre:         hasta,
        efectivoContado:     contado,
        totalEfectivo:       resumen.totalEfectivo,
        totalTransferencia:  resumen.totalTransferencia,
        totalTarjeta:        resumen.totalTarjeta,
        totalOtro:           resumen.totalOtro,
        totalRecibido:       resumen.totalRecibido,
        totalPendiente:      resumen.totalPendiente,
        efectivoEsperado,
        diferencia,
        observacionCierre:   observacionCierre?.trim() || null
      },
      include: { usuario: { select: { id: true, nombre: true } } }
    });

    if (meta) {
      await createOperation(tx, meta, {
        entityType:  'CAJA_SESION',
        entityId:    cerrada.id,
        action:      'CERRAR',
        payloadHash: payloadHash(clean)
      });
    }

    return cerrada;
  });

  console.log(
    '[caja.cerrar] cerrada id:', cajaCerrada.id,
    '| efectivoEsperado:', efectivoEsperado,
    '| efectivoContado:', contado,
    '| diferencia:', diferencia
  );

  res.json({ ...cajaCerrada, resumen });
});

// ─── GET /api/caja/sesiones (historial CajaSesion) ───────────────────────────

exports.sesiones = asyncHandler(async (req, res) => {
  const { usuarioId, limit = 30, estado } = req.query;

  const where = {};
  if (estado) where.estado = estado;

  if (usuarioId) {
    where.usuarioId = usuarioId;
  } else if (req.user.rol !== 'ADMIN') {
    where.usuarioId = req.user.id;
  }

  const sesiones = await prisma.cajaSesion.findMany({
    where,
    include: { usuario: { select: { id: true, nombre: true } } },
    orderBy: { fechaApertura: 'desc' },
    take:    Number(limit)
  });

  res.json(sesiones);
});
