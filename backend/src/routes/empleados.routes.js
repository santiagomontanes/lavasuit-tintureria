const bcrypt       = require('bcryptjs');
const router       = require('express').Router();
const prisma       = require('../lib/prisma');
const auth         = require('../middlewares/auth.middleware');
const rol          = require('../middlewares/rol.middleware');
const asyncHandler = require('../utils/asyncHandler');
const { HttpError } = require('../middlewares/error.middleware');

const ROLES_VALIDOS = ['ADMIN', 'EMPLEADO', 'CAJERO', 'RECOLECTOR'];

const validarEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s ?? '').trim());

const SELECT_EMPLEADO = {
  id: true, nombre: true, email: true, rol: true, activo: true,
  createdAt: true, updatedAt: true
};

router.use(auth);

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Convierte "YYYY-MM-DD" al inicio del día (00:00:00.000 hora local). */
const toStart = (s) => (s ? new Date(`${s}T00:00:00.000`) : new Date(0));
/** Convierte "YYYY-MM-DD" al final del día (23:59:59.999 hora local). */
const toEnd   = (s) => (s ? new Date(`${s}T23:59:59.999`) : new Date());

// ─── GET / — lista básica ─────────────────────────────────────────────────────
router.get('/',
  rol('ADMIN'),
  asyncHandler(async (req, res) => {
    const empleados = await prisma.usuario.findMany({
      select:  { id: true, nombre: true, email: true, rol: true, activo: true, createdAt: true },
      orderBy: { nombre: 'asc' }
    });
    res.json(empleados);
  })
);

// ─── GET /resumen — lista con métricas agregadas ──────────────────────────────
router.get('/resumen',
  rol('ADMIN'),
  asyncHandler(async (req, res) => {
    const [
      empleados,
      pedidosCounts,
      clientesCounts,
      pagosCounts,
      garantiasCounts,
      estadosCounts
    ] = await Promise.all([
      prisma.usuario.findMany({
        select:  { id: true, nombre: true, email: true, rol: true, activo: true, createdAt: true },
        orderBy: { nombre: 'asc' }
      }),
      prisma.pedido.groupBy({
        by:    ['usuarioId'],
        where: { eliminadoEn: null },
        _count: { id: true }
      }),
      prisma.cliente.groupBy({
        by:    ['creadoPorId'],
        where: { creadoPorId: { not: null } },
        _count: { id: true }
      }),
      prisma.pago.groupBy({
        by:    ['usuarioId'],
        where: { usuarioId: { not: null } },
        _count: { id: true },
        _sum:   { monto: true }
      }),
      prisma.garantia.groupBy({
        by:    ['usuarioId'],
        _count: { id: true }
      }),
      prisma.pedidoEstadoHistorial.groupBy({
        by:    ['usuarioId'],
        where: { usuarioId: { not: null } },
        _count: { id: true }
      })
    ]);

    const pedMap = Object.fromEntries(pedidosCounts.map((r) => [r.usuarioId, r._count.id]));
    const cliMap = Object.fromEntries(
      clientesCounts
        .filter((r) => r.creadoPorId)
        .map((r) => [r.creadoPorId, r._count.id])
    );
    const pagMap = Object.fromEntries(
      pagosCounts
        .filter((r) => r.usuarioId)
        .map((r) => [r.usuarioId, { count: r._count.id, total: Number(r._sum?.monto ?? 0) }])
    );
    const garMap = Object.fromEntries(garantiasCounts.map((r) => [r.usuarioId, r._count.id]));
    const estMap = Object.fromEntries(
      estadosCounts
        .filter((r) => r.usuarioId)
        .map((r) => [r.usuarioId, r._count.id])
    );

    const resultado = empleados.map((emp) => ({
      ...emp,
      totalOrdenes:       pedMap[emp.id]        ?? 0,
      totalClientes:      cliMap[emp.id]        ?? 0,
      totalPagos:         pagMap[emp.id]?.count ?? 0,
      totalVentas:        pagMap[emp.id]?.total ?? 0,
      totalGarantias:     garMap[emp.id]        ?? 0,
      totalCambiosEstado: estMap[emp.id]        ?? 0
    }));

    res.json(resultado);
  })
);

// ─── GET /:id/rendimiento — métricas por rango de fechas ─────────────────────
router.get('/:id/rendimiento',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (req.user.rol !== 'ADMIN' && req.user.id !== id) {
      throw new HttpError(403, 'Sin permiso para ver datos de otro empleado');
    }

    const empleado = await prisma.usuario.findUnique({
      where:  { id },
      select: { id: true, nombre: true, email: true, rol: true, activo: true }
    });
    if (!empleado) throw new HttpError(404, 'Empleado no encontrado');

    const { desde, hasta } = req.query;
    const range = { gte: toStart(desde), lte: toEnd(hasta) };

    const [
      totalOrdenes,
      pagosAgg,
      totalClientes,
      totalGarantias,
      totalCambiosEstado,
      totalEntregados,
      totalCancelados,
      pedidosActivos       // ← para calcular saldo pendiente
    ] = await Promise.all([
      prisma.pedido.count({
        where: { usuarioId: id, createdAt: range, eliminadoEn: null }
      }),
      prisma.pago.aggregate({
        where:  { usuarioId: id, createdAt: range },
        _count: { id: true },
        _sum:   { monto: true }
      }),
      prisma.cliente.count({
        where: { creadoPorId: id, createdAt: range }
      }),
      prisma.garantia.count({
        where: { usuarioId: id, createdAt: range }
      }),
      prisma.pedidoEstadoHistorial.count({
        where: { usuarioId: id, createdAt: range }
      }),
      prisma.evidenciaEntrega.count({
        where: { usuarioId: id, createdAt: range }
      }),
      prisma.pedidoEstadoHistorial.count({
        where: { usuarioId: id, estadoNuevo: 'CANCELADO', createdAt: range }
      }),
      prisma.pedido.findMany({
        where: {
          usuarioId:   id,
          estado:      { not: 'CANCELADO' },
          eliminadoEn: null
        },
        select: {
          total: true,
          pagos: { select: { monto: true } }
        }
      })
    ]);

    const ventasReales     = Number(pagosAgg._sum?.monto ?? 0);
    const pagosRegistrados = pagosAgg._count.id;
    const promedioPorPedido = totalOrdenes > 0 ? ventasReales / totalOrdenes : 0;

    const totalPendiente = pedidosActivos.reduce((acc, p) => {
      const cobrado = p.pagos.reduce((s, pg) => s + Number(pg.monto), 0);
      return acc + Math.max(0, Number(p.total) - cobrado);
    }, 0);

    res.json({
      empleado,
      metricas: {
        ordenes:              totalOrdenes,
        ventasReales,
        pagosRegistrados,
        clientesCreados:      totalClientes,
        garantiasRegistradas: totalGarantias,
        cambiosEstado:        totalCambiosEstado,
        pedidosEntregados:    totalEntregados,
        pedidosCancelados:    totalCancelados,
        promedioPorPedido,
        totalPendiente
      }
    });
  })
);

// ─── GET /:id/actividad — timeline de acciones ───────────────────────────────
router.get('/:id/actividad',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (req.user.rol !== 'ADMIN' && req.user.id !== id) {
      throw new HttpError(403, 'Sin permiso para ver datos de otro empleado');
    }

    const existe = await prisma.usuario.findUnique({ where: { id }, select: { id: true } });
    if (!existe) throw new HttpError(404, 'Empleado no encontrado');

    const { desde, hasta } = req.query;
    const lim       = Math.min(parseInt(String(req.query.limit ?? '100'), 10) || 100, 200);
    const desdeDate = toStart(desde);
    const hastaDate = toEnd(hasta);
    const range     = { gte: desdeDate, lte: hastaDate };

    const [pedidos, pagos, clientes, garantias, estadoCambios, cajaSesiones, evidencias] =
      await Promise.all([
        prisma.pedido.findMany({
          where:   { usuarioId: id, createdAt: range, eliminadoEn: null },
          select:  {
            id: true, numero: true, total: true, estado: true, createdAt: true,
            cliente: { select: { nombre: true } }
          },
          orderBy: { createdAt: 'desc' },
          take:    lim
        }),
        prisma.pago.findMany({
          where:   { usuarioId: id, createdAt: range },
          select:  {
            id: true, monto: true, metodo: true, createdAt: true,
            pedido: { select: { id: true, numero: true, cliente: { select: { nombre: true } } } }
          },
          orderBy: { createdAt: 'desc' },
          take:    lim
        }),
        prisma.cliente.findMany({
          where:   { creadoPorId: id, createdAt: range },
          select:  { id: true, nombre: true, telefono: true, identificador: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take:    lim
        }),
        prisma.garantia.findMany({
          where:   { usuarioId: id, createdAt: range },
          select:  {
            id: true, descripcion: true, estado: true, createdAt: true,
            pedido: { select: { id: true, numero: true, cliente: { select: { nombre: true } } } }
          },
          orderBy: { createdAt: 'desc' },
          take:    lim
        }),
        prisma.pedidoEstadoHistorial.findMany({
          where:   { usuarioId: id, createdAt: range },
          select:  {
            id: true, estadoAnterior: true, estadoNuevo: true, createdAt: true,
            pedido: { select: { id: true, numero: true, cliente: { select: { nombre: true } } } }
          },
          orderBy: { createdAt: 'desc' },
          take:    lim
        }),
        prisma.cajaSesion.findMany({
          where: {
            usuarioId: id,
            OR: [
              { fechaApertura: range },
              { fechaCierre:   range }
            ]
          },
          select:  {
            id: true, montoBase: true, totalRecibido: true, estado: true,
            fechaApertura: true, fechaCierre: true
          },
          orderBy: { fechaApertura: 'desc' },
          take:    lim
        }),
        prisma.evidenciaEntrega.findMany({
          where:   { usuarioId: id, createdAt: range },
          select:  {
            id: true, observacion: true, createdAt: true,
            pedido: { select: { id: true, numero: true, cliente: { select: { nombre: true } } } }
          },
          orderBy: { createdAt: 'desc' },
          take:    lim
        })
      ]);

    const eventos = [];

    for (const p of pedidos) {
      eventos.push({
        tipo:         'PEDIDO_CREADO',
        fecha:        p.createdAt,
        descripcion:  `Creó pedido #${p.numero ?? p.id.slice(0, 8)}`,
        pedidoId:     p.id,
        pedidoNumero: p.numero,
        clienteNombre: p.cliente?.nombre ?? null,
        monto:        Number(p.total),
        extra:        { estado: p.estado }
      });
    }

    for (const p of pagos) {
      eventos.push({
        tipo:         'PAGO_REGISTRADO',
        fecha:        p.createdAt,
        descripcion:  `Registró pago — ${p.metodo}`,
        pedidoId:     p.pedido?.id ?? null,
        pedidoNumero: p.pedido?.numero ?? null,
        clienteNombre: p.pedido?.cliente?.nombre ?? null,
        monto:        Number(p.monto),
        extra:        { metodo: p.metodo }
      });
    }

    for (const c of clientes) {
      eventos.push({
        tipo:          'CLIENTE_CREADO',
        fecha:         c.createdAt,
        descripcion:   `Creó cliente ${c.nombre}`,
        pedidoId:      null,
        pedidoNumero:  null,
        clienteNombre: c.nombre,
        monto:         null,
        extra:         { telefono: c.telefono, identificador: c.identificador }
      });
    }

    for (const g of garantias) {
      eventos.push({
        tipo:         'GARANTIA_REGISTRADA',
        fecha:        g.createdAt,
        descripcion:  `Registró garantía: ${String(g.descripcion).slice(0, 80)}`,
        pedidoId:     g.pedido?.id ?? null,
        pedidoNumero: g.pedido?.numero ?? null,
        clienteNombre: g.pedido?.cliente?.nombre ?? null,
        monto:        null,
        extra:        { estado: g.estado }
      });
    }

    for (const e of estadoCambios) {
      eventos.push({
        tipo:         'ESTADO_CAMBIADO',
        fecha:        e.createdAt,
        descripcion:  `Cambió estado: ${e.estadoAnterior ?? '—'} → ${e.estadoNuevo}`,
        pedidoId:     e.pedido?.id ?? null,
        pedidoNumero: e.pedido?.numero ?? null,
        clienteNombre: e.pedido?.cliente?.nombre ?? null,
        monto:        null,
        extra:        { estadoAnterior: e.estadoAnterior, estadoNuevo: e.estadoNuevo }
      });
    }

    for (const cs of cajaSesiones) {
      const apertura = new Date(cs.fechaApertura);
      if (apertura >= desdeDate && apertura <= hastaDate) {
        eventos.push({
          tipo:         'CAJA_APERTURA',
          fecha:        cs.fechaApertura,
          descripcion:  `Abrió caja con base S/ ${Number(cs.montoBase).toFixed(2)}`,
          pedidoId:     null,
          pedidoNumero: null,
          clienteNombre: null,
          monto:        Number(cs.montoBase),
          extra:        { cajaSesionId: cs.id, estado: cs.estado }
        });
      }
      if (cs.fechaCierre) {
        const cierre = new Date(cs.fechaCierre);
        if (cierre >= desdeDate && cierre <= hastaDate) {
          eventos.push({
            tipo:         'CAJA_CIERRE',
            fecha:        cs.fechaCierre,
            descripcion:  `Cerró caja — recibido S/ ${Number(cs.totalRecibido ?? 0).toFixed(2)}`,
            pedidoId:     null,
            pedidoNumero: null,
            clienteNombre: null,
            monto:        Number(cs.totalRecibido ?? 0),
            extra:        { cajaSesionId: cs.id }
          });
        }
      }
    }

    for (const ev of evidencias) {
      eventos.push({
        tipo:         'PEDIDO_ENTREGADO',
        fecha:        ev.createdAt,
        descripcion:  `Entregó pedido #${ev.pedido?.numero ?? '—'}`,
        pedidoId:     ev.pedido?.id ?? null,
        pedidoNumero: ev.pedido?.numero ?? null,
        clienteNombre: ev.pedido?.cliente?.nombre ?? null,
        monto:        null,
        extra:        { observacion: ev.observacion ?? null }
      });
    }

    eventos.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

    res.json({ total: eventos.length, actividad: eventos.slice(0, lim) });
  })
);

// ─── POST / — crear empleado ─────────────────────────────────────────────────
router.post('/',
  rol('ADMIN'),
  asyncHandler(async (req, res) => {
    const nombre   = String(req.body?.nombre ?? '').trim();
    const email    = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    const rolNuevo = String(req.body?.rol ?? 'EMPLEADO').toUpperCase();
    const activo   = req.body?.activo !== false;

    if (!nombre)                               throw new HttpError(400, 'Nombre requerido');
    if (!validarEmail(email))                  throw new HttpError(400, 'Email inválido');
    if (!password || password.length < 6)      throw new HttpError(400, 'Contraseña mínima 6 caracteres');
    if (!ROLES_VALIDOS.includes(rolNuevo))     throw new HttpError(400, `Rol inválido (válidos: ${ROLES_VALIDOS.join(', ')})`);

    const existe = await prisma.usuario.findUnique({ where: { email } });
    if (existe) throw new HttpError(409, 'Email ya registrado');

    const hash = await bcrypt.hash(password, 10);
    const empleado = await prisma.usuario.create({
      data:   { nombre, email, password: hash, rol: rolNuevo, activo },
      select: SELECT_EMPLEADO
    });
    res.status(201).json(empleado);
  })
);

// ─── PATCH /:id — editar empleado (nombre/email/rol/activo) ──────────────────
router.patch('/:id',
  rol('ADMIN'),
  asyncHandler(async (req, res) => {
    const data = {};

    if (Object.prototype.hasOwnProperty.call(req.body, 'nombre')) {
      const v = String(req.body.nombre ?? '').trim();
      if (!v) throw new HttpError(400, 'Nombre requerido');
      data.nombre = v;
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'email')) {
      const v = String(req.body.email ?? '').trim().toLowerCase();
      if (!validarEmail(v)) throw new HttpError(400, 'Email inválido');
      data.email = v;
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'rol')) {
      const v = String(req.body.rol ?? '').toUpperCase();
      if (!ROLES_VALIDOS.includes(v)) {
        throw new HttpError(400, `Rol inválido (válidos: ${ROLES_VALIDOS.join(', ')})`);
      }
      data.rol = v;
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'activo')) {
      data.activo = req.body.activo === true || req.body.activo === 'true';
    }

    if (Object.keys(data).length === 0) {
      throw new HttpError(400, 'No hay cambios para aplicar');
    }

    try {
      const empleado = await prisma.usuario.update({
        where:  { id: req.params.id },
        data,
        select: SELECT_EMPLEADO
      });
      res.json(empleado);
    } catch (e) {
      if (e?.code === 'P2025') throw new HttpError(404, 'Empleado no encontrado');
      if (e?.code === 'P2002') throw new HttpError(409, 'Email ya registrado');
      throw e;
    }
  })
);

// ─── PATCH /:id/password — cambiar contraseña ────────────────────────────────
router.patch('/:id/password',
  rol('ADMIN'),
  asyncHandler(async (req, res) => {
    const password = String(req.body?.password ?? '');
    if (!password || password.length < 6) {
      throw new HttpError(400, 'Contraseña mínima 6 caracteres');
    }
    try {
      const hash = await bcrypt.hash(password, 10);
      await prisma.usuario.update({
        where: { id: req.params.id },
        data:  { password: hash }
      });
      res.json({ mensaje: 'Contraseña actualizada' });
    } catch (e) {
      if (e?.code === 'P2025') throw new HttpError(404, 'Empleado no encontrado');
      throw e;
    }
  })
);

// ─── GET /:id/pedidos — listado de órdenes del empleado ──────────────────────
router.get('/:id/pedidos',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (req.user.rol !== 'ADMIN' && req.user.id !== id) {
      throw new HttpError(403, 'Sin permiso para ver pedidos de otro empleado');
    }

    const existe = await prisma.usuario.findUnique({ where: { id }, select: { id: true } });
    if (!existe) throw new HttpError(404, 'Empleado no encontrado');

    const { desde, hasta, estado } = req.query;
    const page  = Math.max(1, parseInt(String(req.query.page  ?? '1'),  10) || 1);
    const limit = Math.min(100, parseInt(String(req.query.limit ?? '50'), 10) || 50);
    const skip  = (page - 1) * limit;

    const where = { usuarioId: id, eliminadoEn: null };
    if (estado) where.estado = String(estado);
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

    const [pedidos, total] = await Promise.all([
      prisma.pedido.findMany({
        where,
        select: {
          id: true, numero: true, total: true, estado: true,
          createdAt: true, fechaEntrega: true,
          cliente: { select: { id: true, nombre: true, telefono: true, identificador: true } },
          pagos:   { select: { monto: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.pedido.count({ where })
    ]);

    const enriquecidos = pedidos.map((p) => {
      const pagado = p.pagos.reduce((acc, x) => acc + Number(x.monto ?? 0), 0);
      const total  = Number(p.total ?? 0);
      return {
        id:            p.id,
        numero:        p.numero,
        estado:        p.estado,
        createdAt:     p.createdAt,
        fechaEntrega:  p.fechaEntrega,
        cliente:       p.cliente,
        total,
        totalPagado:   pagado,
        pendiente:     Math.max(0, total - pagado)
      };
    });

    res.json({ pedidos: enriquecidos, total, page, limit, pages: Math.ceil(total / limit) });
  })
);

// ─── PUT /:id — actualizar empleado ──────────────────────────────────────────
router.put('/:id',
  rol('ADMIN'),
  asyncHandler(async (req, res) => {
    const { nombre, email, rol: rolNuevo, activo } = req.body;
    try {
      const empleado = await prisma.usuario.update({
        where:  { id: req.params.id },
        data:   { nombre, email, rol: rolNuevo, activo },
        select: { id: true, nombre: true, email: true, rol: true, activo: true }
      });
      res.json(empleado);
    } catch (e) {
      if (e?.code === 'P2025') throw new HttpError(404, 'Empleado no encontrado');
      throw e;
    }
  })
);

// ─── DELETE /:id — desactivar empleado ───────────────────────────────────────
router.delete('/:id',
  rol('ADMIN'),
  asyncHandler(async (req, res) => {
    try {
      await prisma.usuario.update({
        where: { id: req.params.id },
        data:  { activo: false }
      });
      res.json({ mensaje: 'Empleado desactivado' });
    } catch (e) {
      if (e?.code === 'P2025') throw new HttpError(404, 'Empleado no encontrado');
      throw e;
    }
  })
);

module.exports = router;
