const router = require('express').Router();
const prisma = require('../lib/prisma');
const auth   = require('../middlewares/auth.middleware');
const asyncHandler = require('../utils/asyncHandler');

router.use(auth);

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
    const totalPedido = Number(pedido.total);
    return {
      ...pedido,
      totalPagado: totalPagadoPedido,
      pendiente:   Math.max(totalPedido - totalPagadoPedido, 0),
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
    const desde = req.query.desde ? new Date(req.query.desde) : inicioDia();
    const hasta = req.query.hasta ? new Date(req.query.hasta) : finDia(desde);

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

module.exports = router;
