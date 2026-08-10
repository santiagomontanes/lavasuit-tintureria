const prisma = require('../lib/prisma');
const asyncHandler = require('../utils/asyncHandler');
const { HttpError } = require('../middlewares/error.middleware');
const ioBus = require('../lib/io');
const {
  pickSyncMeta, stripSyncMeta, payloadHash,
  findOperation, createOperation, logDuplicate
} = require('../lib/idempotency');
const { construirSortKey, formatIdentificador, parseOrden } = require('../lib/orden');
const { pendienteDePedido } = require('../lib/saldos');

/* Deuda anterior del cliente (punto 9): facturas con saldo pendiente, no
 * canceladas y aún NO consolidadas. Se muestra al elegir cliente en NuevoPedido
 * (desktop y mobile) para decidir si consolidar. Sólo lectura. */
exports.deuda = asyncHandler(async (req, res) => {
  const cliente = await prisma.cliente.findUnique({
    where: { id: req.params.id }, select: { id: true }
  });
  if (!cliente) throw new HttpError(404, 'Cliente no encontrado');

  const pedidos = await prisma.pedido.findMany({
    where: {
      clienteId:             req.params.id,
      eliminadoEn:           null,
      estado:                { not: 'CANCELADO' },
      consolidadoEnPedidoId: null
    },
    include: { pagos: { select: { monto: true } } },
    orderBy: { createdAt: 'asc' }
  });

  const facturas = pedidos
    .map((p) => {
      const pagado = p.pagos.reduce((acc, x) => acc + Number(x.monto), 0);
      return {
        pedidoId:        p.id,
        numero:          p.numero,
        numeroLocal:     p.numeroLocal,
        total:           Number(p.total),
        deudaConsolidada: Number(p.deudaConsolidada),
        pagado,
        pendiente:       pendienteDePedido(p, pagado),
        createdAt:       p.createdAt
      };
    })
    .filter((f) => f.pendiente > 0.001);

  res.json({
    clienteId:  req.params.id,
    totalDeuda: facturas.reduce((acc, f) => acc + f.pendiente, 0),
    cantidad:   facturas.length,
    facturas
  });
});

/* Historial completo de facturas de un cliente (punto 9 desktop). Solo lectura.
 * Devuelve KPIs del cliente + lista filtrable/paginada de SUS órdenes. */
exports.facturas = asyncHandler(async (req, res) => {
  const cliente = await prisma.cliente.findUnique({
    where:  { id: req.params.id },
    select: { id: true, nombre: true, telefono: true, identificador: true, direccion: true, email: true }
  });
  if (!cliente) throw new HttpError(404, 'Cliente no encontrado');

  const filtro = String(req.query.estado ?? 'todas').toLowerCase();
  const page   = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
  const limit  = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? '100'), 10) || 100));

  const pedidos = await prisma.pedido.findMany({
    where:   { clienteId: req.params.id, eliminadoEn: null },
    include: {
      usuario: { select: { id: true, nombre: true } },
      pagos:   { select: { monto: true } },
      items:   { select: { cantidad: true } },
      edicionesHistorial: {
        orderBy: { createdAt: 'desc' }, take: 1,
        include: { usuario: { select: { id: true, nombre: true } } }
      },
      consolidacionesDestino: {
        where:   { revertidoEn: null },
        include: { pedidoOrigen: { select: { id: true, numero: true } } }
      },
      _count: { select: { garantias: true } }
    },
    orderBy: { createdAt: 'desc' }
  });

  const enriquecidas = pedidos.map((p) => {
    const abonado = p.pagos.reduce((acc, x) => acc + Number(x.monto), 0);
    const total   = Number(p.total);
    const deudaConsolidada = Number(p.deudaConsolidada ?? 0);
    const ultimaEd = p.edicionesHistorial[0] ?? null;
    return {
      id:                p.id,
      numero:            p.numero,
      numeroLocal:       p.numeroLocal,
      createdAt:         p.createdAt,
      estado:            p.estado,
      total,
      deudaConsolidada,
      totalAPagar:       total + deudaConsolidada,
      abonado,
      pendiente:         pendienteDePedido(p, abonado),
      empleadoRecibe:    p.usuario ?? null,
      ultimaModificacion: ultimaEd ? { usuario: ultimaEd.usuario, fecha: ultimaEd.createdAt } : null,
      encargadoEntrega:  p.encargadoEntrega ?? null,
      fechaEntrega:      p.fechaEntrega,
      consolidadoEnPedidoId: p.consolidadoEnPedidoId ?? null,
      facturasOrigen:    p.consolidacionesDestino.map((c) => ({
        pedidoId: c.pedidoOrigen?.id ?? null, numero: c.pedidoOrigen?.numero ?? null,
        monto: Number(c.montoConsolidado)
      })),
      garantias:         p._count.garantias,
      prendas:           p.items.reduce((acc, it) => acc + Number(it.cantidad), 0)
    };
  });

  const enTienda = ['RECIBIDO', 'EN_PROCESO', 'LISTO'];
  const filtrada = enriquecidas.filter((f) => {
    switch (filtro) {
      case 'pendientes':    return enTienda.includes(f.estado);
      case 'entregadas':    return f.estado === 'ENTREGADO';
      case 'con-deuda':     return f.pendiente > 0.001;
      case 'con-garantias': return f.garantias > 0;
      default:              return true;
    }
  });

  // KPIs sobre TODAS las facturas (no canceladas) del cliente.
  const noCanceladas = enriquecidas.filter((f) => f.estado !== 'CANCELADO');
  const kpis = {
    totalFacturas:    enriquecidas.length,
    totalFacturado:   noCanceladas.reduce((acc, f) => acc + f.total, 0),
    totalAbonado:     enriquecidas.reduce((acc, f) => acc + f.abonado, 0),
    deudaActual:      noCanceladas.reduce((acc, f) => acc + f.pendiente, 0),
    ultimaVisita:     enriquecidas[0]?.createdAt ?? null,
    totalPrendas:     enriquecidas.reduce((acc, f) => acc + f.prendas, 0)
  };

  const totalFiltradas = filtrada.length;
  const pageItems = filtrada.slice((page - 1) * limit, page * limit);

  res.json({
    cliente,
    kpis,
    total:   totalFiltradas,
    page,
    limit,
    pages:   Math.ceil(totalFiltradas / limit),
    facturas: pageItems
  });
});

const CLIENTE_INCLUDE = {
  creadoPor: { select: { id: true, nombre: true } },
  asignadoA: { select: { id: true, nombre: true } },
  // #Rutas M2M: todos los empleados a los que está asignado el cliente.
  rutas: {
    where:   { activo: true },
    include: { usuario: { select: { id: true, nombre: true, rol: true } } }
  }
};

/* Vincula (idempotente) un cliente a un empleado en la tabla intermedia sin
 * tocar las demás asignaciones. Usa el unique(clienteId,usuarioId): si ya
 * existe, no hace nada. */
const vincularRuta = (tx, clienteId, usuarioId, orden = null, subOrden = 0) =>
  tx.clienteEmpleadoRuta.upsert({
    where:  { clienteId_usuarioId: { clienteId, usuarioId } },
    create: { clienteId, usuarioId, orden, subOrden, activo: true },
    update: { activo: true }   // reactiva si estaba desactivada; no duplica
  });

/* Búsqueda de clientes: SOLO por nombre o por código/identificador.
 *
 * El teléfono y el email quedaron FUERA a propósito. Buscar por celular hacía
 * que al escribir un número el resultado mezclara clientes cuyo teléfono
 * contenía esos dígitos con el cliente cuyo código era ese número, y el
 * operario terminaba abriendo el cliente equivocado. Regla única en Mobile,
 * Desktop y Backend: número → código; letras → nombre. */
exports.listar = asyncHandler(async (req, res) => {
  const termino = String(req.query.q ?? '').trim();

  const where = termino
    ? {
        OR: [
          { nombre:        { contains: termino } },
          { identificador: { contains: termino } }
        ]
      }
    : { activo: true };

  const clientes = await prisma.cliente.findMany({
    where,
    include: CLIENTE_INCLUDE,
    orderBy: { nombre: 'asc' }
  });
  res.json(clientes);
});

exports.obtener = asyncHandler(async (req, res) => {
  const cliente = await prisma.cliente.findUnique({
    where: { id: req.params.id },
    include: {
      ...CLIENTE_INCLUDE,
      pedidos: {
        where:   { eliminadoEn: null },
        orderBy: { createdAt: 'desc' },
        take:    10,
        include: { items: { include: { servicio: true } } }
      }
    }
  });
  if (!cliente) throw new HttpError(404, 'Cliente no encontrado');
  res.json(cliente);
});

exports.crear = asyncHandler(async (req, res) => {
  console.log('[clientes.crear] body:', req.body);

  const meta = pickSyncMeta(req.body);
  if (meta?.invalid) throw new HttpError(400, 'clientMutationId y deviceId deben enviarse juntos');

  const cargarCliente = (id) => prisma.cliente.findUnique({ where: { id }, include: CLIENTE_INCLUDE });

  if (meta) {
    const op = await findOperation(prisma, meta);
    if (op) {
      logDuplicate(op);
      const existente = await cargarCliente(op.entityId);
      if (existente) return res.status(200).json(existente);
    }
  }

  const clean = stripSyncMeta(req.body);
  const { nombre, telefono, email, direccion, notas } = clean;

  /* Auto-asignación:
   *  - Si quien crea NO es ADMIN (es EMPLEADO / RECOLECTOR / CAJERO), el
   *    cliente queda asignado a sí mismo para que aparezca de inmediato en
   *    su pantalla de "clientes asignados" en mobile.
   *  - Si es ADMIN y el body envía asignadoAId, se respeta ese valor.
   *  - Si es ADMIN y no envía nada, queda sin asignar (admin puede asignar
   *    después desde desktop). */
  let asignadoAId = null;
  if (Object.prototype.hasOwnProperty.call(clean, 'asignadoAId')) {
    asignadoAId = clean.asignadoAId ?? null;
  } else if (req.user?.rol && req.user.rol !== 'ADMIN') {
    asignadoAId = req.user.id;
  }
  console.log('[clientes.crear] asignación', {
    rolCreador:  req.user?.rol,
    creadoPorId: req.user?.id,
    asignadoAId
  });

  try {
    const cliente = await prisma.$transaction(async (tx) => {
      const creado = await tx.cliente.create({
        data: {
          nombre, telefono, email, direccion, notas,
          creadoPorId: req.user.id,
          asignadoAId
        },
        include: CLIENTE_INCLUDE
      });

      // #Rutas M2M: reflejar la asignación inicial también en la intermedia.
      if (asignadoAId) await vincularRuta(tx, creado.id, asignadoAId);

      if (meta) {
        await createOperation(tx, meta, {
          entityType:  'CLIENTE',
          entityId:    creado.id,
          action:      'CREATE',
          payloadHash: payloadHash(clean)
        });
      }

      return creado;
    });

    ioBus.emit('nuevo-cliente', cliente);
    res.status(201).json(cliente);
  } catch (e) {
    console.error('[clientes.crear] error real:', e);

    if (e?.code === 'P2002' && meta) {
      const op = await findOperation(prisma, meta);
      if (op) {
        logDuplicate(op);
        const existente = await cargarCliente(op.entityId);
        if (existente) return res.status(200).json(existente);
      }
    }
    if (e?.code === 'P2002') throw new HttpError(409, 'Telefono ya registrado');
    throw e;
  }
});

exports.actualizar = asyncHandler(async (req, res) => {
  try {
    const cliente = await prisma.cliente.update({
      where: { id: req.params.id },
      data:  req.body
    });
    ioBus.emit('cliente-actualizado', cliente);
    res.json(cliente);
  } catch (e) {
    if (e?.code === 'P2025') throw new HttpError(404, 'Cliente no encontrado');
    if (e?.code === 'P2002') throw new HttpError(409, 'Telefono ya registrado');
    throw e;
  }
});

/* ───────────────────────────────────────────────────────────────────────────
 * CAMBIO DE IDENTIFICADOR (número visible del cliente) — solo ADMIN
 *
 * REGLA APLICADA (el identificador SÍ participa en ordenBase/subOrden):
 *   El identificador NO es un texto libre: es la representación de la pareja
 *   (ordenBase, subOrden) —"280" = 280/0, "280_1" = 280/1— y de esa pareja se
 *   deriva `sortKey`, que define el orden de recorrido de la ruta. Por eso el
 *   cambio reescribe SIEMPRE los cuatro campos a la vez
 *   (identificador, ordenBase, subOrden, sortKey) y también el orden del
 *   cliente dentro de las rutas de cada empleado (ClienteEmpleadoRuta).
 *   Guardar solo el texto dejaría al cliente ordenado por su número viejo.
 *
 * LO QUE NO SE TOCA:
 *   - `Cliente.id` (uuid): es la llave real. Los pedidos apuntan ahí, así que
 *     el histórico de órdenes queda intacto y NO se crea un cliente nuevo.
 *   - `Pedido.numero`: consecutivo propio de las órdenes, ajeno al cliente.
 *   - Los pedidos ya emitidos conservan el número de cliente con que se
 *     imprimieron (viven en su propio snapshot).
 * ───────────────────────────────────────────────────────────────────────────*/
exports.cambiarIdentificador = asyncHandler(async (req, res) => {
  if (req.user?.rol !== 'ADMIN') {
    throw new HttpError(403, 'Solo un administrador puede cambiar el número del cliente');
  }

  const { id } = req.params;
  const identificadorNuevo = String(req.body?.identificador ?? '').trim();
  const motivo             = String(req.body?.motivo ?? '').trim();

  if (!identificadorNuevo) throw new HttpError(400, 'El nuevo número/identificador es obligatorio');
  if (motivo.length < 5)   throw new HttpError(400, 'El motivo del cambio es obligatorio (mínimo 5 caracteres)');
  if (identificadorNuevo.length > 40) throw new HttpError(400, 'El identificador no puede superar 40 caracteres');

  // Formato aceptado: "280" o "280_1" (base y sub-orden). Es el mismo que
  // produce formatIdentificador, así que lo que se guarda siempre se puede
  // volver a interpretar como ruta.
  const partes = identificadorNuevo.match(/^(\d+)(?:[_.](\d+))?$/);
  if (!partes) {
    throw new HttpError(400, 'Formato inválido. Usa el número de la ruta: "280" o "280_1".');
  }
  const ordenBaseNuevo = parseInt(partes[1], 10);
  const subOrdenNuevo  = partes[2] ? parseInt(partes[2], 10) : 0;
  const canonico       = formatIdentificador(ordenBaseNuevo, subOrdenNuevo);
  const sortKeyNuevo   = construirSortKey(ordenBaseNuevo, subOrdenNuevo);

  const cliente = await prisma.cliente.findUnique({
    where:  { id },
    select: { id: true, nombre: true, identificador: true, ordenBase: true, subOrden: true }
  });
  if (!cliente) throw new HttpError(404, 'Cliente no encontrado');

  if (cliente.identificador === canonico) {
    throw new HttpError(400, `El cliente ya tiene el número ${canonico}`);
  }

  // Duplicados: se valida por identificador Y por la pareja (ordenBase,
  // subOrden), que además tiene un unique en la base. Así el 409 sale con un
  // mensaje claro en vez de un P2002 críptico.
  const ocupado = await prisma.cliente.findFirst({
    where: {
      id: { not: id },
      OR: [
        { identificador: canonico },
        { AND: [{ ordenBase: ordenBaseNuevo }, { subOrden: subOrdenNuevo }] }
      ]
    },
    select: { id: true, nombre: true, identificador: true }
  });
  if (ocupado) {
    throw new HttpError(409, `El número ${canonico} ya lo tiene ${ocupado.nombre}. Elige otro.`);
  }

  const actualizado = await prisma.$transaction(async (tx) => {
    const c = await tx.cliente.update({
      where: { id },
      data:  {
        identificador: canonico,
        ordenBase:     ordenBaseNuevo,
        subOrden:      subOrdenNuevo,
        sortKey:       sortKeyNuevo
      },
      include: CLIENTE_INCLUDE
    });

    // El orden dentro de la ruta de CADA empleado sigue al número del cliente.
    await tx.clienteEmpleadoRuta.updateMany({
      where: { clienteId: id },
      data:  { orden: ordenBaseNuevo, subOrden: subOrdenNuevo }
    });

    await tx.clienteIdentificadorHistorial.create({
      data: {
        clienteId:             id,
        usuarioId:             req.user.id,
        identificadorAnterior: cliente.identificador ?? null,
        identificadorNuevo:    canonico,
        ordenBaseAnterior:     cliente.ordenBase ?? null,
        subOrdenAnterior:      cliente.subOrden ?? null,
        ordenBaseNuevo,
        subOrdenNuevo,
        motivo
      }
    });

    return c;
  });

  console.log('[clientes.cambiarIdentificador]', {
    clienteId: id,
    de:        cliente.identificador ?? null,
    a:         canonico,
    usuarioId: req.user.id,
    motivo
  });

  // Mobile escucha 'cliente-actualizado' y refresca su copia local: el nuevo
  // código llega sin necesidad de reinstalar ni volver a iniciar sesión.
  ioBus.emit('cliente-actualizado', actualizado);
  res.json(actualizado);
});

/* GET /api/clientes/:id/identificador-historial — auditoría de cambios. */
exports.historialIdentificador = asyncHandler(async (req, res) => {
  const historial = await prisma.clienteIdentificadorHistorial.findMany({
    where:   { clienteId: req.params.id },
    include: { usuario: { select: { id: true, nombre: true } } },
    orderBy: { createdAt: 'desc' },
    take:    100
  });
  res.json(historial);
});

exports.desactivar = asyncHandler(async (req, res) => {
  try {
    const cliente = await prisma.cliente.update({
      where: { id: req.params.id },
      data:  { activo: false }
    });
    ioBus.emit('cliente-actualizado', cliente);
    res.json({ mensaje: 'Cliente desactivado' });
  } catch (e) {
    if (e?.code === 'P2025') throw new HttpError(404, 'Cliente no encontrado');
    throw e;
  }
});

/* ───────────────────────────────────────────────────────────────────────────
 * MÓDULO DE RUTAS / ASIGNACIONES
 * ─────────────────────────────────────────────────────────────────────────── */

/*
 * POST /api/clientes/importar-excel  (solo ADMIN)
 * Recibe filas ya parseadas por el desktop. Crea o actualiza clientes en la
 * base central. NO es atómico a propósito: cada fila se procesa de forma
 * independiente y se devuelve un resumen con los errores fila por fila.
 */
exports.importarExcel = asyncHandler(async (req, res) => {
  const { filas } = req.body;

  let nuevos = 0;
  let actualizados = 0;
  let duplicados = 0;
  const errores = [];

  const telefonosVistos = new Set();
  const identsVistos     = new Set();
  const ordenesVistos    = new Set();

  for (let i = 0; i < filas.length; i++) {
    const f = filas[i];
    const numFila = i + 2; // fila 1 = encabezados

    const nombre        = f.nombre_cliente != null ? String(f.nombre_cliente).trim() : '';
    const telefono      = f.numero_celular != null ? String(f.numero_celular).trim() : '';
    const direccionRaw  = f.direccion != null ? String(f.direccion).trim() : '';
    const direccion     = direccionRaw || null;
    const identRaw      = f.identificador_cliente != null ? String(f.identificador_cliente).trim() : '';
    const { ordenBase, subOrden } = parseOrden(f.orden, identRaw);

    if (!nombre || telefono.length < 6) {
      errores.push({ fila: numFila, motivo: 'nombre_cliente o numero_celular invalido' });
      continue;
    }

    // Duplicados dentro del mismo archivo
    const ordenClave = ordenBase != null ? `${ordenBase}_${subOrden}` : null;
    if (
      telefonosVistos.has(telefono) ||
      (identRaw && identsVistos.has(identRaw)) ||
      (ordenClave && ordenesVistos.has(ordenClave))
    ) {
      duplicados++;
      continue;
    }
    telefonosVistos.add(telefono);
    if (identRaw) identsVistos.add(identRaw);
    if (ordenClave) ordenesVistos.add(ordenClave);

    const sortKey       = construirSortKey(ordenBase, subOrden);
    const identificador = identRaw || formatIdentificador(ordenBase, subOrden);

    try {
      const existente = await prisma.cliente.findUnique({ where: { telefono } });
      if (existente) {
        await prisma.cliente.update({
          where: { id: existente.id },
          data:  { nombre, direccion, identificador, ordenBase, subOrden, sortKey, activo: true }
        });
        actualizados++;
      } else {
        await prisma.cliente.create({
          data: {
            nombre, telefono, direccion,
            identificador, ordenBase, subOrden, sortKey,
            creadoPorId: req.user.id
          }
        });
        nuevos++;
      }
    } catch (e) {
      if (e?.code === 'P2002') {
        const target = Array.isArray(e?.meta?.target) ? e.meta.target.join(',') : String(e?.meta?.target ?? '');
        errores.push({
          fila: numFila,
          motivo: target.includes('orden') || target.includes('subOrden')
            ? `El orden ${identificador ?? ordenBase} ya está en uso por otro cliente`
            : 'Teléfono ya registrado por otro cliente'
        });
      } else {
        console.error('[clientes.importarExcel] fila', numFila, e);
        errores.push({ fila: numFila, motivo: 'Error al guardar la fila' });
      }
    }
  }

  const resumen = {
    total: filas.length,
    nuevos,
    actualizados,
    duplicados,
    errores: errores.length
  };
  console.log('[clientes.importarExcel] resumen:', resumen);
  ioBus.emit('clientes-importados', resumen);
  res.json({ resumen, errores });
});

/*
 * GET /api/clientes/asignados
 * Devuelve SOLO los clientes asignados al usuario autenticado, ordenados por
 * el orden exacto de recorrido (sortKey).
 */
exports.listarAsignados = asyncHandler(async (req, res) => {
  // #Rutas M2M: un cliente puede estar en la ruta de varios empleados. Devolvemos
  // los del empleado actual desde la tabla intermedia, uniendo el legacy
  // `asignadoAId` por si algo no se hubiera backfilleado todavía.
  const clientes = await prisma.cliente.findMany({
    where: {
      activo: true,
      OR: [
        { rutas: { some: { usuarioId: req.user.id, activo: true } } },
        { asignadoAId: req.user.id }
      ]
    },
    include: CLIENTE_INCLUDE,
    orderBy: [
      { sortKey: { sort: 'asc', nulls: 'last' } },
      { nombre:  'asc' }
    ]
  });

  /* Compat mobile offline: la app guarda una sola columna `asignadoAId` y filtra
   * su lista local por ella. Desde la óptica de ESTE empleado el cliente le
   * pertenece, así que sellamos `asignadoAId` con su propio id. El dueño real
   * multi-empleado sigue en `rutas`. Mobile no reenvía este campo, es seguro. */
  res.json(clientes.map((c) => ({ ...c, asignadoAId: req.user.id })));
});

/*
 * POST /api/clientes/asignar  (solo ADMIN)
 * Asigna clientes a un empleado, por lista explícita de ids o por rango de
 * ordenBase (del 1 al 60, del 61 al 120, etc.).
 */
exports.asignar = asyncHandler(async (req, res) => {
  const { usuarioId, clienteIds, desde, hasta } = req.body;

  const empleado = await prisma.usuario.findUnique({ where: { id: usuarioId } });
  if (!empleado) throw new HttpError(404, 'Empleado no encontrado');

  let where;
  if (Array.isArray(clienteIds) && clienteIds.length > 0) {
    where = { id: { in: clienteIds } };
  } else if (desde != null && hasta != null) {
    where = { ordenBase: { gte: Number(desde), lte: Number(hasta) } };
  } else {
    throw new HttpError(400, 'Debe enviar clienteIds o un rango desde/hasta');
  }

  // #Rutas M2M: ADITIVO. Agregamos la asignación a este empleado en la tabla
  // intermedia SIN borrar las de otros empleados. `asignadoAId` (legacy) solo se
  // setea si el cliente aún no tenía asignación única, para no "reemplazar".
  const clientesObjetivo = await prisma.cliente.findMany({
    where, select: { id: true, ordenBase: true, subOrden: true, asignadoAId: true }
  });

  await prisma.$transaction(async (tx) => {
    // Vínculos M2M (idempotentes por unique).
    if (clientesObjetivo.length > 0) {
      await tx.clienteEmpleadoRuta.createMany({
        data: clientesObjetivo.map((c) => ({
          clienteId: c.id,
          usuarioId,
          orden:     c.ordenBase ?? null,
          subOrden:  c.subOrden ?? 0,
          activo:    true
        })),
        skipDuplicates: true
      });
    }
    // Reactivar los que estuvieran desactivados para este empleado.
    await tx.clienteEmpleadoRuta.updateMany({
      where: { usuarioId, clienteId: { in: clientesObjetivo.map((c) => c.id) }, activo: false },
      data:  { activo: true }
    });
    // Legacy: solo rellenar si estaba vacío (no reemplaza un dueño previo).
    const sinAsignar = clientesObjetivo.filter((c) => !c.asignadoAId).map((c) => c.id);
    if (sinAsignar.length > 0) {
      await tx.cliente.updateMany({ where: { id: { in: sinAsignar } }, data: { asignadoAId: usuarioId } });
    }
  });

  /* Conteo real: clientes que quedaron vinculados a este empleado por el criterio.
   * `asignados` = activos (visibles en la ruta); `procesados` = todos. */
  const [asignados, procesados] = await Promise.all([
    prisma.cliente.count({ where: { ...where, activo: true, rutas: { some: { usuarioId, activo: true } } } }),
    prisma.cliente.count({ where: { ...where, rutas: { some: { usuarioId } } } })
  ]);

  console.log(`[clientes.asignar] ${asignados} clientes activos -> ${empleado.nombre} (${usuarioId}) [procesados=${procesados}]`);
  ioBus.emit('clientes-asignados', { usuarioId, total: asignados });
  res.json({ asignados, procesados, usuarioId, empleado: empleado.nombre });
});

/* ─── #Rutas M2M: gestión de asignaciones POR CLIENTE (ADMIN) ─────────────── */

const cargarClienteConRutas = (id) => prisma.cliente.findUnique({
  where:   { id },
  include: CLIENTE_INCLUDE
});

/* GET /api/clientes/:id/asignaciones → empleados asignados a un cliente. */
exports.listarAsignaciones = asyncHandler(async (req, res) => {
  const cliente = await prisma.cliente.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!cliente) throw new HttpError(404, 'Cliente no encontrado');
  const rutas = await prisma.clienteEmpleadoRuta.findMany({
    where:   { clienteId: req.params.id, activo: true },
    include: { usuario: { select: { id: true, nombre: true, rol: true, activo: true } } },
    orderBy: { createdAt: 'asc' }
  });
  res.json(rutas.map((r) => ({
    id: r.id, usuarioId: r.usuarioId, usuario: r.usuario,
    orden: r.orden, subOrden: r.subOrden
  })));
});

/* POST /api/clientes/:id/asignaciones { usuarioIds:[...] } → AGREGA (no borra). */
exports.agregarAsignaciones = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const usuarioIds = Array.isArray(req.body?.usuarioIds) ? req.body.usuarioIds.filter(Boolean) : [];
  if (usuarioIds.length === 0) throw new HttpError(400, 'Envía al menos un usuarioId');

  const cliente = await prisma.cliente.findUnique({
    where: { id }, select: { id: true, ordenBase: true, subOrden: true, asignadoAId: true }
  });
  if (!cliente) throw new HttpError(404, 'Cliente no encontrado');

  const empleados = await prisma.usuario.findMany({ where: { id: { in: usuarioIds } }, select: { id: true } });
  const validos = new Set(empleados.map((e) => e.id));
  const aVincular = usuarioIds.filter((u) => validos.has(u));
  if (aVincular.length === 0) throw new HttpError(400, 'Ningún empleado válido');

  await prisma.$transaction(async (tx) => {
    for (const usuarioId of aVincular) {
      await vincularRuta(tx, id, usuarioId, cliente.ordenBase ?? null, cliente.subOrden ?? 0);
    }
    if (!cliente.asignadoAId) {
      await tx.cliente.update({ where: { id }, data: { asignadoAId: aVincular[0] } });
    }
  });

  ioBus.emit('clientes-asignados', { clienteId: id });
  res.status(201).json(await cargarClienteConRutas(id));
});

/* DELETE /api/clientes/:id/asignaciones/:usuarioId → quita UNA sin tocar otras. */
exports.quitarAsignacion = asyncHandler(async (req, res) => {
  const { id, usuarioId } = req.params;
  const cliente = await prisma.cliente.findUnique({ where: { id }, select: { id: true, asignadoAId: true } });
  if (!cliente) throw new HttpError(404, 'Cliente no encontrado');

  await prisma.$transaction(async (tx) => {
    await tx.clienteEmpleadoRuta.deleteMany({ where: { clienteId: id, usuarioId } });
    // Si el legacy apuntaba a este empleado, reapuntarlo a otra asignación viva
    // (o null) para mantener coherencia con mobile/offline.
    if (cliente.asignadoAId === usuarioId) {
      const otra = await tx.clienteEmpleadoRuta.findFirst({
        where: { clienteId: id, activo: true }, orderBy: { createdAt: 'asc' }, select: { usuarioId: true }
      });
      await tx.cliente.update({ where: { id }, data: { asignadoAId: otra?.usuarioId ?? null } });
    }
  });

  ioBus.emit('clientes-asignados', { clienteId: id });
  res.json(await cargarClienteConRutas(id));
});

/* PUT /api/clientes/:id/asignaciones { usuarioIds:[...] } → REEMPLAZA la lista
 * completa de forma explícita (agrega los nuevos, quita los que ya no están). */
exports.reemplazarAsignaciones = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const usuarioIds = Array.isArray(req.body?.usuarioIds) ? [...new Set(req.body.usuarioIds.filter(Boolean))] : [];

  const cliente = await prisma.cliente.findUnique({
    where: { id }, select: { id: true, ordenBase: true, subOrden: true }
  });
  if (!cliente) throw new HttpError(404, 'Cliente no encontrado');

  const empleados = await prisma.usuario.findMany({ where: { id: { in: usuarioIds } }, select: { id: true } });
  const validos = empleados.map((e) => e.id);

  await prisma.$transaction(async (tx) => {
    // Quitar los que ya no están en la lista.
    await tx.clienteEmpleadoRuta.deleteMany({
      where: { clienteId: id, usuarioId: { notIn: validos.length ? validos : ['__none__'] } }
    });
    // Agregar los nuevos (idempotente).
    for (const usuarioId of validos) {
      await vincularRuta(tx, id, usuarioId, cliente.ordenBase ?? null, cliente.subOrden ?? 0);
    }
    await tx.cliente.update({ where: { id }, data: { asignadoAId: validos[0] ?? null } });
  });

  ioBus.emit('clientes-asignados', { clienteId: id });
  res.json(await cargarClienteConRutas(id));
});

/*
 * POST /api/clientes/crear-en-ruta
 * Crea un cliente nuevo ENTRE dos clientes existentes. El cliente queda
 * asignado al empleado autenticado. El backend es la autoridad del consecutivo:
 * busca el mayor subOrden existente para `ordenBaseRef` y asigna el siguiente.
 * Si dos celulares piden 52_1 a la vez, el índice único (ordenBase, subOrden)
 * provoca P2002 y reintentamos con el siguiente disponible (52_2, 52_3...).
 */
exports.crearEnRuta = asyncHandler(async (req, res) => {
  const meta = pickSyncMeta(req.body);
  if (meta?.invalid) throw new HttpError(400, 'clientMutationId y deviceId deben enviarse juntos');

  const cargarCliente = (id) => prisma.cliente.findUnique({ where: { id }, include: CLIENTE_INCLUDE });

  // Idempotencia: si ya procesamos esta mutación, devolvemos el cliente existente.
  if (meta) {
    const op = await findOperation(prisma, meta);
    if (op) {
      logDuplicate(op);
      const existente = await cargarCliente(op.entityId);
      if (existente) return res.status(200).json(existente);
    }
  }

  const clean = stripSyncMeta(req.body);
  const { nombre, telefono, email, direccion, notas, ordenBaseRef } = clean;
  const ordenBase = Number(ordenBaseRef);
  if (!Number.isFinite(ordenBase)) throw new HttpError(400, 'ordenBaseRef invalido');

  const MAX_INTENTOS = 8;
  for (let intento = 0; intento < MAX_INTENTOS; intento++) {
    const agg = await prisma.cliente.aggregate({
      where: { ordenBase },
      _max:  { subOrden: true }
    });
    const subOrden      = (agg._max.subOrden ?? 0) + 1;
    const sortKey       = construirSortKey(ordenBase, subOrden);
    const identificador = formatIdentificador(ordenBase, subOrden);

    try {
      const cliente = await prisma.$transaction(async (tx) => {
        const creado = await tx.cliente.create({
          data: {
            nombre, telefono, email, direccion, notas,
            identificador, ordenBase, subOrden, sortKey,
            asignadoAId: req.user.id,
            creadoPorId: req.user.id
          },
          include: CLIENTE_INCLUDE
        });

        // #Rutas M2M: reflejar la asignación al creador en la intermedia.
        await vincularRuta(tx, creado.id, req.user.id, ordenBase, subOrden);

        if (meta) {
          await createOperation(tx, meta, {
            entityType:  'CLIENTE',
            entityId:    creado.id,
            action:      'CREATE_EN_RUTA',
            payloadHash: payloadHash(clean)
          });
        }
        return creado;
      });

      console.log(`[clientes.crearEnRuta] creado ${identificador} (intento ${intento + 1})`);
      ioBus.emit('nuevo-cliente', cliente);
      return res.status(201).json(cliente);
    } catch (e) {
      if (e?.code === 'P2002') {
        const target = Array.isArray(e?.meta?.target) ? e.meta.target.join(',') : String(e?.meta?.target ?? '');
        // Colisión en (ordenBase, subOrden): otro celular ganó este consecutivo.
        if (target.includes('orden') || target.includes('subOrden')) {
          console.warn(`[clientes.crearEnRuta] colisión en ${identificador}, reintentando`);
          continue;
        }
        // Colisión de teléfono: si es un reintento de la misma mutación, devolvemos el existente.
        if (meta) {
          const op = await findOperation(prisma, meta);
          if (op) {
            logDuplicate(op);
            const existente = await cargarCliente(op.entityId);
            if (existente) return res.status(200).json(existente);
          }
        }
        throw new HttpError(409, 'Telefono ya registrado');
      }
      console.error('[clientes.crearEnRuta] error real:', e);
      throw e;
    }
  }

  throw new HttpError(409, 'No se pudo asignar un consecutivo libre, reintente');
});
