const router = require('express').Router();
const prisma = require('../lib/prisma');
const auth   = require('../middlewares/auth.middleware');
const asyncHandler = require('../utils/asyncHandler');
const { calcularTotalesPago, normalizarMetodoPago } = require('../lib/metodosPago');
const { pendienteDePedido } = require('../lib/saldos');

router.use(auth);

/* Estados que mantienen la prenda FÍSICAMENTE en la tintorería (no entregada
 * ni cancelada). Sirve para derivar el inventario operativo sin tabla nueva. */
const ESTADOS_EN_TIENDA = ['RECIBIDO', 'EN_PROCESO', 'LISTO'];

/* Clave de tipo de prenda para agrupar inventario: prioriza el código del
 * servicio (PH, CAM, PD), luego nombre del servicio, luego nombre del item. */
const tipoPrenda = (item) => {
  const cod = (item?.servicio?.codigo ?? '').trim().toUpperCase();
  if (cod) return cod;
  return (item?.servicio?.nombre ?? item?.nombre ?? 'PRENDA').trim();
};

const sumar = (items, selector) =>
  items.reduce((acc, item) => acc + Number(selector(item) ?? 0), 0);

const inicioDia = (fecha = new Date()) => {
  const d = new Date(fecha);
  d.setHours(0, 0, 0, 0);
  return d;
};

const finDia = (fecha = new Date()) => {
  const d = inicioDia(fecha);
  d.setDate(d.getDate() + 1);
  return d;
};

/* Parsea 'YYYY-MM-DD' como fecha LOCAL (no UTC). `new Date('2026-05-30')`
 * interpreta el string como medianoche UTC, que en zonas con offset negativo
 * (p.ej. Colombia UTC-5) cae el día anterior y desalinea los rangos. Aquí lo
 * construimos con los componentes locales para que coincida con inicioDia/finDia. */
const parseFechaLocal = (str) => {
  if (!str) return new Date();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(str));
  if (!m) return new Date(str);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
};

const rangoMesActual = () => {
  const ahora = new Date();
  return {
    desde: new Date(ahora.getFullYear(), ahora.getMonth(), 1),
    hasta: new Date(ahora.getFullYear(), ahora.getMonth() + 1, 1)
  };
};

const pagosPorMetodo = (pagos) =>
  pagos.reduce((acc, pago) => {
    acc[pago.metodo] = (acc[pago.metodo] ?? 0) + Number(pago.monto);
    return acc;
  }, {});

const construirReporte = async ({ desde, hasta, incluirPedidos = false, usuarioId = null }) => {
  const wherePedidosPeriodo = {
    createdAt:   { gte: desde, lt: hasta },
    estado:      { not: 'CANCELADO' },
    eliminadoEn: null
  };

  if (usuarioId) wherePedidosPeriodo.usuarioId = usuarioId;

  const wherePagosPeriodo = {
    createdAt: { gte: desde, lt: hasta },
    ...(usuarioId ? { usuarioId } : {}),
    pedido: {
      estado:      { not: 'CANCELADO' },
      eliminadoEn: null
    }
  };

  const whereGarantiasPeriodo = {
    createdAt: { gte: desde, lt: hasta },
    ...(usuarioId ? { usuarioId } : {})
  };

  const [pedidos, pagos, garantiasAbiertas, garantiasResueltas] = await Promise.all([
    prisma.pedido.findMany({
      where: wherePedidosPeriodo,
      include: {
        cliente: true,
        usuario: { select: { id: true, nombre: true } },
        items:   true,
        pagos:   true
      },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.pago.findMany({
      where: wherePagosPeriodo,
      include: {
        pedido: {
          select: {
            id:          true,
            numero:      true,
            total:       true,
            cliente:     { select: { id: true, nombre: true } },
            usuarioId:   true,
            usuario:     { select: { id: true, nombre: true } },
            createdAt:   true
          }
        }
        ,
        usuario: { select: { id: true, nombre: true } }
      },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.garantia.count({
      where: { ...whereGarantiasPeriodo, estado: { in: ['ABIERTA', 'EN_REVISION'] } }
    }),
    prisma.garantia.count({
      where: { ...whereGarantiasPeriodo, estado: 'RESUELTA' }
    })
  ]);

  const pedidosConSaldos = pedidos.map((pedido) => {
    const totalPagadoPedido = sumar(pedido.pagos, (p) => p.monto);
    return {
      ...pedido,
      totalPagado: totalPagadoPedido,
      pendiente:   pendienteDePedido(pedido, totalPagadoPedido),
      totalPrendas: sumar(pedido.items, (item) => item.cantidad)
    };
  });

  const valorOrdenado = sumar(pedidos, (pedido) => pedido.total);
  const totalPagado   = sumar(pagos, (pago) => pago.monto);
  const totalPendiente = sumar(pedidosConSaldos, (pedido) => pedido.pendiente);
  const pedidosPendientesPago = pedidosConSaldos
    .filter((pedido) => pedido.pendiente > 0)
    .map((pedido) => ({
      id:            pedido.id,
      numero:        pedido.numero,
      cliente:       pedido.cliente,
      total:         Number(pedido.total),
      totalPagado:   pedido.totalPagado,
      pendiente:     pedido.pendiente,
      createdAt:     pedido.createdAt
    }));

  return {
    desde,
    hasta,
    totalOrdenes: pedidos.length,
    cantidad:     pedidos.length,
    valorOrdenado,
    totalPrendas: sumar(pedidosConSaldos, (pedido) => pedido.totalPrendas),
    totalPagado,
    total:        totalPagado,
    pagosPorMetodo: pagosPorMetodo(pagos),
    totalPagos:      pagos.length,
    totalPendiente,
    garantiasAbiertas,
    garantiasResueltas,
    garantiasPendientesEmpleado: usuarioId ? garantiasAbiertas : undefined,
    pedidosPendientesPago,
    pagos: pagos.map((pago) => ({
      id:        pago.id,
      pedidoId:  pago.pedidoId,
      usuarioId: pago.usuarioId,
      usuario:   pago.usuario,
      monto:     Number(pago.monto),
      metodo:    pago.metodo,
      createdAt: pago.createdAt,
      pedido:    pago.pedido
    })),
    ...(incluirPedidos ? { pedidos: pedidosConSaldos } : {})
  };
};

router.get('/ventas-dia',
  asyncHandler(async (req, res) => {
    const reporte = await construirReporte({
      desde: inicioDia(),
      hasta: finDia(),
      incluirPedidos: true,
      usuarioId: req.query.usuarioId || null
    });
    res.json({
      ...reporte,
      dineroRecibido: reporte.totalPagado,
      pagosDelDia: reporte.pagos
    });
  })
);

router.get('/ventas-mes',
  asyncHandler(async (req, res) => {
    const { desde, hasta } = rangoMesActual();
    const reporte = await construirReporte({
      desde,
      hasta,
      usuarioId: req.query.usuarioId || null
    });
    res.json({
      ...reporte,
      dineroRecibido: reporte.totalPagado,
      pagosDelMes: reporte.pagos
    });
  })
);

router.get('/caja-recolector',
  asyncHandler(async (req, res) => {
    const reporte = await construirReporte({
      desde: inicioDia(),
      hasta: finDia(),
      usuarioId: req.user.id
    });

    res.json({
      usuarioId: req.user.id,
      desde: reporte.desde,
      hasta: reporte.hasta,
      totalPagado: reporte.totalPagado,
      dineroRecibido: reporte.totalPagado,
      total: reporte.totalPagado,
      pagosPorMetodo: reporte.pagosPorMetodo,
      totalPagos: reporte.totalPagos,
      pagos: reporte.pagos
    });
  })
);

router.get('/por-empleado',
  asyncHandler(async (req, res) => {
    const desde = inicioDia(parseFechaLocal(req.query.desde));
    const hasta = req.query.hasta ? finDia(parseFechaLocal(req.query.hasta)) : finDia(desde);

    const usuarios = await prisma.usuario.findMany({
      select: { id: true, nombre: true, rol: true },
      orderBy: { nombre: 'asc' }
    });

    const empleados = await Promise.all(usuarios.map(async (usuario) => {
      const reporte = await construirReporte({ desde, hasta, usuarioId: usuario.id });
      return {
        usuario,
        totalOrdenes: reporte.totalOrdenes,
        totalPagado: reporte.totalPagado,
        totalPagos: reporte.totalPagos,
        valorOrdenado: reporte.valorOrdenado,
        totalPrendas: reporte.totalPrendas
      };
    }));

    res.json({ desde, hasta, empleados });
  })
);

router.get('/estados',
  asyncHandler(async (req, res) => {
    const estados = await prisma.pedido.groupBy({
      by:     ['estado'],
      where:  { eliminadoEn: null },
      _count: { estado: true }
    });
    res.json(estados);
  })
);

/* ==========================================================================
 * INVENTARIO OPERATIVO DE PRENDAS (derivado, sin tabla nueva)
 *
 * "En tienda" = items de pedidos en estado RECIBIDO/EN_PROCESO/LISTO y no
 * eliminados. Recibidas hoy = items de pedidos creados hoy. Entregadas hoy =
 * items de pedidos cuyo cambio a ENTREGADO ocurrió hoy (historial de estados,
 * que registra el momento real de entrega). Todo es additivo y de solo lectura.
 * ========================================================================== */
router.get('/inventario',
  asyncHandler(async (req, res) => {
    // Compatibilidad: si llega `fecha` se usa como día único; si llegan
    // `desde`/`hasta` se usa el rango. Default = hoy.
    const desde = req.query.desde
      ? inicioDia(parseFechaLocal(req.query.desde))
      : inicioDia(parseFechaLocal(req.query.fecha));
    const hasta = req.query.hasta
      ? finDia(parseFechaLocal(req.query.hasta))
      : finDia(desde);

    const selItem = {
      cantidad: true,
      nombre:   true,
      servicio: { select: { codigo: true, nombre: true } },
      pedido:   {
        select: {
          numero: true, numeroLocal: true, estado: true,
          cliente: { select: { id: true, nombre: true, identificador: true } }
        }
      }
    };

    // Historial de entregas de HOY → ids de pedidos entregados hoy.
    const entregasHoy = await prisma.pedidoEstadoHistorial.findMany({
      where:  { estadoNuevo: 'ENTREGADO', createdAt: { gte: desde, lt: hasta } },
      select: { pedidoId: true }
    });
    const idsEntregadosHoy = [...new Set(entregasHoy.map((h) => h.pedidoId))];

    const [itemsEnTienda, itemsRecibidasHoy, itemsEntregadasHoy, garantiasRango] = await Promise.all([
      prisma.pedidoItem.findMany({
        where:  { pedido: { estado: { in: ESTADOS_EN_TIENDA }, eliminadoEn: null } },
        select: selItem
      }),
      prisma.pedidoItem.findMany({
        where:  { pedido: { createdAt: { gte: desde, lt: hasta }, estado: { not: 'CANCELADO' }, eliminadoEn: null } },
        select: selItem
      }),
      idsEntregadosHoy.length
        ? prisma.pedidoItem.findMany({ where: { pedidoId: { in: idsEntregadosHoy } }, select: selItem })
        : Promise.resolve([]),
      // Prendas en garantía: items con garantía registrada en el rango.
      prisma.garantia.findMany({
        where:  { createdAt: { gte: desde, lt: hasta }, pedidoItemId: { not: null } },
        select: { pedidoItem: { select: { cantidad: true } } }
      })
    ]);

    // Inventario por estado (prendas de pedidos creados en el rango, agrupadas
    // por estado actual del pedido) + GARANTIA (prendas con garantía en rango).
    const porEstado = { RECIBIDO: 0, EN_PROCESO: 0, LISTO: 0, ENTREGADO: 0, GARANTIA: 0 };
    for (const item of itemsRecibidasHoy) {
      const est = item.pedido?.estado;
      if (est && est in porEstado) porEstado[est] += Number(item.cantidad ?? 0);
    }
    for (const g of garantiasRango) {
      porEstado.GARANTIA += Number(g.pedidoItem?.cantidad ?? 0);
    }

    // Agregaciones del inventario en tienda.
    const porTipo = {};
    const porCliente = {};
    const porOrden = {};
    let totalEnTienda = 0;

    for (const item of itemsEnTienda) {
      const qty = Number(item.cantidad ?? 0);
      totalEnTienda += qty;

      const tipo = tipoPrenda(item);
      porTipo[tipo] = (porTipo[tipo] ?? 0) + qty;

      const cli = item.pedido?.cliente;
      const cliKey = cli?.id ?? 'sin-cliente';
      if (!porCliente[cliKey]) {
        porCliente[cliKey] = {
          clienteId: cli?.id ?? null,
          nombre: cli?.nombre ?? '---',
          identificador: cli?.identificador ?? null,
          prendas: 0
        };
      }
      porCliente[cliKey].prendas += qty;

      const ordKey = item.pedido?.numeroLocal || `ORD-${String(item.pedido?.numero ?? '').padStart(6, '0')}`;
      if (!porOrden[ordKey]) {
        porOrden[ordKey] = {
          orden: ordKey,
          estado: item.pedido?.estado ?? null,
          cliente: cli?.nombre ?? '---',
          prendas: 0
        };
      }
      porOrden[ordKey].prendas += qty;
    }

    const sumarCantidad = (items) => items.reduce((acc, it) => acc + Number(it.cantidad ?? 0), 0);

    res.json({
      fecha: desde,
      desde,
      hasta,
      totalEnTienda,
      prendasRecibidasHoy:  sumarCantidad(itemsRecibidasHoy),
      prendasEntregadasHoy: sumarCantidad(itemsEntregadasHoy),
      porEstado,
      porTipo: Object.entries(porTipo)
        .map(([tipo, prendas]) => ({ tipo, prendas }))
        .sort((a, b) => b.prendas - a.prendas),
      porCliente: Object.values(porCliente).sort((a, b) => b.prendas - a.prendas),
      porOrden: Object.values(porOrden).sort((a, b) => b.prendas - a.prendas)
    });
  })
);

/* ==========================================================================
 * CIERRE / RESUMEN GENERAL DEL DÍA (todo el negocio, no una caja individual)
 * ========================================================================== */
router.get('/cierre-dia',
  asyncHandler(async (req, res) => {
    const desde = inicioDia(parseFechaLocal(req.query.fecha));
    const hasta = finDia(desde);
    const usuarioId = req.query.usuarioId || null;

    const wherePedidosDia = {
      createdAt: { gte: desde, lt: hasta },
      estado: { not: 'CANCELADO' },
      eliminadoEn: null,
      ...(usuarioId ? { usuarioId } : {})
    };

    const [pedidosDia, pagosDia, entregasHoy, usuarios, gastosAgg] = await Promise.all([
      prisma.pedido.findMany({
        where: wherePedidosDia,
        include: { items: true, pagos: true, usuario: { select: { id: true, nombre: true } } }
      }),
      prisma.pago.findMany({
        where: {
          createdAt: { gte: desde, lt: hasta },
          ...(usuarioId ? { usuarioId } : {}),
          pedido: { estado: { not: 'CANCELADO' }, eliminadoEn: null }
        },
        include: { usuario: { select: { id: true, nombre: true } } }
      }),
      prisma.pedidoEstadoHistorial.findMany({
        where: { estadoNuevo: 'ENTREGADO', createdAt: { gte: desde, lt: hasta } },
        select: { pedidoId: true }
      }),
      prisma.usuario.findMany({ select: { id: true, nombre: true, rol: true }, orderBy: { nombre: 'asc' } }),
      // Gastos del día (salidas de dinero, independientes de los pagos).
      prisma.gasto.aggregate({
        where: { fecha: { gte: desde, lt: hasta }, deletedAt: null, ...(usuarioId ? { creadoPorId: usuarioId } : {}) },
        _sum: { valor: true }
      })
    ]);

    const totalGastos = Number(gastosAgg._sum.valor ?? 0);

    const totalesPago = calcularTotalesPago(pagosDia);
    const totalVendido = sumar(pedidosDia, (p) => p.total);
    const totalAbonos  = sumar(pagosDia, (p) => p.monto);

    // Saldos pendientes de los pedidos del día.
    const totalSaldosPendientes = pedidosDia.reduce((acc, ped) => {
      const pagado = sumar(ped.pagos, (p) => p.monto);
      return acc + pendienteDePedido(ped, pagado);
    }, 0);

    const totalPrendas = sumar(pedidosDia, (ped) => sumar(ped.items, (it) => it.cantidad));
    const idsEntregadosHoy = [...new Set(entregasHoy.map((h) => h.pedidoId))];

    // Totales por empleado (cobros del día).
    const porEmpleadoMap = {};
    for (const u of usuarios) porEmpleadoMap[u.id] = { usuario: u, totalCobrado: 0, totalPagos: 0, totalOrdenes: 0 };
    for (const pago of pagosDia) {
      const uid = pago.usuarioId;
      if (uid && porEmpleadoMap[uid]) {
        porEmpleadoMap[uid].totalCobrado += Number(pago.monto);
        porEmpleadoMap[uid].totalPagos   += 1;
      }
    }
    for (const ped of pedidosDia) {
      if (ped.usuarioId && porEmpleadoMap[ped.usuarioId]) porEmpleadoMap[ped.usuarioId].totalOrdenes += 1;
    }
    const porEmpleado = Object.values(porEmpleadoMap)
      .filter((e) => e.totalCobrado > 0 || e.totalOrdenes > 0)
      .sort((a, b) => b.totalCobrado - a.totalCobrado);

    res.json({
      fecha: desde,
      totalVendido,
      totalAbonos,
      // Contabilidad del día: ingresos recibidos - gastos = utilidad.
      totalGastos,
      utilidadDia: Number(totalesPago.totalRecibido) - totalGastos,
      totalRecibido:      totalesPago.totalRecibido,
      totalEfectivo:      totalesPago.totalEfectivo,
      totalNequi:         totalesPago.totalNequi,
      totalDaviplata:     totalesPago.totalDaviplata,
      totalTransferencia: totalesPago.totalTransferencia,
      totalTarjeta:       totalesPago.totalTarjeta,
      totalSaldosPendientes,
      totalOrdenes:   pedidosDia.length,
      totalPrendas,
      totalEntregadas: idsEntregadosHoy.length,
      totalPendientes: pedidosDia.filter((p) => ESTADOS_EN_TIENDA.includes(p.estado)).length,
      pagosPorMetodo: totalesPago.porMetodo,
      porEmpleado,
      totalGlobalEmpleados: {
        totalCobrado: sumar(porEmpleado, (e) => e.totalCobrado),
        totalOrdenes: sumar(porEmpleado, (e) => e.totalOrdenes)
      }
    });
  })
);

/* ==========================================================================
 * RESUMEN DEL NEGOCIO POR RANGO: top prendas, top clientes, conteo de pedidos
 * por estado y cobros por empleado desglosados por método de pago.
 * ========================================================================== */
router.get('/resumen-negocio',
  asyncHandler(async (req, res) => {
    // FIX bug "tablas en blanco": antes `hasta` usaba new Date('YYYY-MM-DD') sin
    // expandir a fin de día, así que con desde==hasta (el default = hoy) el
    // rango [gte desde, lt hasta) quedaba VACÍO y topPrendas/topClientes/
    // porEmpleadoMetodo volvían como arrays vacíos. Ahora hasta = finDia(...).
    const desde = inicioDia(parseFechaLocal(req.query.desde));
    const hasta = finDia(parseFechaLocal(req.query.hasta || req.query.desde));
    const usuarioId = req.query.usuarioId || null;

    const wherePedidos = {
      createdAt: { gte: desde, lt: hasta },
      eliminadoEn: null,
      ...(usuarioId ? { usuarioId } : {})
    };

    const [pedidos, pagos, entregadasRango, itemsEnTienda, gastosAgg] = await Promise.all([
      prisma.pedido.findMany({
        where: wherePedidos,
        include: {
          items: { select: { cantidad: true, nombre: true, servicio: { select: { codigo: true, nombre: true } } } },
          pagos: { select: { monto: true } },
          cliente: { select: { id: true, nombre: true, identificador: true } }
        }
      }),
      prisma.pago.findMany({
        where: {
          createdAt: { gte: desde, lt: hasta },
          ...(usuarioId ? { usuarioId } : {}),
          pedido: { estado: { not: 'CANCELADO' }, eliminadoEn: null }
        },
        include: { usuario: { select: { id: true, nombre: true } } }
      }),
      // Prendas entregadas en el rango: items de pedidos con historial ENTREGADO.
      prisma.pedidoEstadoHistorial.findMany({
        where:  { estadoNuevo: 'ENTREGADO', createdAt: { gte: desde, lt: hasta } },
        select: { pedido: { select: { items: { select: { cantidad: true } } } } }
      }),
      // Prendas actualmente en tienda (global, no depende del rango).
      prisma.pedidoItem.findMany({
        where:  { pedido: { estado: { in: ESTADOS_EN_TIENDA }, eliminadoEn: null } },
        select: { cantidad: true }
      }),
      // Gastos del período (para utilidad estimada).
      prisma.gasto.aggregate({
        where: { fecha: { gte: desde, lt: hasta }, deletedAt: null, ...(usuarioId ? { creadoPorId: usuarioId } : {}) },
        _sum: { valor: true }
      })
    ]);

    const noCancelados = pedidos.filter((p) => p.estado !== 'CANCELADO');

    // KPIs del período.
    const prendasRecibidas = sumar(
      noCancelados.flatMap((p) => p.items), (it) => it.cantidad
    );
    const prendasEntregadas = entregadasRango.reduce(
      (acc, h) => acc + sumar(h.pedido?.items ?? [], (it) => it.cantidad), 0
    );
    const ingresosPeriodo = sumar(pagos, (p) => p.monto);
    const saldoPendientePorCobrar = noCancelados.reduce((acc, p) => {
      const pagado = sumar(p.pagos, (x) => x.monto);
      return acc + pendienteDePedido(p, pagado);
    }, 0);
    const prendasEnTienda = sumar(itemsEnTienda, (it) => it.cantidad);
    const gastosPeriodo = Number(gastosAgg._sum.valor ?? 0);
    const utilidadEstimada = ingresosPeriodo - gastosPeriodo;

    // Conteo de pedidos por estado.
    const conteoEstados = { RECIBIDO: 0, EN_PROCESO: 0, LISTO: 0, ENTREGADO: 0, CANCELADO: 0 };
    for (const p of pedidos) conteoEstados[p.estado] = (conteoEstados[p.estado] ?? 0) + 1;

    // Top prendas más usadas (por cantidad).
    const prendasMap = {};
    for (const ped of noCancelados) {
      for (const item of ped.items) {
        const tipo = tipoPrenda(item);
        prendasMap[tipo] = (prendasMap[tipo] ?? 0) + Number(item.cantidad ?? 0);
      }
    }
    const topPrendas = Object.entries(prendasMap)
      .map(([tipo, cantidad]) => ({ tipo, cantidad }))
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 10);

    // Top clientes (por valor de pedidos).
    const clientesMap = {};
    for (const ped of noCancelados) {
      const c = ped.cliente;
      const key = c?.id ?? 'sin-cliente';
      if (!clientesMap[key]) {
        clientesMap[key] = { clienteId: c?.id ?? null, nombre: c?.nombre ?? '---', identificador: c?.identificador ?? null, totalOrdenes: 0, valor: 0 };
      }
      clientesMap[key].totalOrdenes += 1;
      clientesMap[key].valor += Number(ped.total);
    }
    const topClientes = Object.values(clientesMap).sort((a, b) => b.valor - a.valor).slice(0, 10);

    // Cobros por empleado desglosados por método de pago.
    const empleadosMap = {};
    for (const pago of pagos) {
      const u = pago.usuario;
      const key = pago.usuarioId ?? 'sin-empleado';
      if (!empleadosMap[key]) {
        empleadosMap[key] = { usuarioId: pago.usuarioId ?? null, nombre: u?.nombre ?? 'Sin asignar', total: 0, porMetodo: {} };
      }
      const metodo = normalizarMetodoPago(pago.metodo);
      empleadosMap[key].total += Number(pago.monto);
      empleadosMap[key].porMetodo[metodo] = (empleadosMap[key].porMetodo[metodo] ?? 0) + Number(pago.monto);
    }
    const porEmpleadoMetodo = Object.values(empleadosMap).sort((a, b) => b.total - a.total);

    res.json({
      desde, hasta,
      conteoEstados,
      pedidosCreados:   noCancelados.length,
      pedidosEntregados: conteoEstados.ENTREGADO,
      pedidosPendientes: conteoEstados.RECIBIDO + conteoEstados.EN_PROCESO + conteoEstados.LISTO,
      // KPIs de período solicitados por el cliente.
      prendasRecibidas,
      prendasEntregadas,
      prendasEnTienda,
      ingresosPeriodo,
      gastosPeriodo,
      utilidadEstimada,
      saldoPendientePorCobrar,
      topPrendas,
      topClientes,
      porEmpleadoMetodo
    });
  })
);

/* ==========================================================================
 * ALERTAS DEL DÍA: órdenes editadas y garantías registradas hoy, con el
 * empleado que las generó. ADMIN ve todas; otros roles ven sólo las propias.
 * Filtra por día local (default hoy) o ?fecha=YYYY-MM-DD.
 * ========================================================================== */
router.get('/alertas-dia',
  asyncHandler(async (req, res) => {
    const desde = inicioDia(parseFechaLocal(req.query.fecha));
    const hasta = finDia(desde);
    const esAdmin = req.user?.rol === 'ADMIN';
    // Si no es ADMIN, sólo ve lo que él mismo generó (no 403, devuelve propias).
    const filtroUsuario = esAdmin ? {} : { usuarioId: req.user.id };

    const pad2 = (n) => String(n).padStart(2, '0');
    const fechaStr = `${desde.getFullYear()}-${pad2(desde.getMonth() + 1)}-${pad2(desde.getDate())}`;

    const pedidoSel = {
      select: { numero: true, cliente: { select: { nombre: true, identificador: true } } }
    };

    const [edicionesRaw, garantiasRaw] = await Promise.all([
      prisma.pedidoEdicionHistorial.findMany({
        where:   { createdAt: { gte: desde, lt: hasta }, ...filtroUsuario },
        include: { usuario: { select: { id: true, nombre: true } }, pedido: pedidoSel },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.garantia.findMany({
        where:   { createdAt: { gte: desde, lt: hasta }, ...filtroUsuario },
        include: { usuario: { select: { id: true, nombre: true } }, pedido: pedidoSel },
        orderBy: { createdAt: 'desc' }
      })
    ]);

    const ediciones = edicionesRaw.map((e) => ({
      id:                   e.id,
      pedidoId:             e.pedidoId,
      pedidoNumero:         e.pedido?.numero ?? null,
      clienteNombre:        e.pedido?.cliente?.nombre ?? null,
      clienteIdentificador: e.pedido?.cliente?.identificador ?? null,
      usuarioNombre:        e.usuario?.nombre ?? '---',
      motivo:               e.motivo,
      totalAntes:           Number(e.totalAntes),
      totalDespues:         Number(e.totalDespues),
      createdAt:            e.createdAt
    }));

    const garantias = garantiasRaw.map((g) => ({
      id:                   g.id,
      pedidoId:             g.pedidoId,
      pedidoNumero:         g.pedido?.numero ?? null,
      clienteNombre:        g.pedido?.cliente?.nombre ?? null,
      clienteIdentificador: g.pedido?.cliente?.identificador ?? null,
      usuarioNombre:        g.usuario?.nombre ?? '---',
      descripcion:          g.descripcion,
      estado:               g.estado,
      createdAt:            g.createdAt
    }));

    res.json({
      fecha: fechaStr,
      ediciones,
      garantias,
      totales: { ediciones: ediciones.length, garantias: garantias.length }
    });
  })
);

/* ==========================================================================
 * DEUDAS (punto 9): deuda vigente por cobrar, deuda consolidada en curso y
 * ranking de clientes con mayor deuda. Sólo lectura, no afecta caja.
 * ========================================================================== */
router.get('/deudas',
  asyncHandler(async (req, res) => {
    const [pedidos, consolidadoAgg] = await Promise.all([
      prisma.pedido.findMany({
        where: {
          eliminadoEn:           null,
          estado:                { not: 'CANCELADO' },
          consolidadoEnPedidoId: null
        },
        include: {
          pagos:   { select: { monto: true } },
          cliente: { select: { id: true, nombre: true, identificador: true } }
        }
      }),
      // Deuda actualmente "viva" en forma consolidada (no revertida).
      prisma.consolidacionDeuda.aggregate({
        where: { revertidoEn: null },
        _sum:  { montoConsolidado: true },
        _count: true
      })
    ]);

    const porCliente = {};
    let deudaVigente = 0;
    for (const p of pedidos) {
      const pagado = sumar(p.pagos, (x) => x.monto);
      const pend   = pendienteDePedido(p, pagado);
      if (pend <= 0.001) continue;
      deudaVigente += pend;
      const c = p.cliente;
      const key = c?.id ?? 'sin-cliente';
      if (!porCliente[key]) {
        porCliente[key] = {
          clienteId: c?.id ?? null, nombre: c?.nombre ?? '---',
          identificador: c?.identificador ?? null, deuda: 0, facturas: 0
        };
      }
      porCliente[key].deuda += pend;
      porCliente[key].facturas += 1;
    }

    const clientesConMayorDeuda = Object.values(porCliente)
      .sort((a, b) => b.deuda - a.deuda)
      .slice(0, 20);

    res.json({
      deudaVigente,
      deudaConsolidada:      Number(consolidadoAgg._sum.montoConsolidado ?? 0),
      consolidacionesVigentes: consolidadoAgg._count,
      clientesConDeuda:      clientesConMayorDeuda.length,
      clientesConMayorDeuda
    });
  })
);

/* ==========================================================================
 * #4 FACTURAS PENDIENTES POR COBRAR (para Caja → Pendientes). Lista por FACTURA
 * (no por cliente) usando el MISMO helper de saldo `pendienteDePedido`, así la
 * suma cuadra con /reportes/deudas y con Pedidos. Sólo pedidos con saldo real
 * > 0. Filtros: desde/hasta (fecha de creación real), clienteId, q (nombre o
 * identificador), estado, montoMin/montoMax (sobre el saldo).
 * ========================================================================== */
router.get('/facturas-pendientes',
  asyncHandler(async (req, res) => {
    const { clienteId, q, estado, desde, hasta, montoMin, montoMax } = req.query;
    const where = {
      eliminadoEn:           null,
      estado:                { not: 'CANCELADO' },
      consolidadoEnPedidoId: null
    };
    if (clienteId) where.clienteId = String(clienteId);
    if (estado)    where.estado    = String(estado);
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
    if (q && String(q).trim()) {
      const term = String(q).trim();
      where.cliente = {
        OR: [
          { nombre:        { contains: term } },
          { identificador: { contains: term } }
        ]
      };
    }

    const pedidos = await prisma.pedido.findMany({
      where,
      include: {
        pagos:   { select: { monto: true } },
        cliente: { select: { id: true, nombre: true, identificador: true } },
        usuario: { select: { id: true, nombre: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    const min = montoMin != null && montoMin !== '' ? Number(montoMin) : null;
    const max = montoMax != null && montoMax !== '' ? Number(montoMax) : null;

    let totalPendiente = 0;
    const facturas = [];
    for (const p of pedidos) {
      const pagado = sumar(p.pagos, (x) => x.monto);
      const saldo  = pendienteDePedido(p, pagado);
      if (saldo <= 0.001) continue;                         // sólo con saldo real
      if (min != null && saldo < min) continue;
      if (max != null && saldo > max) continue;
      totalPendiente += saldo;
      facturas.push({
        id:               p.id,
        numero:           p.numero,
        numeroLocal:      p.numeroLocal,
        createdAt:        p.createdAt,                       // fecha de creación real
        estado:           p.estado,
        cliente:          p.cliente,
        clienteId:        p.clienteId,
        identificador:    p.cliente?.identificador ?? null,
        total:            Number(p.total),
        deudaConsolidada: Number(p.deudaConsolidada ?? 0),
        totalAPagar:      Number(p.total) + Number(p.deudaConsolidada ?? 0),
        pagado,
        saldo,
        empleado:         p.usuario                          // quién creó la orden
      });
    }

    res.json({ totalPendiente, cantidad: facturas.length, facturas });
  })
);

/* ==========================================================================
 * CONSOLIDACIONES (punto 9): realizadas en el rango (default hoy), totales y
 * desglose por empleado. La consolidación NO genera ingreso ni mueve caja.
 * ========================================================================== */
router.get('/consolidaciones',
  asyncHandler(async (req, res) => {
    const desde = inicioDia(parseFechaLocal(req.query.desde || req.query.fecha));
    const hasta = finDia(parseFechaLocal(req.query.hasta || req.query.desde || req.query.fecha));

    const filas = await prisma.consolidacionDeuda.findMany({
      where:   { createdAt: { gte: desde, lt: hasta }, revertidoEn: null },
      include: {
        usuario:       { select: { id: true, nombre: true, rol: true } },
        pedidoDestino: { select: { numero: true, cliente: { select: { nombre: true, identificador: true } } } },
        pedidoOrigen:  { select: { numero: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    const porEmpleado = {};
    let montoTotal = 0;
    for (const f of filas) {
      const monto = Number(f.montoConsolidado);
      montoTotal += monto;
      const key = f.usuarioId ?? 'sin-empleado';
      if (!porEmpleado[key]) {
        porEmpleado[key] = {
          usuarioId: f.usuarioId ?? null,
          nombre:    f.usuario?.nombre ?? 'Sin asignar',
          rol:       f.usuario?.rol ?? null,
          monto: 0, cantidad: 0
        };
      }
      porEmpleado[key].monto += monto;
      porEmpleado[key].cantidad += 1;
    }

    res.json({
      desde, hasta,
      totalConsolidaciones: filas.length,
      montoTotal,
      porEmpleado: Object.values(porEmpleado).sort((a, b) => b.monto - a.monto),
      consolidaciones: filas.map((f) => ({
        id:               f.id,
        montoConsolidado: Number(f.montoConsolidado),
        motivo:           f.motivo,
        usuario:          f.usuario,
        ordenDestino:     f.pedidoDestino?.numero ?? null,
        ordenOrigen:      f.pedidoOrigen?.numero ?? null,
        cliente:          f.pedidoDestino?.cliente ?? null,
        createdAt:        f.createdAt
      }))
    });
  })
);

module.exports = router;
