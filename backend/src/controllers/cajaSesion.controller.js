const prisma = require('../lib/prisma');
const asyncHandler = require('../utils/asyncHandler');
const { HttpError } = require('../middlewares/error.middleware');
const { sesionAbiertaDeUsuario } = require('../lib/sesionesTrabajo');
const { calcularTotalesPago } = require('../lib/metodosPago');
const { pendienteDePedido } = require('../lib/saldos');
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
  cajaSesionId = null,           // id de la CajaSesion: filtra gastos por sesión
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
  const [pagosEnRango, pedidosUsuarioRango, gastosEnRango] = await Promise.all([
    // PAGOS — ESTRICTO por sesión de caja (mismo criterio que gastos y que el
    // arqueo local de Mobile). Antes se filtraba por fecha [apertura, ahora] +
    // usuario, criterio distinto al de Mobile → efectivoEsperado/diferencia
    // divergían al cerrar/sincronizar. Sin cajaSesionId (llamada legacy) → [].
    cajaSesionId
      ? prisma.pago.findMany({
          where: { cajaSesionId },
          include: {
            pedido: { select: { id: true, numero: true, usuarioId: true, estado: true, eliminadoEn: true } }
          },
          orderBy: { createdAt: 'desc' }
        })
      : Promise.resolve([]),
    prisma.pedido.findMany({
      where: {
        usuarioId,
        createdAt: { gte: dOrd, lte: hOrd },
        estado: { not: 'CANCELADO' },
        eliminadoEn: null
      },
      include: { pagos: true, cliente: { select: { id: true, nombre: true, identificador: true } } }
    }),
    // Gastos de la sesión para el arqueo de caja. ESTRICTO por sesión: se
    // filtran por cajaSesionId (no por fecha) para que al abrir una caja nueva
    // los gastos arranquen en 0 y NO se mezclen entre días/sesiones (puntos 2 y
    // 5). Si no hay cajaSesionId (caja legacy/llamada sin id), no hay gastos.
    cajaSesionId
      ? prisma.gasto.findMany({
          where:   { deletedAt: null, cajaSesionId },
          select:  {
            id: true, fecha: true, concepto: true, categoria: true,
            valor: true, metodoPago: true, descripcion: true,
            creadoPor: { select: { id: true, nombre: true, rol: true } }
          },
          orderBy: { fecha: 'desc' }
        })
      : Promise.resolve([])
  ]);

  console.log(`[${reqTag}] rangos:`, {
    pagos:   { desde, hasta },
    ordenes: { desde: dOrd, hasta: hOrd }
  });
  console.log(`[${reqTag}] filtros pagos:`, { usuarioId, sesionTrabajoId });
  console.log(`[${reqTag}] pagos en rango (sin filtro):`, pagosEnRango.length);
  console.log(`[${reqTag}] pedidos del usuario en rango orden (set A):`, pedidosUsuarioRango.length);

  // Los pagos ya vienen ESTRICTOS por cajaSesionId. Solo excluimos los de
  // pedidos CANCELADO/eliminado (evaluarMatch.pedidoOk). El match por
  // usuario/sesión ya no decide inclusión (el vínculo de sesión lo hace), pero
  // se conserva en el log para diagnóstico.
  const pagos = [];
  for (const p of pagosEnRango) {
    const ev = evaluarMatch(p, usuarioId, sesionTrabajoId);
    console.log(`[${reqTag}] eval pago.id=${p.id}`, {
      monto:           Number(p.monto),
      metodo:          p.metodo,
      usuarioId:       p.usuarioId,
      sesionTrabajoId: p.sesionTrabajoId,
      cajaSesionId:    p.cajaSesionId,
      pedidoId:        p.pedidoId,
      pedidoUsuarioId: p.pedido?.usuarioId ?? null,
      pedidoEstado:    p.pedido?.estado ?? null,
      pedidoEliminado: p.pedido?.eliminadoEn != null,
      createdAt:       p.createdAt,
      matchUsuario:    ev.matchUsuario,
      matchSesion:     ev.matchSesion,
      matchPedido:     ev.matchPedido,
      pedidoOk:        ev.pedidoOk,
      incluido:        ev.pedidoOk,
      motivo:          ev.pedidoOk ? null : ev.motivo
    });
    if (ev.pedidoOk) pagos.push(p);
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

  /* Totales por método REALES: cada pago cuenta en su propio método.
   * NEQUI nunca se suma a transferencia ni a efectivo. */
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
    const pendiente  = pendienteDePedido(p, pagado);
    return { ...p, pagado, pendiente };
  });

  // Gastos: total, los que salen del EFECTIVO físico de la caja (método
  // EFECTIVO o sin método, que por defecto se consideran efectivo) y el resto
  // (Nequi, transferencia…), que NO afectan el arqueo de billetes.
  const totalGastos         = gastosEnRango.reduce((acc, g) => acc + Number(g.valor ?? 0), 0);
  const totalGastosEfectivo = gastosEnRango
    .filter((g) => !g.metodoPago || g.metodoPago === 'EFECTIVO')
    .reduce((acc, g) => acc + Number(g.valor ?? 0), 0);
  const totalGastosOtros    = totalGastos - totalGastosEfectivo;

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
    totalGastos, totalGastosEfectivo, totalGastosOtros,
    pagosPorMetodo: porMetodo,
    totalPendiente, totalOrdenes, valorOrdenado, pedidosPagados, pedidosPendientes,
    gastos: gastosEnRango.map((g) => ({
      id: g.id, fecha: g.fecha, concepto: g.concepto, categoria: g.categoria,
      valor: Number(g.valor ?? 0), metodoPago: g.metodoPago,
      descripcion: g.descripcion, creadoPor: g.creadoPor ?? null
    })),
    pagos: pagos.map((p) => ({
      id: p.id, pedidoId: p.pedidoId, monto: Number(p.monto),
      metodo: p.metodo, usuarioId: p.usuarioId, sesionTrabajoId: p.sesionTrabajoId,
      createdAt: p.createdAt, pedido: p.pedido
    }))
  };
};

/* Denominaciones válidas del peso colombiano para el conteo físico de caja.
 * Es la lista mínima pedida por el negocio; agregar una nueva es añadirla aquí
 * (y en la constante equivalente de Mobile/Desktop). */
const DENOMINACIONES_COP = [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500];

/** { "50000": "3", 20000: 2, basura: 9 } → { 50000: 3, 20000: 2 } */
const normalizarDenominaciones = (input) => {
  if (!input || typeof input !== 'object') return null;
  const out = {};
  for (const valor of DENOMINACIONES_COP) {
    const cantidad = Math.trunc(Number(input[valor] ?? input[String(valor)] ?? 0));
    if (Number.isFinite(cantidad) && cantidad > 0) out[valor] = cantidad;
  }
  return Object.keys(out).length > 0 ? out : null;
};

const sumaDenominaciones = (denoms) =>
  !denoms ? 0 : Object.entries(denoms).reduce((acc, [valor, cant]) => acc + Number(valor) * Number(cant), 0);

/* Resumen en CERO de una sesión recién abierta. Se devuelve junto con la caja
 * creada para que ningún cliente tenga que "adivinar" el estado inicial ni
 * reutilice el resumen que tenía en memoria de la sesión anterior. */
const RESUMEN_VACIO = (montoBase = 0) => ({
  totalRecibido: 0, totalEfectivo: 0, totalNequi: 0, totalDaviplata: 0,
  totalTransferencia: 0, totalTarjeta: 0, totalOtro: 0, totalOtros: 0,
  totalGastos: 0, totalGastosEfectivo: 0, totalGastosOtros: 0,
  pagosPorMetodo: {},
  totalPendiente: 0, totalOrdenes: 0, valorOrdenado: 0,
  pedidosPagados: 0, pedidosPendientes: 0,
  efectivoEsperado: Number(montoBase) || 0,
  gastos: [], pagos: []
});

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

  /* [diag-caja] Una caja recién abierta arranca SIEMPRE en cero: no hereda
   * pagos, gastos ni métodos de la sesión anterior porque el arqueo filtra
   * ESTRICTAMENTE por cajaSesionId y esta sesión es un id nuevo. */
  console.log('[diag-caja][abrir] sesión NUEVA creada', {
    cajaSesionId:  caja.id,
    usuarioId:     caja.usuarioId,
    estado:        caja.estado,
    fechaApertura: caja.fechaApertura,
    fechaCierre:   caja.fechaCierre,
    montoBase:     Number(caja.montoBase),
    origen:        'backend',
    motivo:        'POST /caja/abrir — no existía ninguna CajaSesion ABIERTA para este usuario'
  });

  res.status(201).json({ ...caja, resumen: RESUMEN_VACIO(Number(caja.montoBase)) });
});

// ─── GET /api/caja/actual ────────────────────────────────────────────────────

exports.actual = asyncHandler(async (req, res) => {
  console.log('[caja.actual] req.user.id:', req.user.id);

  /* La caja actual se busca SIEMPRE por (usuarioId + estado ABIERTA).
   * Nunca "la última caja": una sesión CERRADA no puede volver a ser la actual
   * bajo ninguna circunstancia. El orderBy solo desempata si por un fallo
   * quedaran dos abiertas (que además reparamos abajo). */
  const abiertas = await prisma.cajaSesion.findMany({
    where:   { usuarioId: req.user.id, estado: 'ABIERTA' },
    orderBy: { fechaApertura: 'desc' },
    include: { usuario: { select: { id: true, nombre: true } } }
  });

  if (abiertas.length === 0) {
    console.log('[diag-caja][actual] sin caja abierta', {
      usuarioId: req.user.id, origen: 'backend',
      motivo: 'no existe CajaSesion con estado=ABIERTA para este usuario'
    });
    return res.json(null);
  }

  const caja = abiertas[0];

  /* Invariante: un usuario no puede tener dos cajas abiertas. Si aparecieran
   * (p. ej. una apertura offline que se sincronizó dos veces), se cierran las
   * sobrantes dejando la MÁS RECIENTE como actual, y se deja constancia. */
  if (abiertas.length > 1) {
    const sobrantes = abiertas.slice(1).map((c) => c.id);
    console.warn('[diag-caja][actual] MÁS DE UNA caja abierta; cerrando sobrantes', {
      usuarioId: req.user.id, conservada: caja.id, cerradas: sobrantes
    });
    await prisma.cajaSesion.updateMany({
      where: { id: { in: sobrantes } },
      data:  { estado: 'CERRADA', fechaCierre: new Date(),
               observacionCierre: 'Cerrada automáticamente: sesión duplicada detectada por el servidor.' }
    });
  }

  console.log('[diag-caja][actual] caja seleccionada', {
    cajaSesionId:    caja.id,
    usuarioId:       caja.usuarioId,
    estado:          caja.estado,
    fechaApertura:   caja.fechaApertura,
    fechaCierre:     caja.fechaCierre,
    sesionTrabajoId: caja.sesionTrabajoId,
    origen:          'backend',
    motivo:          'única CajaSesion con usuarioId=' + req.user.id + ' y estado=ABIERTA'
  });

  /* Un ÚNICO rango: la sesión de caja [apertura, ahora].
   *
   * Antes las órdenes se contaban por DÍA completo, así que Mi Caja mostraba
   * también las órdenes creadas antes de abrir la caja o en una sesión
   * anterior del mismo día, y no coincidía con lo que calcula Mobile. Las
   * estadísticas son "de la sesión actual" y se cuentan desde la apertura. */
  const desde        = caja.fechaApertura;
  const hasta        = new Date();
  const desdeOrdenes = caja.fechaApertura;
  const hastaOrdenes = hasta;

  const resumen          = await calcularResumen({
    usuarioId: req.user.id,
    sesionTrabajoId: caja.sesionTrabajoId,
    cajaSesionId: caja.id,
    desde,
    hasta,
    desdeOrdenes,
    hastaOrdenes,
    reqTag: 'caja.actual',
  });
  // Efectivo esperado = base + efectivo recibido − gastos en efectivo.
  const efectivoEsperado = Number(caja.montoBase) + resumen.totalEfectivo - resumen.totalGastosEfectivo;

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
  const { cajaSesionId, efectivoContado, observacionCierre, denominaciones } = clean;

  /* Conteo físico por denominación. Solo billetes y monedas: Nequi y demás
   * métodos digitales NO entran aquí (no hay papel que contar). Si el cliente
   * envía el desglose y no envía `efectivoContado`, se toma la suma como
   * contado; si envía ambos, manda `efectivoContado` (lo que el cajero
   * confirmó) y el desglose queda como evidencia del conteo. */
  const denomLimpias = normalizarDenominaciones(denominaciones);
  const totalDenominaciones = sumaDenominaciones(denomLimpias);

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
    // Idempotente: un reintento desde la cola de sync no debe fallar con 409 ni
    // crear un doble cierre. Devolvemos 200 con la caja ya cerrada.
    console.log('[caja.cerrar] caja ya estaba cerrada → respuesta idempotente:', caja.id);
    const yaCerrada = await cargarCajaCerrada(caja.id);
    return res.status(200).json(yaCerrada ?? caja);
  }

  const desde = caja.fechaApertura;
  const hasta  = new Date();

  const resumen          = await calcularResumen({
    usuarioId: req.user.id,
    sesionTrabajoId: caja.sesionTrabajoId,
    cajaSesionId: caja.id,
    desde,
    hasta,
    reqTag: 'caja.cerrar',
  });
  /* EFECTIVO ESPERADO — solo dinero físico:
   *      base inicial + pagos EFECTIVO de la sesión − gastos EFECTIVO de la sesión
   * Nequi, Daviplata, transferencia y tarjeta NO entran: no hay billetes que
   * contar por esos cobros, así que no pueden alterar el arqueo. */
  const efectivoEsperado = Number(caja.montoBase) + resumen.totalEfectivo - resumen.totalGastosEfectivo;
  const contado = efectivoContado != null
    ? Number(efectivoContado)
    : (denomLimpias ? totalDenominaciones : null);
  const diferencia       = contado != null ? contado - efectivoEsperado : null;
  console.log('[caja.cerrar] cálculo:', {
    montoBase: Number(caja.montoBase), totalEfectivo: resumen.totalEfectivo,
    totalNequi: resumen.totalNequi, totalDaviplata: resumen.totalDaviplata,
    totalTransferencia: resumen.totalTransferencia,
    totalGastosEfectivo: resumen.totalGastosEfectivo, totalGastosOtros: resumen.totalGastosOtros,
    efectivoEsperado, contado, totalDenominaciones, diferencia
  });

  /* Sin transacción interactiva: una sola UPDATE es atómica por sí misma. Antes
   * el $transaction (update + createOperation sobre syncOperation) podía quedar
   * bloqueado esperando un lock que tenía /api/gastos → la petición colgaba
   * ("- - ms"). El registro de idempotencia se hace aparte (upsert idempotente). */
  const cajaCerrada = await prisma.cajaSesion.update({
    where: { id: caja.id },
    data: {
      estado:              'CERRADA',
      fechaCierre:         hasta,
      efectivoContado:     contado,
      totalEfectivo:       resumen.totalEfectivo,
      // Nequi y Daviplata con columna propia: el cierre histórico conserva el
      // desglose real y no queda absorbido por "transferencia".
      totalNequi:          resumen.totalNequi,
      totalDaviplata:      resumen.totalDaviplata,
      totalTransferencia:  resumen.totalTransferencia,
      totalTarjeta:        resumen.totalTarjeta,
      totalOtro:           resumen.totalOtro,
      totalRecibido:       resumen.totalRecibido,
      totalGastos:         resumen.totalGastos,
      totalGastosEfectivo: resumen.totalGastosEfectivo,
      totalPendiente:      resumen.totalPendiente,
      efectivoEsperado,
      diferencia,
      denominacionesJson:  denomLimpias ? JSON.stringify(denomLimpias) : null,
      observacionCierre:   observacionCierre?.trim() || null
    },
    include: { usuario: { select: { id: true, nombre: true } } }
  });

  if (meta) {
    try {
      await createOperation(prisma, meta, {
        entityType:  'CAJA_SESION',
        entityId:    cajaCerrada.id,
        action:      'CERRAR',
        payloadHash: payloadHash(clean)
      });
    } catch (e) {
      console.warn('[caja.cerrar] no se pudo registrar operación de idempotencia (caja cerrada):', e?.message);
    }
  }

  console.log('[diag-caja][cerrar] sesión CERRADA', {
    cajaSesionId:  cajaCerrada.id,
    usuarioId:     cajaCerrada.usuarioId,
    estado:        cajaCerrada.estado,
    fechaApertura: cajaCerrada.fechaApertura,
    fechaCierre:   cajaCerrada.fechaCierre,
    efectivoEsperado, efectivoContado: contado, diferencia,
    origen: 'backend',
    motivo: 'POST /caja/cerrar — no puede volver a seleccionarse como caja actual'
  });

  res.json({
    ...cajaCerrada,
    denominaciones: denomLimpias,
    resumen: { ...resumen, efectivoEsperado, efectivoContado: contado, diferencia }
  });
});

/* ─── GET /api/caja/sesiones/:id — detalle de UNA sesión (abierta o cerrada) ──
 *
 * Devuelve el cierre con su desglose y, sobre todo, los GASTOS y PAGOS de esa
 * sesión filtrados por `cajaSesionId` — nunca por fecha. Así Desktop muestra
 * exactamente los movimientos de esa caja y no los de otra sesión del mismo día.
 *
 * Por qué hacía falta: hasta ahora solo existía `/caja/actual`, que sirve la
 * sesión ABIERTA. Una vez cerrada, Desktop se quedaba sin forma de consultar
 * sus gastos: por eso el cierre aparecía sin ellos aunque estuvieran bien
 * guardados. Es de solo lectura. */
exports.detalleSesion = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const caja = await prisma.cajaSesion.findUnique({
    where:   { id },
    include: { usuario: { select: { id: true, nombre: true, email: true, rol: true } } }
  });
  if (!caja) throw new HttpError(404, 'Sesión de caja no encontrada');

  // Un empleado solo puede ver sus propias cajas; ADMIN ve todas.
  if (req.user.rol !== 'ADMIN' && caja.usuarioId !== req.user.id) {
    throw new HttpError(403, 'Sin permiso para ver la caja de otro empleado');
  }

  const [gastos, pagos] = await Promise.all([
    prisma.gasto.findMany({
      where:   { cajaSesionId: id, deletedAt: null },
      include: { creadoPor: { select: { id: true, nombre: true, rol: true } } },
      orderBy: { fecha: 'asc' }
    }),
    prisma.pago.findMany({
      where:   { cajaSesionId: id },
      include: {
        usuario: { select: { id: true, nombre: true } },
        pedido:  { select: { id: true, numero: true, numeroLocal: true, cliente: { select: { nombre: true, identificador: true } } } }
      },
      orderBy: { createdAt: 'asc' }
    })
  ]);

  const totalGastos = gastos.reduce((acc, g) => acc + Number(g.valor ?? 0), 0);
  const totalGastosEfectivo = gastos
    .filter((g) => !g.metodoPago || g.metodoPago === 'EFECTIVO')
    .reduce((acc, g) => acc + Number(g.valor ?? 0), 0);

  /* Totales por método: si la sesión ya está cerrada se usan los valores
   * PERSISTIDOS en el cierre (la foto del momento). Si sigue abierta, se
   * recalculan de los pagos vivos. */
  const cerrada = caja.estado === 'CERRADA';
  const calculados = calcularTotalesPago(pagos);
  const num = (v, alt) => (v != null ? Number(v) : alt);

  console.log('[caja.detalleSesion]', {
    cajaSesionId: id, usuarioId: caja.usuarioId, estado: caja.estado,
    gastos: gastos.length, idsGastos: gastos.map((g) => g.id),
    totalGastos, totalGastosEfectivo, pagos: pagos.length
  });

  res.json({
    cajaSesion: caja,
    denominaciones: caja.denominacionesJson ? JSON.parse(caja.denominacionesJson) : null,
    resumen: {
      totalEfectivo:      cerrada ? num(caja.totalEfectivo, calculados.totalEfectivo)           : calculados.totalEfectivo,
      totalNequi:         cerrada ? num(caja.totalNequi, calculados.totalNequi)                 : calculados.totalNequi,
      totalDaviplata:     cerrada ? num(caja.totalDaviplata, calculados.totalDaviplata)         : calculados.totalDaviplata,
      totalTransferencia: cerrada ? num(caja.totalTransferencia, calculados.totalTransferencia) : calculados.totalTransferencia,
      totalTarjeta:       cerrada ? num(caja.totalTarjeta, calculados.totalTarjeta)             : calculados.totalTarjeta,
      totalOtro:          cerrada ? num(caja.totalOtro, calculados.totalOtro)                   : calculados.totalOtro,
      totalRecibido:      cerrada ? num(caja.totalRecibido, calculados.totalRecibido)           : calculados.totalRecibido,
      // Los gastos SIEMPRE se recuentan de las filas vigentes: si un gasto se
      // anuló después del cierre, el detalle debe reflejarlo.
      totalGastos,
      totalGastosEfectivo,
      totalGastosOtros: totalGastos - totalGastosEfectivo,
      efectivoEsperado: num(caja.efectivoEsperado, null),
      efectivoContado:  num(caja.efectivoContado, null),
      diferencia:       num(caja.diferencia, null),
      totalPendiente:   num(caja.totalPendiente, null)
    },
    gastos: gastos.map((g) => ({
      id: g.id, fecha: g.fecha, concepto: g.concepto, categoria: g.categoria,
      descripcion: g.descripcion, metodoPago: g.metodoPago ?? 'EFECTIVO',
      valor: Number(g.valor ?? 0), creadoPor: g.creadoPor ?? null
    })),
    pagos: pagos.map((p) => ({
      id: p.id, createdAt: p.createdAt, monto: Number(p.monto ?? 0), metodo: p.metodo,
      usuario: p.usuario ?? null, pedido: p.pedido ?? null
    }))
  });
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
