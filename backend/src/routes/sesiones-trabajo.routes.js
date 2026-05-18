const router = require('express').Router();
const prisma = require('../lib/prisma');
const auth = require('../middlewares/auth.middleware');
const asyncHandler = require('../utils/asyncHandler');
const { HttpError } = require('../middlewares/error.middleware');
const { sesionAbiertaDeUsuario, recalcularSesionTrabajo } = require('../lib/sesionesTrabajo');

router.use(auth);

const incluirUsuario = {
  usuario: { select: { id: true, nombre: true, email: true, rol: true } }
};

router.get('/actual', asyncHandler(async (req, res) => {
  const sesion = await prisma.sesionTrabajo.findFirst({
    where: { usuarioId: req.user.id, estado: 'ABIERTA' },
    include: incluirUsuario,
    orderBy: { fechaInicio: 'desc' }
  });
  res.json(sesion);
}));

router.post('/abrir', asyncHandler(async (req, res) => {
  const existente = await prisma.sesionTrabajo.findFirst({
    where: { usuarioId: req.user.id, estado: 'ABIERTA' },
    include: incluirUsuario,
    orderBy: { fechaInicio: 'desc' }
  });
  if (existente) return res.json(existente);

  const sesion = await prisma.sesionTrabajo.create({
    data: {
      usuarioId: req.user.id,
      observaciones: req.body?.observaciones || null
    },
    include: incluirUsuario
  });
  res.status(201).json(sesion);
}));

router.post('/cerrar', asyncHandler(async (req, res) => {
  const abierta = await sesionAbiertaDeUsuario(prisma, req.user.id);
  if (!abierta) throw new HttpError(404, 'No hay sesion abierta');

  const sesion = await prisma.$transaction(async (tx) => {
    await recalcularSesionTrabajo(tx, abierta.id);
    return tx.sesionTrabajo.update({
      where: { id: abierta.id },
      data: {
        estado: 'CERRADA',
        fechaFin: new Date(),
        observaciones: req.body?.observaciones ?? abierta.observaciones
      },
      include: incluirUsuario
    });
  });

  res.json(sesion);
}));

router.get('/resumen-empleados', asyncHandler(async (req, res) => {
  const desde = req.query.desde ? new Date(req.query.desde) : new Date();
  desde.setHours(0, 0, 0, 0);
  const hasta = req.query.hasta ? new Date(req.query.hasta) : new Date(desde);
  if (!req.query.hasta) hasta.setDate(hasta.getDate() + 1);

  const usuarios = await prisma.usuario.findMany({
    select: { id: true, nombre: true, rol: true },
    orderBy: { nombre: 'asc' }
  });

  const resumen = await Promise.all(usuarios.map(async (u) => {
    const [pedidos, pagos, sesiones] = await Promise.all([
      prisma.pedido.count({
        where: {
          usuarioId: u.id,
          createdAt: { gte: desde, lt: hasta },
          eliminadoEn: null,
          estado: { not: 'CANCELADO' }
        }
      }),
      prisma.pago.findMany({
        where: {
          usuarioId: u.id,
          createdAt: { gte: desde, lt: hasta },
          pedido: { eliminadoEn: null, estado: { not: 'CANCELADO' } }
        },
        select: { monto: true }
      }),
      prisma.sesionTrabajo.findMany({
        where: { usuarioId: u.id, fechaInicio: { gte: desde, lt: hasta } },
        orderBy: { fechaInicio: 'desc' }
      })
    ]);

    return {
      usuario: u,
      totalPedidos: pedidos,
      totalPagado: pagos.reduce((acc, p) => acc + Number(p.monto), 0),
      totalPagos: pagos.length,
      sesiones
    };
  }));

  res.json({ desde, hasta, resumen });
}));

module.exports = router;
