const prisma = require('../lib/prisma');
const asyncHandler = require('../utils/asyncHandler');
const { HttpError } = require('../middlewares/error.middleware');
const ioBus = require('../lib/io');
const { sesionAbiertaDeUsuario, recalcularSesionTrabajo } = require('../lib/sesionesTrabajo');
const { pendienteDePedido, sumaPagos } = require('../lib/saldos');

/* Decora un pedido con los escalares financieros calculados con el ÚNICO helper
 * de saldos (mismo que Reportes/Caja/recibos). Así el listado Mobile no depende
 * de recorrer `pagos` y todos los módulos coinciden. Los pagos ya vienen en el
 * include → no hay consulta N+1. */
const conSaldo = (pedido) => {
  const totalPagado = sumaPagos(pedido);
  return {
    ...pedido,
    totalPagado,
    saldoPendiente: pendienteDePedido(pedido, totalPagado)
  };
};
const {
  pickSyncMeta, stripSyncMeta, payloadHash,
  findOperation, createOperation, logDuplicate
} = require('../lib/idempotency');

const PEDIDO_INCLUDE = {
  cliente: true,
  usuario: { select: { id: true, nombre: true } },
  eliminadoPor: { select: { id: true, nombre: true } },
  sesionTrabajo: true,
  items:   { include: { servicio: true } },
  pagos:   { include: { usuario: { select: { id: true, nombre: true } } } },
  garantias: {
    include: {
      usuario: { select: { id: true, nombre: true } },
      pedidoItem: { include: { servicio: true } }
    },
    orderBy: { createdAt: 'desc' }
  },
  historialEstados: {
    include: { usuario: { select: { id: true, nombre: true } } },
    orderBy: { createdAt: 'desc' }
  },
  evidenciaEntrega: {
    include: { usuario: { select: { id: true, nombre: true } } }
  },
  // Si ESTA orden es origen consolidado, la factura destino que absorbió su
  // saldo (para mostrar "Saldo consolidado en factura #X" y saldo 0).
  consolidadoEn: { select: { id: true, numero: true, numeroLocal: true } },
  // Desglose de deuda anterior consolidada en esta orden (punto 9). Sólo las
  // vigentes (no revertidas) para el recibo y el historial.
  consolidacionesDestino: {
    where:   { revertidoEn: null },
    include: {
      usuario:      { select: { id: true, nombre: true } },
      pedidoOrigen: { select: { id: true, numero: true, numeroLocal: true, createdAt: true } }
    },
    orderBy: { createdAt: 'asc' }
  }
};

exports.listar = asyncHandler(async (req, res) => {
  const { estado, clienteId, usuarioId, desde, hasta, q, conGarantia } = req.query;
  /* Paginación real. El tope es 500 porque Desktop ofrece 50/100/200/500 por
   * página; pedir 500 devuelve 500, no los 50 de antes. Sigue acotado para no
   * traer la base entera en una sola consulta. */
  const pageNum  = Math.max(1, Number(req.query.page) || 1);
  const limitNum = Math.min(500, Math.max(1, Number(req.query.limit) || 20));
  const where = { eliminadoEn: null };
  if (estado)    where.estado    = estado;
  if (clienteId) where.clienteId = clienteId;
  if (usuarioId) where.usuarioId = usuarioId;

  /* Búsqueda global: número de orden, número local y NOMBRE o CÓDIGO del
   * cliente. El teléfono quedó fuera a propósito (misma regla que
   * clientes.listar): buscar "300" traía todos los clientes con ese fragmento
   * de celular y enterraba la orden #300. */
  if (q && String(q).trim()) {
    const term = String(q).trim();
    const orNum = Number.isNaN(Number(term)) ? [] : [{ numero: Number(term) }];
    where.OR = [
      ...orNum,
      { numeroLocal: { contains: term } },
      { cliente: { nombre:        { contains: term } } },
      { cliente: { identificador: { contains: term } } }
    ];
  }
  if (conGarantia === 'true' || conGarantia === '1') {
    where.garantias = { some: {} };
  }

  // Rango de fechas (YYYY-MM-DD). Permite desde/hasta o sólo uno.
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

  const skip = (pageNum - 1) * limitNum;
  const [pedidos, total] = await Promise.all([
    prisma.pedido.findMany({
      where,
      include: PEDIDO_INCLUDE,
      /* Orden ESTABLE y total: createdAt puede repetirse al milisegundo cuando
       * se sincroniza un lote offline, y con empates MySQL puede devolver la
       * misma fila en dos páginas distintas. El desempate por `numero` (único)
       * garantiza que ningún pedido se duplique ni se salte entre páginas. */
      orderBy: [{ createdAt: 'desc' }, { numero: 'desc' }],
      skip,
      take: limitNum
    }),
    prisma.pedido.count({ where })
  ]);

  const totalPages = Math.max(1, Math.ceil(total / limitNum));

  res.json({
    pedidos: pedidos.map(conSaldo),
    total,
    page:  pageNum,
    // `limit`/`pages` se conservan por compatibilidad con Mobile, que ya los usa.
    limit: limitNum,
    pages: totalPages,
    // Metadatos de paginación que consume Desktop.
    pageSize:    limitNum,
    totalPages,
    hasNext:     pageNum < totalPages,
    hasPrevious: pageNum > 1
  });
});

/* #2 Detección SEGURA de pedidos posiblemente duplicados (solo lectura). Agrupa
 * órdenes NO eliminadas del mismo cliente, mismo total y mismos items (servicio+
 * cantidad+precio), creadas dentro de una ventana corta (default 10 min) pero con
 * consecutivos distintos — la firma típica de una doble creación por doble toque
 * o reintento con clientMutationId diferente. NO borra ni fusiona: devuelve los
 * grupos para que un ADMIN los revise y decida. */
exports.detectarDuplicados = asyncHandler(async (req, res) => {
  if (req.user?.rol !== 'ADMIN') {
    throw new HttpError(403, 'Solo un administrador puede ejecutar el diagnóstico de duplicados');
  }
  const ventanaMin = Math.min(240, Math.max(1, Number(req.query.ventanaMin) || 10));
  const where = { eliminadoEn: null };
  if (req.query.desde || req.query.hasta) {
    where.createdAt = {};
    if (req.query.desde) {
      const d = new Date(`${req.query.desde}T00:00:00.000`);
      if (!Number.isNaN(d.getTime())) where.createdAt.gte = d;
    }
    if (req.query.hasta) {
      const h = new Date(`${req.query.hasta}T23:59:59.999`);
      if (!Number.isNaN(h.getTime())) where.createdAt.lte = h;
    }
  }

  const pedidos = await prisma.pedido.findMany({
    where,
    select: {
      id: true, numero: true, numeroLocal: true, clienteId: true, total: true,
      estado: true, createdAt: true,
      cliente: { select: { nombre: true, identificador: true } },
      usuario: { select: { id: true, nombre: true } },
      items:   { select: { servicioId: true, cantidad: true, precio: true } }
    },
    orderBy: { createdAt: 'asc' }
  });

  const firmaItems = (items) => items
    .map((i) => `${i.servicioId}:${Number(i.cantidad)}:${Number(i.precio)}`)
    .sort()
    .join('|');

  // Agrupa por cliente+total+items; dentro, parte por ventana de tiempo.
  const porFirma = new Map();
  for (const p of pedidos) {
    const clave = `${p.clienteId}|${Number(p.total)}|${firmaItems(p.items)}`;
    if (!porFirma.has(clave)) porFirma.set(clave, []);
    porFirma.get(clave).push(p);
  }

  const ventanaMs = ventanaMin * 60 * 1000;
  const grupos = [];
  for (const lista of porFirma.values()) {
    if (lista.length < 2) continue;
    let actual = [lista[0]];
    for (let i = 1; i < lista.length; i++) {
      const dentro = new Date(lista[i].createdAt).getTime() -
                     new Date(actual[actual.length - 1].createdAt).getTime() <= ventanaMs;
      if (dentro) actual.push(lista[i]);
      else { if (actual.length >= 2) grupos.push(actual); actual = [lista[i]]; }
    }
    if (actual.length >= 2) grupos.push(actual);
  }

  res.json({
    ventanaMin,
    totalRevisados: pedidos.length,
    gruposSospechosos: grupos.length,
    grupos: grupos.map((g) => ({
      clienteId:     g[0].clienteId,
      cliente:       g[0].cliente,
      total:         Number(g[0].total),
      cantidad:      g.length,
      pedidos: g.map((p) => ({
        id: p.id, numero: p.numero, numeroLocal: p.numeroLocal,
        estado: p.estado, createdAt: p.createdAt,
        usuario: p.usuario
      }))
    }))
  });
});

exports.obtener = asyncHandler(async (req, res) => {
  const pedido = await prisma.pedido.findFirst({
    where:   { id: req.params.id, eliminadoEn: null },
    include: PEDIDO_INCLUDE
  });
  if (!pedido) throw new HttpError(404, 'Pedido no encontrado');
  res.json(conSaldo(pedido));
});

/* #6 Fecha real de creación en el dispositivo. La sincronización NO puede
 * cambiar createdAt: un pedido creado offline a las 10:15 que sincroniza a las
 * 14:00 debe conservar 10:15. Usamos `createdOfflineAt` (hora local del INSERT
 * que ya viaja en la metadata de sync) como createdAt, validándola para no
 * confiar ciegamente en el reloj del teléfono: se acepta sólo si es una fecha
 * válida, no futura (más de 2 min de tolerancia de reloj) ni absurdamente vieja
 * (> 2 años). Si no pasa la validación, se cae al default now() de Prisma.
 * El momento de llegada al servidor queda auditado en SyncOperation.createdAt. */
const fechaCreacionReal = (meta) => {
  const d = meta?.createdOfflineAt;
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return undefined;
  const ahora = Date.now();
  if (d.getTime() > ahora + 2 * 60 * 1000) return undefined;            // futuro → reloj mal
  if (d.getTime() < ahora - 2 * 365 * 24 * 60 * 60 * 1000) return undefined; // >2 años → sospechoso
  return d;
};

exports.crear = asyncHandler(async (req, res) => {
  const meta = pickSyncMeta(req.body);
  if (meta?.invalid) throw new HttpError(400, 'clientMutationId y deviceId deben enviarse juntos');

  const cargarPedido = (id) => prisma.pedido.findUnique({
    where: { id },
    include: PEDIDO_INCLUDE
  });

  if (meta) {
    const op = await findOperation(prisma, meta);
    if (op) {
      logDuplicate(op);
      const existente = await cargarPedido(op.entityId);
      if (existente) return res.status(200).json(existente);
    }
  }

  const clean = stripSyncMeta(req.body);
  const { clienteId, items, notas, fechaEntrega, numeroLocal, encargadoEntrega, incluirDeudaAnterior } = clean;

  let pedido;
  try {
    pedido = await prisma.$transaction(async (tx) => {
      const cliente = await tx.cliente.findUnique({ where: { id: clienteId } });
      if (!cliente || !cliente.activo) throw new HttpError(400, 'Cliente no válido');

      const serviciosIds = items.map((i) => i.servicioId);
      // Aceptamos servicios "uso único" (activo=false) siempre que NO estén soft-deleted.
      const serviciosDb  = await tx.servicio.findMany({
        where: { id: { in: serviciosIds }, deletedAt: null }
      });
      const setEncontrados = new Set(serviciosDb.map((s) => s.id));
      const faltantes = serviciosIds.filter((id) => !setEncontrados.has(id));
      if (faltantes.length > 0) {
        throw new HttpError(400, `Servicios inválidos: ${faltantes.join(', ')}`);
      }

      const total = items.reduce(
        (acc, i) => acc + (Number(i.precio) * Number(i.cantidad)),
        0
      );
      const sesion = await sesionAbiertaDeUsuario(tx, req.user.id);

      // ── Consolidación de deuda anterior (punto 9) ──
      // Tomamos las facturas previas del cliente con saldo pendiente y que NO
      // estén ya consolidadas. La deuda NO se suma a `total` (prendas): va al
      // campo aparte `deudaConsolidada`. No se crea ningún Pago: la caja en
      // efectivo no se mueve, sólo se reorganizan saldos.
      let facturasAConsolidar = [];
      let deudaConsolidada = 0;
      if (incluirDeudaAnterior) {
        const previas = await tx.pedido.findMany({
          where: {
            clienteId,
            eliminadoEn:           null,
            estado:                { not: 'CANCELADO' },
            consolidadoEnPedidoId: null
          },
          include: { pagos: { select: { monto: true } } }
        });
        facturasAConsolidar = previas
          .map((p) => ({ pedido: p, pendiente: pendienteDePedido(p) }))
          .filter((x) => x.pendiente > 0.001);
        deudaConsolidada = facturasAConsolidar.reduce((acc, x) => acc + x.pendiente, 0);
        console.log('[diag-deuda] consolidacion al crear pedido', {
          cliente: clienteId,
          pedidosUsadosParaDeuda: facturasAConsolidar.map((x) => ({
            pedido: x.pedido.numero ?? x.pedido.id,
            pendiente: x.pendiente
          })),
          deudaConsolidada
        });
      }

      const createdAtReal = fechaCreacionReal(meta);
      const creado = await tx.pedido.create({
        data: {
          clienteId,
          usuarioId:    req.user.id,
          sesionTrabajoId: sesion?.id ?? null,
          numeroLocal:  numeroLocal || null,
          ...(createdAtReal ? { createdAt: createdAtReal } : {}),
          total,
          deudaConsolidada,
          encargadoEntrega: encargadoEntrega || null,
          notas:        notas || null,
          fechaEntrega: fechaEntrega ? new Date(fechaEntrega) : null,
          items: {
            create: items.map((i) => ({
              servicioId: i.servicioId,
              nombre:     i.nombre || i.servicioNombre || null,
              cantidad:   i.cantidad,
              precio:     Number(i.precio),
              subtotal:   Number(i.precio) * Number(i.cantidad),
              colorActual:   i.colorActual || null,
              colorDeseado:  i.colorDeseado || null,
              observaciones: i.observaciones || i.observacion || null,
              marcaId:       i.marcaId || null,
              marcaNombre:   i.marcaNombre || null,
              marcaCodigo:   i.marcaCodigo || null
            }))
          }
        },
        include: PEDIDO_INCLUDE
      });

      // Migrar el saldo de cada factura origen → marcar + registrar auditoría.
      if (facturasAConsolidar.length > 0) {
        const motivo = `Consolidacion automatica de deuda anterior al crear orden #${creado.numero}`;
        for (const { pedido: orig, pendiente } of facturasAConsolidar) {
          await tx.pedido.update({
            where: { id: orig.id },
            data:  { consolidadoEnPedidoId: creado.id }
          });
          await tx.consolidacionDeuda.create({
            data: {
              pedidoDestinoId:  creado.id,
              pedidoOrigenId:   orig.id,
              montoConsolidado: pendiente,
              usuarioId:        req.user.id,
              motivo
            }
          });
        }
      }

      if (sesion?.id) await recalcularSesionTrabajo(tx, sesion.id);

      if (meta) {
        await createOperation(tx, meta, {
          entityType:  'PEDIDO',
          entityId:    creado.id,
          action:      'CREATE',
          payloadHash: payloadHash(clean)
        });
      }

      // Recargar si hubo consolidación para devolver el desglose ya poblado.
      if (facturasAConsolidar.length > 0) {
        return tx.pedido.findUnique({ where: { id: creado.id }, include: PEDIDO_INCLUDE });
      }
      return creado;
    });
  } catch (e) {
    if (e?.code === 'P2002' && meta) {
      const op = await findOperation(prisma, meta);
      if (op) {
        logDuplicate(op);
        const existente = await cargarPedido(op.entityId);
        if (existente) return res.status(200).json(existente);
      }
    }
    throw e;
  }

  // #7 Auditoría de sincronización (solo fuera de producción, para no llenar
  // logs en el cliente final). Confirma consecutivo, idempotencia y que NO se
  // reemplazó createdAt: createdOfflineAt (hora del dispositivo) vs createdAt
  // guardado; el momento de llegada al servidor queda aparte.
  if (process.env.NODE_ENV !== 'production') {
    console.log('[audit-pedido-crear]', {
      entityId:          pedido.id,
      numero:            pedido.numero,
      numeroLocal:       pedido.numeroLocal,
      clientMutationId:  meta?.clientMutationId ?? null,
      deviceId:          meta?.deviceId ?? null,
      createdOfflineAt:  meta?.createdOfflineAt ?? null,
      createdAtGuardado: pedido.createdAt,
      usoFechaDispositivo: !!fechaCreacionReal(meta),
      llegadaServidor:   new Date().toISOString()
    });
  }

  ioBus.emit('nuevo-pedido', pedido);
  res.status(201).json(pedido);
});

/* Snapshot serializable de una orden para auditoría/factura anterior. Incluye
 * lo que el recibo necesita (cliente, items, total, pagos, saldo, estado). */
const construirSnapshotPedido = (p) => {
  const pagado = (p.pagos ?? []).reduce((acc, pg) => acc + Number(pg.monto), 0);
  const total  = Number(p.total ?? 0);
  const deudaConsolidada = Number(p.deudaConsolidada ?? 0);
  return {
    id: p.id, numero: p.numero, numeroLocal: p.numeroLocal,
    estado: p.estado, total,
    deudaConsolidada,
    consolidadoEnPedidoId: p.consolidadoEnPedidoId ?? null,
    consolidadoEn: p.consolidadoEn
      ? { id: p.consolidadoEn.id, numero: p.consolidadoEn.numero, numeroLocal: p.consolidadoEn.numeroLocal }
      : null,
    encargadoEntrega: p.encargadoEntrega ?? null,
    fechaEntrega: p.fechaEntrega, notas: p.notas, createdAt: p.createdAt,
    sincronizado: p.sincronizado,
    cliente: p.cliente ? {
      id: p.cliente.id, nombre: p.cliente.nombre, identificador: p.cliente.identificador,
      telefono: p.cliente.telefono, direccion: p.cliente.direccion
    } : null,
    usuario: p.usuario ? { id: p.usuario.id, nombre: p.usuario.nombre } : null,
    items: (p.items ?? []).map((it) => ({
      id: it.id, nombre: it.nombre, servicioId: it.servicioId,
      servicio: it.servicio ? { nombre: it.servicio.nombre, codigo: it.servicio.codigo } : null,
      cantidad: it.cantidad, precio: Number(it.precio), subtotal: Number(it.subtotal),
      colorActual: it.colorActual, colorDeseado: it.colorDeseado, observaciones: it.observaciones,
      marcaId: it.marcaId, marcaNombre: it.marcaNombre, marcaCodigo: it.marcaCodigo
    })),
    pagos: (p.pagos ?? []).map((pg) => ({
      id: pg.id, monto: Number(pg.monto), metodo: pg.metodo, createdAt: pg.createdAt,
      usuario: pg.usuario ? { id: pg.usuario.id, nombre: pg.usuario.nombre } : null
    })),
    pagado,
    saldo: pendienteDePedido(p, pagado)
  };
};

const construirResumenCambios = (antes, despues) => ({
  totalAntes:   Number(antes.total ?? 0),
  totalDespues: Number(despues.total ?? 0),
  itemsAntes:   (antes.items ?? []).length,
  itemsDespues: (despues.items ?? []).length,
  clienteCambio: antes.clienteId !== despues.clienteId,
  notasCambio:   (antes.notas ?? null) !== (despues.notas ?? null),
  fechaEntregaCambio:
    String(antes.fechaEntrega ?? '') !== String(despues.fechaEntrega ?? '')
});

exports.editar = asyncHandler(async (req, res) => {
  if (req.user?.rol !== 'ADMIN') {
    throw new HttpError(403, 'Solo un administrador puede editar una orden');
  }

  const { id } = req.params;
  const { clienteId, motivo, items, notas, fechaEntrega, encargadoEntrega, baseUpdatedAt } = req.body;

  // Idempotencia: una edición offline reintentada (misma clientMutationId) no
  // debe aplicar dos veces ni duplicar el historial. Si ya se procesó, devolvemos
  // el pedido tal cual quedó.
  const meta = pickSyncMeta(req.body);
  if (meta?.invalid) throw new HttpError(400, 'clientMutationId y deviceId deben enviarse juntos');
  if (meta) {
    const op = await findOperation(prisma, meta);
    if (op) {
      logDuplicate(op);
      const existente = await prisma.pedido.findUnique({ where: { id: op.entityId }, include: PEDIDO_INCLUDE });
      if (existente) return res.json(existente);
    }
  }

  const usuarioId = (await prisma.usuario.findUnique({
    where: { id: req.user.id }, select: { id: true }
  }))?.id ?? null;

  const pedido = await prisma.$transaction(async (tx) => {
    const actual = await tx.pedido.findFirst({
      where:   { id, eliminadoEn: null },
      include: PEDIDO_INCLUDE
    });
    if (!actual) throw new HttpError(404, 'Pedido no encontrado');

    /* Concurrencia optimista para ediciones OFFLINE: el cliente envía el
     * updatedAt que tenía cuando empezó a editar. Si el pedido cambió en el
     * servidor desde entonces (p.ej. lo editaron en desktop), devolvemos 409
     * para NO sobrescribir esos cambios a ciegas. Si no se envía baseUpdatedAt
     * (edición online normal), no se aplica el chequeo. */
    if (baseUpdatedAt) {
      const base = new Date(baseUpdatedAt);
      const actualTs = new Date(actual.updatedAt);
      if (!Number.isNaN(base.getTime()) && actualTs.getTime() - base.getTime() > 1000) {
        throw new HttpError(409, 'La orden fue modificada en otro dispositivo. Vuelve a abrirla para no perder esos cambios.');
      }
    }

    // Snapshot "antes" (factura anterior) + ids de items con garantías.
    const snapshotAntes = construirSnapshotPedido(actual);
    const idsItemConGarantia = new Set(
      (actual.garantias ?? []).filter((g) => g.pedidoItemId).map((g) => g.pedidoItemId)
    );

    // Cliente opcional: si se cambia, validar que exista y esté activo.
    if (clienteId && clienteId !== actual.clienteId) {
      const cliente = await tx.cliente.findUnique({ where: { id: clienteId } });
      if (!cliente || !cliente.activo) throw new HttpError(400, 'Cliente no válido');
    }

    // Validar SOLO los servicios nuevos o cambiados. Los items existentes que no
    // cambian de servicio se respetan tal cual: así no se rompe la edición de
    // pedidos históricos cuyo servicio fue soft-deleted después.
    const servicioActualPorItem = new Map(actual.items.map((it) => [it.id, it.servicioId]));
    const serviciosAValidar = [...new Set(
      items
        .filter((i) => !i.id || servicioActualPorItem.get(i.id) !== i.servicioId)
        .map((i) => i.servicioId)
    )];
    if (serviciosAValidar.length > 0) {
      const serviciosDb = await tx.servicio.findMany({
        where:  { id: { in: serviciosAValidar }, deletedAt: null },
        select: { id: true }
      });
      const setEncontrados = new Set(serviciosDb.map((s) => s.id));
      const faltantes = serviciosAValidar.filter((sid) => !setEncontrados.has(sid));
      if (faltantes.length > 0) {
        throw new HttpError(400, `Servicios inválidos: ${faltantes.join(', ')}`);
      }
    }

    const datosItem = (i) => ({
      servicioId:    i.servicioId,
      nombre:        i.nombre || i.servicioNombre || null,
      cantidad:      i.cantidad,
      precio:        Number(i.precio),
      subtotal:      Number(i.precio) * Number(i.cantidad),
      colorActual:   i.colorActual || null,
      colorDeseado:  i.colorDeseado || null,
      observaciones: i.observaciones || i.observacion || null,
      marcaId:       i.marcaId || null,
      marcaNombre:   i.marcaNombre || null,
      marcaCodigo:   i.marcaCodigo || null
    });

    // ── Diff incremental de items (preserva trazabilidad de garantías) ──
    const actualesPorId = new Map(actual.items.map((it) => [it.id, it]));
    const idsEntrantes  = new Set(items.map((i) => i.id).filter(Boolean));

    // 1) Items removidos por el admin: bloquear si tienen garantías.
    for (const it of actual.items) {
      if (!idsEntrantes.has(it.id)) {
        if (idsItemConGarantia.has(it.id)) {
          throw new HttpError(409,
            `No se puede eliminar la prenda "${it.nombre ?? 'sin nombre'}": tiene garantías asociadas. ` +
            'Resuelve o reasigna la garantía antes de quitarla.');
        }
        await tx.pedidoItem.delete({ where: { id: it.id } });
      }
    }

    // 2) Update (id existente) / Create (id nuevo o desconocido).
    for (const i of items) {
      if (i.id && actualesPorId.has(i.id)) {
        await tx.pedidoItem.update({ where: { id: i.id }, data: datosItem(i) });
      } else {
        await tx.pedidoItem.create({ data: { ...datosItem(i), pedidoId: id } });
      }
    }

    const total = items.reduce((acc, i) => acc + Number(i.precio) * Number(i.cantidad), 0);

    const dataPedido = { total };
    if (clienteId) dataPedido.clienteId = clienteId;
    if (encargadoEntrega !== undefined) dataPedido.encargadoEntrega = encargadoEntrega || null;
    if (notas !== undefined) dataPedido.notas = notas || null;
    if (fechaEntrega !== undefined) {
      dataPedido.fechaEntrega = fechaEntrega ? new Date(fechaEntrega) : null;
    }

    const actualizado = await tx.pedido.update({
      where:   { id },
      data:    dataPedido,
      include: PEDIDO_INCLUDE
    });

    // Auditoría: snapshot "después" + registro de edición (motivo obligatorio).
    const snapshotDespues = construirSnapshotPedido(actualizado);
    await tx.pedidoEdicionHistorial.create({
      data: {
        pedidoId:            id,
        usuarioId,
        motivo,
        cambiosJson:         JSON.stringify(construirResumenCambios(actual, actualizado)),
        snapshotAntesJson:   JSON.stringify(snapshotAntes),
        snapshotDespuesJson: JSON.stringify(snapshotDespues),
        totalAntes:          Number(actual.total),
        totalDespues:        total
      }
    });

    if (actual.sesionTrabajoId) await recalcularSesionTrabajo(tx, actual.sesionTrabajoId);

    if (meta) {
      await createOperation(tx, meta, {
        entityType:  'PEDIDO',
        entityId:    id,
        action:      'EDITAR',
        payloadHash: payloadHash({ id, items, notas, fechaEntrega, motivo })
      });
    }

    return actualizado;
  });

  ioBus.emit('pedido-actualizado', { id: pedido.id, pedido });
  res.json(pedido);
});

/* Historial de ediciones de una orden (auditoría + facturas anteriores).
 * Devuelve del más reciente al más antiguo, con snapshots parseados. */
exports.historialEdiciones = asyncHandler(async (req, res) => {
  const existe = await prisma.pedido.findFirst({
    where: { id: req.params.id }, select: { id: true }
  });
  if (!existe) throw new HttpError(404, 'Pedido no encontrado');

  const filas = await prisma.pedidoEdicionHistorial.findMany({
    where:   { pedidoId: req.params.id },
    include: { usuario: { select: { id: true, nombre: true } } },
    orderBy: { createdAt: 'desc' }
  });

  const parse = (s) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };

  res.json(filas.map((f) => ({
    id:            f.id,
    motivo:        f.motivo,
    usuario:       f.usuario,
    createdAt:     f.createdAt,
    totalAntes:    Number(f.totalAntes),
    totalDespues:  Number(f.totalDespues),
    cambios:       parse(f.cambiosJson),
    snapshotAntes:   parse(f.snapshotAntesJson),
    snapshotDespues: parse(f.snapshotDespuesJson)
  })));
});

/* Revierte la consolidación de deuda de una orden destino (punto 9, ADMIN).
 * Restaura el saldo de las facturas origen (quita consolidadoEnPedidoId) y marca
 * las filas como revertidas. Bloquea si ya se abonó contra la porción de deuda
 * (pagos > total de prendas) para no descuadrar dinero. No toca pagos ni caja. */
exports.revertirConsolidacion = asyncHandler(async (req, res) => {
  if (req.user?.rol !== 'ADMIN') {
    throw new HttpError(403, 'Solo un administrador puede revertir una consolidación');
  }
  const { id } = req.params;

  const pedido = await prisma.$transaction(async (tx) => {
    const destino = await tx.pedido.findFirst({
      where:   { id, eliminadoEn: null },
      include: {
        pagos: { select: { monto: true } },
        consolidacionesDestino: { where: { revertidoEn: null } }
      }
    });
    if (!destino) throw new HttpError(404, 'Pedido no encontrado');
    if (destino.consolidacionesDestino.length === 0) {
      throw new HttpError(400, 'Esta orden no tiene deuda consolidada vigente');
    }

    const totalPrendas = Number(destino.total);
    const pagado = destino.pagos.reduce((acc, p) => acc + Number(p.monto), 0);
    if (pagado > totalPrendas + 0.001) {
      throw new HttpError(409,
        'No se puede revertir: ya se abonó contra la deuda consolidada. ' +
        'Reversa los pagos correspondientes antes de deshacer la consolidación.');
    }

    const ahora = new Date();
    for (const c of destino.consolidacionesDestino) {
      await tx.pedido.update({
        where: { id: c.pedidoOrigenId },
        data:  { consolidadoEnPedidoId: null }
      });
      await tx.consolidacionDeuda.update({
        where: { id: c.id },
        data:  { revertidoEn: ahora, revertidoPorId: req.user.id }
      });
    }

    return tx.pedido.update({
      where:   { id },
      data:    { deudaConsolidada: 0 },
      include: PEDIDO_INCLUDE
    });
  });

  ioBus.emit('pedido-actualizado', { id: pedido.id, pedido });
  res.json(pedido);
});

/* "Llamar deuda anterior" sobre una orden YA existente (punto 9, ADMIN).
 * Toma las facturas previas del MISMO cliente con saldo pendiente y aún no
 * consolidadas, y migra su saldo a esta orden (destino), sumándolo a
 * `deudaConsolidada`. NO crea pagos ni mueve caja: sólo reorganiza saldos.
 * Idempotente: las facturas ya consolidadas quedan excluidas, así que reintentar
 * no las vuelve a consolidar. */
exports.consolidarDeuda = asyncHandler(async (req, res) => {
  if (req.user?.rol !== 'ADMIN') {
    throw new HttpError(403, 'Solo un administrador puede consolidar deuda');
  }
  const { id } = req.params;

  const pedido = await prisma.$transaction(async (tx) => {
    const destino = await tx.pedido.findFirst({ where: { id, eliminadoEn: null } });
    if (!destino) throw new HttpError(404, 'Pedido no encontrado');
    if (destino.estado === 'CANCELADO') {
      throw new HttpError(400, 'No se puede consolidar deuda en una orden cancelada');
    }
    if (destino.consolidadoEnPedidoId) {
      throw new HttpError(400, 'Esta orden ya fue consolidada en otra factura; no puede ser destino');
    }

    const previas = await tx.pedido.findMany({
      where: {
        clienteId:             destino.clienteId,
        id:                    { not: destino.id },
        eliminadoEn:           null,
        estado:                { not: 'CANCELADO' },
        consolidadoEnPedidoId: null
      },
      include: { pagos: { select: { monto: true } } }
    });
    const aConsolidar = previas
      .map((p) => ({ pedido: p, pendiente: pendienteDePedido(p) }))
      .filter((x) => x.pendiente > 0.001);

    if (aConsolidar.length === 0) {
      throw new HttpError(400, 'El cliente no tiene facturas anteriores con saldo pendiente por consolidar');
    }

    const sumaNueva = aConsolidar.reduce((acc, x) => acc + x.pendiente, 0);
    const motivo = `Consolidacion manual de deuda anterior en orden #${destino.numero}`;
    for (const { pedido: orig, pendiente } of aConsolidar) {
      await tx.pedido.update({
        where: { id: orig.id },
        data:  { consolidadoEnPedidoId: destino.id }
      });
      await tx.consolidacionDeuda.create({
        data: {
          pedidoDestinoId:  destino.id,
          pedidoOrigenId:   orig.id,
          montoConsolidado: pendiente,
          usuarioId:        req.user.id,
          motivo
        }
      });
    }

    return tx.pedido.update({
      where:   { id: destino.id },
      data:    { deudaConsolidada: { increment: sumaNueva } },
      include: PEDIDO_INCLUDE
    });
  });

  ioBus.emit('pedido-actualizado', { id: pedido.id, pedido });
  res.json(pedido);
});

exports.actualizarEstado = asyncHandler(async (req, res) => {
  const { estado } = req.body;

  if (estado === 'ENTREGADO') {
    throw new HttpError(400, 'Para marcar como ENTREGADO usa POST /api/pedidos/:id/entregar');
  }

  const pedido = await prisma.$transaction(async (tx) => {
    const actual = await tx.pedido.findFirst({
      where: { id: req.params.id, eliminadoEn: null }
    });
    if (!actual) throw new HttpError(404, 'Pedido no encontrado');
    if (actual.estado === estado) return actual;

    /* REGLA: si el pedido ya está ENTREGADO, solo ADMIN puede cambiarle el
     * estado. Empleado/recolector queda bloqueado. */
    if (actual.estado === 'ENTREGADO' && req.user?.rol !== 'ADMIN') {
      throw new HttpError(403, 'Solo un administrador puede modificar un pedido ya entregado');
    }

    const actualizado = await tx.pedido.update({
      where:   { id: req.params.id },
      data:    { estado },
      include: PEDIDO_INCLUDE
    });

    await tx.pedidoEstadoHistorial.create({
      data: {
        pedidoId: req.params.id,
        usuarioId: req.user.id,
        estadoAnterior: actual.estado,
        estadoNuevo: estado,
        accion: 'CAMBIO_ESTADO',
        conFoto: false
      }
    });

    if (actual.sesionTrabajoId) await recalcularSesionTrabajo(tx, actual.sesionTrabajoId);
    return actualizado;
  });

  const pedidoCompleto = pedido.cliente
    ? pedido
    : await prisma.pedido.findUnique({ where: { id: pedido.id }, include: PEDIDO_INCLUDE });

  ioBus.emit('estado-cambiado', {
    id:     pedidoCompleto.id,
    estado: pedidoCompleto.estado,
    pedido: pedidoCompleto
  });
  res.json(pedidoCompleto);
});

exports.entregar = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const meta = pickSyncMeta(req.body ?? {});
  if (meta?.invalid) throw new HttpError(400, 'clientMutationId y deviceId deben enviarse juntos');

  const cargarPedido = (pedidoId) => prisma.pedido.findUnique({
    where: { id: pedidoId },
    include: PEDIDO_INCLUDE
  });

  if (meta) {
    const op = await findOperation(prisma, meta);
    if (op) {
      logDuplicate(op);
      const existente = await cargarPedido(op.entityId);
      if (existente) return res.status(200).json({ ...existente, ok: true, pedido: existente });
    }
  }

  // Flag de Opciones Avanzadas: entrega tiene su propia regla. Default false.
  const cfg = await prisma.configuracionEmpresa.findUnique({
    where: { id: 'singleton' }, select: { exigirFotoEntrega: true }
  });
  const exigeFoto = cfg?.exigirFotoEntrega ?? false;
  if (exigeFoto && !req.file) {
    throw new HttpError(400, 'La foto de entrega es obligatoria');
  }

  const fotoPath = req.file?.filename ?? null;
  const fotoUrl  = req.file ? `/uploads/entregas/${req.file.filename}` : null;
  const observacion = req.body?.observacion?.trim() || null;
  const clean = stripSyncMeta(req.body ?? {});

  const pedido = await prisma.$transaction(async (tx) => {
    const actual = await tx.pedido.findFirst({
      where: { id, eliminadoEn: null }
    });
    if (!actual) throw new HttpError(404, 'Pedido no encontrado');
    if (actual.estado === 'ENTREGADO') {
      if (meta) {
        await createOperation(tx, meta, {
          entityType:  'PEDIDO',
          entityId:    id,
          action:      'ENTREGAR',
          payloadHash: payloadHash(clean)
        });
      }
      return actual;
    }
    if (actual.estado === 'CANCELADO') throw new HttpError(400, 'No se puede entregar un pedido cancelado');

    const sesion = await sesionAbiertaDeUsuario(tx, req.user.id);

    // La evidencia con foto solo se crea si hubo foto. La trazabilidad del
    // cambio de estado queda SIEMPRE en PedidoEstadoHistorial (abajo).
    if (fotoUrl && fotoPath) {
      await tx.evidenciaEntrega.create({
        data: {
          pedidoId:       id,
          usuarioId:      req.user.id,
          sesionTrabajoId: sesion?.id ?? actual.sesionTrabajoId ?? null,
          fotoUrl,
          fotoPath,
          observacion
        }
      });
    }

    const actualizado = await tx.pedido.update({
      where:   { id },
      data:    { estado: 'ENTREGADO' },
      include: PEDIDO_INCLUDE
    });

    await tx.pedidoEstadoHistorial.create({
      data: {
        pedidoId:      id,
        usuarioId:     req.user.id,
        estadoAnterior: actual.estado,
        estadoNuevo:   'ENTREGADO',
        accion:        'ENTREGAR',
        observacion,
        conFoto:       Boolean(req.file)
      }
    });

    if (actual.sesionTrabajoId) await recalcularSesionTrabajo(tx, actual.sesionTrabajoId);

    if (meta) {
      await createOperation(tx, meta, {
        entityType:  'PEDIDO',
        entityId:    actualizado.id,
        action:      'ENTREGAR',
        payloadHash: payloadHash(clean)
      });
    }

    return actualizado;
  });

  const pedidoCompleto = await prisma.pedido.findUnique({
    where: { id: pedido.id },
    include: PEDIDO_INCLUDE
  });

  ioBus.emit('pedido-entregado', { id: pedidoCompleto.id, pedido: pedidoCompleto });
  ioBus.emit('estado-cambiado',  { id: pedidoCompleto.id, estado: 'ENTREGADO', pedido: pedidoCompleto });

  res.json({ ...pedidoCompleto, ok: true, pedido: pedidoCompleto });
});

exports.obtenerEvidenciaEntrega = asyncHandler(async (req, res) => {
  const evidencia = await prisma.evidenciaEntrega.findUnique({
    where:   { pedidoId: req.params.id },
    include: { usuario: { select: { id: true, nombre: true } } }
  });
  res.json(evidencia ?? null);
});

exports.eliminar = asyncHandler(async (req, res) => {
  const pedido = await prisma.pedido.findFirst({
    where: { id: req.params.id, eliminadoEn: null }
  });
  if (!pedido) throw new HttpError(404, 'Pedido no encontrado');

  await prisma.pedido.update({
    where: { id: req.params.id },
    data:  { eliminadoEn: new Date(), eliminadoPorId: req.user.id }
  });
  if (pedido.sesionTrabajoId) {
    await prisma.$transaction((tx) => recalcularSesionTrabajo(tx, pedido.sesionTrabajoId));
  }
  ioBus.emit('pedido-eliminado', { id: req.params.id });
  res.json({ mensaje: 'Pedido eliminado' });
});
