const prisma = require('../lib/prisma');
const asyncHandler = require('../utils/asyncHandler');
const { HttpError } = require('../middlewares/error.middleware');
const { sesionAbiertaDeUsuario } = require('../lib/sesionesTrabajo');
const { calcularTotalesPago } = require('../lib/metodosPago');

// new Date("YYYY-MM-DD") parsea como UTC midnight, lo que en zona UTC-5 da la noche
// anterior en local, corriendo el rango un día atrás. Se usa el constructor con partes
// numéricas (new Date(y,m,d,...)) que siempre opera en zona horaria local del proceso.
const inicioDia = (fecha) => {
  if (fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    const [y, m, d] = fecha.split('-').map(Number);
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  }
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
};

const finDia = (fecha) => {
  if (fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    const [y, m, d] = fecha.split('-').map(Number);
    return new Date(y, m - 1, d + 1, 0, 0, 0, 0);
  }
  const now = inicioDia(null);
  now.setDate(now.getDate() + 1);
  return now;
};

/* Reutilizable: evalúa si un pago debe contarse en el resumen del empleado.
 * Misma regla que cajaSesion.controller.evaluarMatch para mantener consistencia. */
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

exports.resumen = asyncHandler(async (req, res) => {
  const { fecha, usuarioId, sesionTrabajoId } = req.query;
  const usuarioFiltro = usuarioId || req.user.id;

  const desde = inicioDia(fecha);
  const hasta = finDia(fecha);

  console.log('[caja.resumen] req.user.id:', req.user?.id);
  console.log('[caja.resumen] query recibido:', { fecha, usuarioId, sesionTrabajoId });
  console.log('[caja.resumen] rango calculado:', desde.toISOString(), '->', hasta.toISOString());

  const wherePedidos = {
    createdAt: { gte: desde, lt: hasta },
    estado: { not: 'CANCELADO' },
    eliminadoEn: null,
    usuarioId: usuarioFiltro,
  };
  if (sesionTrabajoId) wherePedidos.sesionTrabajoId = sesionTrabajoId;

  /* Estrategia: traer TODOS los pagos del rango con su pedido, evaluar en JS.
   * Antes el filtro de Prisma combinaba `pedido` raíz con OR + `pedido`, lo
   * que ocultaba pagos válidos cuando la caja tenía sesionTrabajoId distinta
   * a la del pago, o cuando el pago se hizo antes de abrir la caja. */
  const [pagosEnRango, pedidosUsuarioRango] = await Promise.all([
    prisma.pago.findMany({
      where: { createdAt: { gte: desde, lt: hasta } },
      include: {
        usuario: { select: { id: true, nombre: true } },
        pedido:  {
          select: {
            id: true, numero: true, total: true, usuarioId: true,
            estado: true, eliminadoEn: true,
            cliente: { select: { id: true, nombre: true, identificador: true } }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.pedido.findMany({
      where: wherePedidos,
      include: {
        cliente: { select: { id: true, nombre: true, identificador: true } },
        pagos:   true
      }
    })
  ]);

  console.log('[caja.resumen] pagos en rango (sin filtro usuario):', pagosEnRango.length);
  console.log('[caja.resumen] pedidos del usuario en rango (set A):', pedidosUsuarioRango.length);

  const pagos = [];
  for (const p of pagosEnRango) {
    const ev = evaluarMatch(p, usuarioFiltro, sesionTrabajoId ?? null);
    console.log(`[caja.resumen] eval pago.id=${p.id}`, {
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

  console.log('[caja.resumen] pagos INCLUIDOS:', pagos.length,
    '| filtro:', { usuarioId: usuarioFiltro, sesionTrabajoId: sesionTrabajoId ?? null });

  /* Pedidos referenciados por los pagos incluidos, no presentes en set A.
   * Estos pueden ser pedidos de otros usuarios o creados fuera del rango,
   * pero el empleado los cobró y por tanto cuentan en su caja. */
  const idsSetA = new Set(pedidosUsuarioRango.map((p) => p.id));
  const idsDesdePagos = Array.from(new Set(pagos.map((p) => p.pedidoId).filter(Boolean)));
  const idsExtra = idsDesdePagos.filter((id) => !idsSetA.has(id));
  console.log('[caja.resumen] pedidoIds desde pagos incluidos:', idsDesdePagos);
  console.log('[caja.resumen] pedidoIds extra a traer (no en set A):', idsExtra);

  const pedidosDesdePagos = idsExtra.length === 0 ? [] : await prisma.pedido.findMany({
    where: {
      id: { in: idsExtra },
      estado: { not: 'CANCELADO' },
      eliminadoEn: null
    },
    include: {
      cliente: { select: { id: true, nombre: true, identificador: true } },
      pagos:   true
    }
  });
  console.log('[caja.resumen] pedidos extra encontrados (set B):', pedidosDesdePagos.length);

  /* UNIÓN y dedupe por id (set A ∪ set B). */
  const mapaPedidos = new Map();
  for (const p of pedidosUsuarioRango) mapaPedidos.set(p.id, p);
  for (const p of pedidosDesdePagos)   mapaPedidos.set(p.id, p);
  const pedidos = Array.from(mapaPedidos.values());
  console.log('[caja.resumen] pedidos finales (deduplicados):', pedidos.length,
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
  const totalOtros = totalOtro;

  /* Pendiente real por pedido = total - SUMA DE TODOS sus pagos
   * (p.pagos incluye todos, no solo los del rango). */
  const pedidosConSaldo = pedidos.map((p) => {
    const pagadoPedido    = p.pagos.reduce((acc, pg) => acc + Number(pg.monto), 0);
    const pendientePedido = Math.max(0, Number(p.total) - pagadoPedido);
    return { ...p, pagadoPedido, pendientePedido };
  });

  const totalPendiente = pedidosConSaldo.reduce((acc, p) => acc + p.pendientePedido, 0);
  const totalOrdenes   = pedidos.length;
  const pedidosPagados = pedidosConSaldo.filter((p) => p.pendientePedido < 0.001).length;
  const pedidosPendientes = pedidosConSaldo.filter((p) => p.pendientePedido > 0).length;
  const valorOrdenado  = pedidos.reduce((acc, p) => acc + Number(p.total), 0);

  console.log('[caja.resumen] totales:', {
    totalRecibido, totalEfectivo, totalNequi, totalDaviplata, totalTransferencia,
    totalOrdenes, valorOrdenado, pedidosPagados, pedidosPendientes, totalPendiente
  });

  res.json({
    desde,
    hasta,
    totalRecibido,
    totalEfectivo,
    totalNequi,
    totalDaviplata,
    totalTransferencia,
    totalTarjeta,
    totalOtros,
    totalOtro: totalOtros,
    pagosPorMetodo: porMetodo,
    totalPendiente,
    totalOrdenes,
    valorOrdenado,
    pedidosPagados,
    pedidosPendientes,
    pagos: pagos.map((p) => ({
      id: p.id, pedidoId: p.pedidoId, monto: Number(p.monto),
      metodo: p.metodo, createdAt: p.createdAt,
      usuario: p.usuario, pedido: p.pedido
    }))
  });
});

exports.cierre = asyncHandler(async (req, res) => {
  const { costoManual, observaciones, fecha, sesionTrabajoId: sesionId } = req.body;

  const desde = inicioDia(fecha);
  const hasta = finDia(fecha);

  const wherePagos = {
    createdAt: { gte: desde, lt: hasta },
    usuarioId: req.user.id,
    pedido: { estado: { not: 'CANCELADO' }, eliminadoEn: null }
  };
  if (sesionId) wherePagos.sesionTrabajoId = sesionId;

  const wherePedidos = {
    createdAt: { gte: desde, lt: hasta },
    usuarioId: req.user.id,
    estado: { not: 'CANCELADO' },
    eliminadoEn: null
  };
  if (sesionId) wherePedidos.sesionTrabajoId = sesionId;

  const [pagos, pedidos] = await Promise.all([
    prisma.pago.findMany({ where: wherePagos }),
    prisma.pedido.findMany({ where: wherePedidos, include: { pagos: true } })
  ]);

  const {
    totalRecibido,
    totalEfectivo,
    totalTransferencia,
    totalTarjeta,
    totalOtro,
  } = calcularTotalesPago(pagos);
  const totalOtros = totalOtro;

  const totalPendiente = pedidos.reduce((acc, p) => {
    const pagado = p.pagos.reduce((s, pg) => s + Number(pg.monto), 0);
    return acc + Math.max(0, Number(p.total) - pagado);
  }, 0);

  const costoNum = costoManual != null ? Number(costoManual) : null;
  const utilidad = costoNum != null ? totalRecibido - costoNum : null;

  const sesionActual = await sesionAbiertaDeUsuario(prisma, req.user.id);
  const sesionTrabajoFinal = sesionId ?? sesionActual?.id ?? null;

  const cierre = await prisma.cajaCierre.create({
    data: {
      usuarioId:          req.user.id,
      sesionTrabajoId:    sesionTrabajoFinal,
      fecha:              desde,
      totalRecibido,
      totalEfectivo,
      totalTransferencia,
      totalTarjeta,
      totalOtros,
      totalPendiente,
      costoManual:        costoNum,
      utilidad,
      observaciones:      observaciones?.trim() || null
    },
    include: { usuario: { select: { id: true, nombre: true } } }
  });

  res.status(201).json(cierre);
});

exports.historial = asyncHandler(async (req, res) => {
  const { usuarioId, limit = 20 } = req.query;
  const where = {};
  if (usuarioId) where.usuarioId = usuarioId;
  else if (req.user.rol !== 'ADMIN') where.usuarioId = req.user.id;

  const cierres = await prisma.cajaCierre.findMany({
    where,
    include: { usuario: { select: { id: true, nombre: true } } },
    orderBy: { createdAt: 'desc' },
    take: Number(limit)
  });
  res.json(cierres);
});
