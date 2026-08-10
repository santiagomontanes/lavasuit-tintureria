/* Exportación de la información del sistema a Excel (.xlsx).
 *
 * Es una CONSULTA: solo lee. No crea, no actualiza y no borra nada.
 *
 * Reglas del archivo generado:
 *  - Una hoja por modelo real; las columnas son campos que existen en Prisma
 *    (no se inventan métricas nuevas).
 *  - Nunca salen secretos: `Usuario.password` y cualquier token quedan fuera.
 *  - Los importes van como NÚMERO con formato de moneda (se pueden sumar en
 *    Excel); las fechas como fecha real con formato dd/mm/yyyy hh:mm.
 *  - Encabezado en negrilla, congelado, con autofiltro y ancho por columna.
 */

const ExcelJS = require('exceljs');
const prisma = require('../lib/prisma');
const asyncHandler = require('../utils/asyncHandler');
const { pendienteDePedido, sumaPagos } = require('../lib/saldos');

const FORMATO_MONEDA = '"$"#,##0';
const FORMATO_FECHA  = 'dd/mm/yyyy hh:mm';

/** Rango [desde, hasta] a partir de query params. `todos=true` lo desactiva. */
const resolverRango = (query) => {
  const todos = query.todos === 'true' || query.todos === '1';
  if (todos) return { todos: true, rango: null, desde: null, hasta: null };

  const desde = query.desde ? new Date(`${query.desde}T00:00:00.000`) : null;
  const hasta = query.hasta ? new Date(`${query.hasta}T23:59:59.999`) : null;
  const rango = {};
  if (desde && !Number.isNaN(desde.getTime())) rango.gte = desde;
  if (hasta && !Number.isNaN(hasta.getTime())) rango.lte = hasta;

  return {
    todos: Object.keys(rango).length === 0,
    rango: Object.keys(rango).length === 0 ? null : rango,
    desde, hasta
  };
};

const num = (v) => (v == null ? null : Number(v));
const fecha = (v) => (v ? new Date(v) : null);

/**
 * Escribe una hoja con encabezado en negrilla, autofiltro, panel congelado y
 * anchos calculados. `columnas` = [{ header, key, width, style }].
 */
const agregarHoja = (wb, nombre, columnas, filas) => {
  const ws = wb.addWorksheet(nombre, {
    views: [{ state: 'frozen', ySplit: 1 }]
  });

  ws.columns = columnas.map((c) => ({
    header: c.header,
    key:    c.key,
    width:  c.width ?? Math.min(40, Math.max(12, String(c.header).length + 4)),
    style:  c.style
  }));

  ws.getRow(1).font = { bold: true };
  ws.getRow(1).alignment = { vertical: 'middle' };
  ws.getRow(1).border = { bottom: { style: 'thin' } };

  for (const fila of filas) ws.addRow(fila);

  // Autofiltro sobre todo el encabezado (aunque la hoja venga vacía).
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to:   { row: 1, column: columnas.length }
  };

  return ws;
};

const colMoneda = (header, key, width = 16) =>
  ({ header, key, width, style: { numFmt: FORMATO_MONEDA } });
const colFecha = (header, key, width = 18) =>
  ({ header, key, width, style: { numFmt: FORMATO_FECHA } });

/* ─── GET /api/exportacion/clientes ───────────────────────────────────────────
 *
 * Exporta la lista de clientes a .xlsx. Es una CONSULTA: solo lee.
 *
 * Filtros (los mismos que la pantalla de Clientes de Desktop):
 *   q         búsqueda por nombre o código — NUNCA por teléfono, misma regla
 *             que /clientes
 *   usuarioId solo los clientes en la ruta de ese empleado
 *   activo    'true' | 'false'
 * Sin filtros exporta TODOS: no hay paginación en esta consulta, así que no
 * queda limitada a los 50 primeros de la tabla.
 */
exports.clientes = asyncHandler(async (req, res) => {
  const termino   = String(req.query.q ?? '').trim();
  const usuarioId = String(req.query.usuarioId ?? '').trim();
  const activoRaw = String(req.query.activo ?? '').trim();

  const where = {};
  if (termino) {
    where.OR = [
      { nombre:        { contains: termino } },
      { identificador: { contains: termino } }
    ];
  }
  if (activoRaw === 'true' || activoRaw === 'false') where.activo = activoRaw === 'true';
  if (usuarioId) {
    where.rutas = { some: { usuarioId, activo: true } };
  }

  const clientes = await prisma.cliente.findMany({
    where,
    include: {
      creadoPor: { select: { nombre: true } },
      asignadoA: { select: { nombre: true } },
      rutas: {
        where:   { activo: true },
        include: { usuario: { select: { id: true, nombre: true, rol: true } } }
      }
    },
    orderBy: [{ sortKey: 'asc' }, { nombre: 'asc' }]
  });

  console.log('[exportacion.clientes]', {
    usuarioId: req.user?.id,
    filtros: { q: termino || null, usuarioId: usuarioId || null, activo: activoRaw || null },
    exportados: clientes.length
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'LavaSuit';
  wb.created = new Date();

  // ── CLIENTES: una fila por cliente ────────────────────────────────────────
  const ws = agregarHoja(wb, 'CLIENTES', [
    // Código y teléfono como TEXTO: si Excel los toma como número, "007" se
    // convierte en 7 y se pierden los ceros iniciales.
    { header: 'Código', key: 'identificador', width: 12, style: { numFmt: '@' } },
    { header: 'Nombre', key: 'nombre', width: 30 },
    { header: 'Teléfono', key: 'telefono', width: 16, style: { numFmt: '@' } },
    { header: 'Email', key: 'email', width: 26 },
    { header: 'Dirección', key: 'direccion', width: 32 },
    { header: 'Orden base', key: 'ordenBase', width: 12 },
    { header: 'Sub orden', key: 'subOrden', width: 10 },
    { header: 'Activo', key: 'activo', width: 10 },
    { header: 'Empleados asignados', key: 'empleados', width: 34 },
    { header: 'Notas', key: 'notas', width: 34 },
    colFecha('Creado', 'createdAt'),
    colFecha('Actualizado', 'updatedAt'),
    { header: 'Creado por', key: 'creadoPor', width: 20 }
  ], clientes.map((c) => ({
    identificador: c.identificador ?? '',
    nombre: c.nombre,
    telefono: c.telefono ?? '',
    email: c.email ?? '',
    direccion: c.direccion ?? '',
    ordenBase: c.ordenBase ?? null,
    subOrden: c.subOrden ?? 0,
    activo: c.activo ? 'Sí' : 'No',
    // Relación muchos-a-muchos resumida en una celda; el detalle completo va
    // en la hoja CLIENTES_EMPLEADOS.
    empleados: c.rutas.map((r) => r.usuario?.nombre).filter(Boolean).join(', '),
    notas: c.notas ?? '',
    createdAt: fecha(c.createdAt),
    updatedAt: fecha(c.updatedAt),
    creadoPor: c.creadoPor?.nombre ?? ''
  })));
  // Texto explícito en las columnas de código y teléfono.
  ws.getColumn('identificador').numFmt = '@';
  ws.getColumn('telefono').numFmt = '@';

  // ── CLIENTES_EMPLEADOS: una fila por (cliente, empleado) ──────────────────
  const filasRutas = [];
  for (const c of clientes) {
    for (const r of c.rutas) {
      filasRutas.push({
        identificador: c.identificador ?? '',
        cliente: c.nombre,
        empleado: r.usuario?.nombre ?? '',
        rol: r.usuario?.rol ?? '',
        orden: r.orden ?? null,
        subOrden: r.subOrden ?? 0
      });
    }
  }
  const wsRutas = agregarHoja(wb, 'CLIENTES_EMPLEADOS', [
    { header: 'Código', key: 'identificador', width: 12, style: { numFmt: '@' } },
    { header: 'Cliente', key: 'cliente', width: 30 },
    { header: 'Empleado', key: 'empleado', width: 24 },
    { header: 'Rol', key: 'rol', width: 14 },
    { header: 'Orden en la ruta', key: 'orden', width: 16 },
    { header: 'Sub orden', key: 'subOrden', width: 10 }
  ], filasRutas);
  wsRutas.getColumn('identificador').numFmt = '@';

  const nombreArchivo = `clientes_lavasuit_${new Date().toISOString().slice(0, 10)}.xlsx`;
  const buffer = await wb.xlsx.writeBuffer();

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
  res.setHeader('X-Nombre-Archivo', nombreArchivo);
  res.send(Buffer.from(buffer));
});

// ─── GET /api/exportacion/excel ──────────────────────────────────────────────

exports.excel = asyncHandler(async (req, res) => {
  const { todos, rango, desde, hasta } = resolverRango(req.query);
  const filtroFecha = rango ? { createdAt: rango } : {};

  /* Modo "resultados filtrados": mismos filtros que el listado de Pedidos del
   * Desktop, para exportar exactamente lo que el usuario está viendo (sin
   * paginar). Con `soloPedidos` se omiten los catálogos y se generan las hojas
   * de pedidos/prendas/pagos del recorte. */
  const soloPedidos = req.query.soloPedidos === 'true' || req.query.soloPedidos === '1';
  const wherePedidos = { eliminadoEn: null, ...filtroFecha };
  if (req.query.estado)    wherePedidos.estado    = String(req.query.estado);
  if (req.query.clienteId) wherePedidos.clienteId = String(req.query.clienteId);
  if (req.query.usuarioId) wherePedidos.usuarioId = String(req.query.usuarioId);
  const termino = String(req.query.q ?? '').trim();
  if (termino) {
    const orNum = Number.isNaN(Number(termino)) ? [] : [{ numero: Number(termino) }];
    wherePedidos.OR = [
      ...orNum,
      { numeroLocal: { contains: termino } },
      { cliente: { nombre:        { contains: termino } } },
      { cliente: { identificador: { contains: termino } } }
    ];
  }

  console.log('[exportacion.excel]', {
    usuarioId: req.user?.id,
    modo: todos ? 'TODOS' : 'RANGO',
    soloPedidos,
    filtros: { estado: req.query.estado ?? null, clienteId: req.query.clienteId ?? null, usuarioId: req.query.usuarioId ?? null, q: termino || null },
    desde: desde?.toISOString() ?? null,
    hasta: hasta?.toISOString() ?? null
  });

  const [
    clientes, pedidos, pagos, gastos, cajas,
    marcas, servicios, usuarios, garantias, consolidaciones
  ] = await Promise.all([
    // Catálogo completo: un cliente sin pedidos en el rango sigue siendo útil.
    soloPedidos ? [] : prisma.cliente.findMany({
      include: {
        asignadoA: { select: { nombre: true } },
        creadoPor: { select: { nombre: true } }
      },
      orderBy: [{ sortKey: 'asc' }, { nombre: 'asc' }]
    }),
    prisma.pedido.findMany({
      where: wherePedidos,
      include: {
        cliente: { select: { nombre: true, identificador: true, telefono: true } },
        usuario: { select: { nombre: true } },
        items:   { include: { servicio: { select: { nombre: true, codigo: true } } } },
        pagos:   true
      },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.pago.findMany({
      where: filtroFecha,
      include: {
        usuario: { select: { nombre: true } },
        pedido:  {
          select: {
            numero: true, numeroLocal: true,
            cliente: { select: { nombre: true, identificador: true } }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    }),
    soloPedidos ? [] : prisma.gasto.findMany({
      where: { deletedAt: null, ...(rango ? { fecha: rango } : {}) },
      include: { creadoPor: { select: { nombre: true } } },
      orderBy: { fecha: 'desc' }
    }),
    soloPedidos ? [] : prisma.cajaSesion.findMany({
      where: rango ? { fechaApertura: rango } : {},
      include: { usuario: { select: { nombre: true } } },
      orderBy: { fechaApertura: 'desc' }
    }),
    soloPedidos ? [] : prisma.marca.findMany({ orderBy: { nombre: 'asc' } }),
    soloPedidos ? [] : prisma.servicio.findMany({ orderBy: { nombre: 'asc' } }),
    // Sin `password`: se seleccionan explícitamente los campos públicos.
    soloPedidos ? [] : prisma.usuario.findMany({
      select: { id: true, nombre: true, email: true, rol: true, activo: true, createdAt: true },
      orderBy: { nombre: 'asc' }
    }),
    soloPedidos ? [] : prisma.garantia.findMany({
      where: filtroFecha,
      include: {
        usuario: { select: { nombre: true } },
        pedido:  { select: { numero: true, cliente: { select: { nombre: true } } } }
      },
      orderBy: { createdAt: 'desc' }
    }),
    soloPedidos ? [] : prisma.consolidacionDeuda.findMany({
      where: filtroFecha,
      include: {
        usuario:       { select: { nombre: true } },
        pedidoOrigen:  { select: { numero: true, numeroLocal: true } },
        pedidoDestino: { select: { numero: true, numeroLocal: true } }
      },
      orderBy: { createdAt: 'desc' }
    })
  ]);

  /* En modo "resultados filtrados" los pagos se acotan a los pedidos
   * exportados: si el usuario filtró por un cliente, no tiene sentido que la
   * hoja PAGOS traiga los cobros de todos los demás. */
  const idsPedidos = new Set(pedidos.map((p) => p.id));
  const pagosExportados = soloPedidos ? pagos.filter((p) => idsPedidos.has(p.pedidoId)) : pagos;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'LavaSuit';
  wb.created = new Date();

  // ── Portada: qué contiene el archivo y con qué filtro se generó ───────────
  agregarHoja(wb, 'RESUMEN', [
    { header: 'Dato', key: 'dato', width: 28 },
    { header: 'Valor', key: 'valor', width: 40 }
  ], [
    { dato: 'Generado', valor: new Date().toLocaleString('es-CO') },
    { dato: 'Generado por', valor: req.user?.nombre ?? req.user?.email ?? '—' },
    { dato: 'Rango', valor: todos ? 'Todos los registros' : `${req.query.desde ?? 'inicio'} a ${req.query.hasta ?? 'hoy'}` },
    { dato: 'Clientes', valor: clientes.length },
    { dato: 'Pedidos', valor: pedidos.length },
    { dato: 'Prendas / items', valor: pedidos.reduce((a, p) => a + p.items.length, 0) },
    { dato: 'Pagos', valor: pagosExportados.length },
    { dato: 'Gastos', valor: gastos.length },
    { dato: 'Sesiones de caja', valor: cajas.length },
    { dato: 'Garantías', valor: garantias.length },
    { dato: 'Consolidaciones de deuda', valor: consolidaciones.length }
  ]);

  // ── CLIENTES ──────────────────────────────────────────────────────────────
  agregarHoja(wb, 'CLIENTES', [
    { header: 'Código', key: 'identificador', width: 12 },
    { header: 'Nombre', key: 'nombre', width: 30 },
    { header: 'Teléfono', key: 'telefono', width: 16 },
    { header: 'Email', key: 'email', width: 26 },
    { header: 'Dirección', key: 'direccion', width: 32 },
    { header: 'Orden base', key: 'ordenBase', width: 12 },
    { header: 'Sub orden', key: 'subOrden', width: 10 },
    { header: 'Empleado asignado', key: 'asignado', width: 22 },
    { header: 'Activo', key: 'activo', width: 10 },
    { header: 'Notas', key: 'notas', width: 34 },
    colFecha('Creado', 'createdAt'),
    { header: 'Creado por', key: 'creadoPor', width: 20 }
  ], clientes.map((c) => ({
    identificador: c.identificador ?? '',
    nombre: c.nombre,
    telefono: c.telefono,
    email: c.email ?? '',
    direccion: c.direccion ?? '',
    ordenBase: c.ordenBase ?? null,
    subOrden: c.subOrden ?? 0,
    asignado: c.asignadoA?.nombre ?? '',
    activo: c.activo ? 'Sí' : 'No',
    notas: c.notas ?? '',
    createdAt: fecha(c.createdAt),
    creadoPor: c.creadoPor?.nombre ?? ''
  })));

  // ── PEDIDOS ───────────────────────────────────────────────────────────────
  agregarHoja(wb, 'PEDIDOS', [
    { header: 'N° orden', key: 'numero', width: 12 },
    { header: 'N° local', key: 'numeroLocal', width: 20 },
    { header: 'Código cliente', key: 'clienteCodigo', width: 14 },
    { header: 'Cliente', key: 'cliente', width: 28 },
    { header: 'Teléfono', key: 'telefono', width: 16 },
    { header: 'Estado', key: 'estado', width: 14 },
    { header: 'Prendas', key: 'prendas', width: 10 },
    colMoneda('Total prendas', 'total'),
    colMoneda('Deuda anterior', 'deudaConsolidada'),
    colMoneda('Total a pagar', 'totalAPagar'),
    colMoneda('Abonado', 'pagado'),
    colMoneda('Saldo', 'saldo'),
    { header: 'Encargado de entregar', key: 'encargado', width: 24 },
    { header: 'Empleado', key: 'empleado', width: 20 },
    colFecha('Creado', 'createdAt'),
    colFecha('Fecha entrega', 'fechaEntrega'),
    { header: 'Notas', key: 'notas', width: 30 }
  ], pedidos.map((p) => {
    const pagado = sumaPagos(p);
    const total = num(p.total) ?? 0;
    const deuda = num(p.deudaConsolidada) ?? 0;
    return {
      numero: p.numero,
      numeroLocal: p.numeroLocal ?? '',
      clienteCodigo: p.cliente?.identificador ?? '',
      cliente: p.cliente?.nombre ?? '',
      telefono: p.cliente?.telefono ?? '',
      estado: p.estado,
      prendas: p.items.reduce((a, it) => a + it.cantidad, 0),
      total,
      deudaConsolidada: deuda,
      totalAPagar: total + deuda,
      pagado,
      saldo: pendienteDePedido(p, pagado),
      encargado: p.encargadoEntrega ?? '',
      empleado: p.usuario?.nombre ?? '',
      createdAt: fecha(p.createdAt),
      fechaEntrega: fecha(p.fechaEntrega),
      notas: p.notas ?? ''
    };
  }));

  // ── PRENDAS / ITEMS ───────────────────────────────────────────────────────
  const filasItems = [];
  for (const p of pedidos) {
    for (const it of p.items) {
      filasItems.push({
        numero: p.numero,
        cliente: p.cliente?.nombre ?? '',
        prenda: it.nombre ?? it.servicio?.nombre ?? '',
        codigo: it.servicio?.codigo ?? '',
        marca: it.marcaNombre ?? it.marcaCodigo ?? '',
        cantidad: it.cantidad,
        precio: num(it.precio),
        subtotal: num(it.subtotal),
        colorActual: it.colorActual ?? '',
        colorDeseado: it.colorDeseado ?? '',
        observaciones: it.observaciones ?? '',
        createdAt: fecha(p.createdAt)
      });
    }
  }
  agregarHoja(wb, 'PRENDAS', [
    { header: 'N° orden', key: 'numero', width: 12 },
    { header: 'Cliente', key: 'cliente', width: 28 },
    { header: 'Prenda', key: 'prenda', width: 26 },
    { header: 'Código servicio', key: 'codigo', width: 14 },
    { header: 'Marca', key: 'marca', width: 18 },
    { header: 'Cantidad', key: 'cantidad', width: 10 },
    colMoneda('Precio unitario', 'precio'),
    colMoneda('Subtotal', 'subtotal'),
    { header: 'Color actual', key: 'colorActual', width: 16 },
    { header: 'Color deseado', key: 'colorDeseado', width: 16 },
    { header: 'Observaciones', key: 'observaciones', width: 32 },
    colFecha('Fecha orden', 'createdAt')
  ], filasItems);

  // ── PAGOS ─────────────────────────────────────────────────────────────────
  agregarHoja(wb, 'PAGOS', [
    colFecha('Fecha', 'createdAt'),
    { header: 'N° orden', key: 'numero', width: 12 },
    { header: 'Código cliente', key: 'clienteCodigo', width: 14 },
    { header: 'Cliente', key: 'cliente', width: 28 },
    colMoneda('Monto', 'monto'),
    { header: 'Método', key: 'metodo', width: 16 },
    { header: 'Cobrado por', key: 'usuario', width: 20 },
    { header: 'Sesión de caja', key: 'cajaSesionId', width: 38 }
  ], pagosExportados.map((p) => ({
    createdAt: fecha(p.createdAt),
    numero: p.pedido?.numero ?? p.pedido?.numeroLocal ?? '',
    clienteCodigo: p.pedido?.cliente?.identificador ?? '',
    cliente: p.pedido?.cliente?.nombre ?? '',
    monto: num(p.monto),
    metodo: p.metodo,
    usuario: p.usuario?.nombre ?? '',
    cajaSesionId: p.cajaSesionId ?? ''
  })));

  // ── GASTOS ────────────────────────────────────────────────────────────────
  agregarHoja(wb, 'GASTOS', [
    colFecha('Fecha', 'fecha'),
    { header: 'Concepto', key: 'concepto', width: 30 },
    { header: 'Categoría', key: 'categoria', width: 18 },
    colMoneda('Valor', 'valor'),
    { header: 'Método de pago', key: 'metodoPago', width: 16 },
    { header: 'Descripción', key: 'descripcion', width: 34 },
    { header: 'Registrado por', key: 'creadoPor', width: 20 },
    { header: 'Sesión de caja', key: 'cajaSesionId', width: 38 }
  ], gastos.map((g) => ({
    fecha: fecha(g.fecha),
    concepto: g.concepto,
    categoria: g.categoria,
    valor: num(g.valor),
    metodoPago: g.metodoPago ?? 'EFECTIVO',
    descripcion: g.descripcion ?? '',
    creadoPor: g.creadoPor?.nombre ?? '',
    cajaSesionId: g.cajaSesionId ?? ''
  })));

  // ── CAJAS / CIERRES ───────────────────────────────────────────────────────
  agregarHoja(wb, 'CAJAS', [
    { header: 'Empleado', key: 'usuario', width: 22 },
    { header: 'Estado', key: 'estado', width: 12 },
    colFecha('Apertura', 'fechaApertura'),
    colFecha('Cierre', 'fechaCierre'),
    colMoneda('Base inicial', 'montoBase'),
    colMoneda('Efectivo', 'totalEfectivo'),
    colMoneda('Nequi', 'totalNequi'),
    colMoneda('Daviplata', 'totalDaviplata'),
    colMoneda('Transferencia', 'totalTransferencia'),
    colMoneda('Tarjeta', 'totalTarjeta'),
    colMoneda('Otros', 'totalOtro'),
    colMoneda('Total recibido', 'totalRecibido'),
    colMoneda('Gastos', 'totalGastos'),
    colMoneda('Gastos efectivo', 'totalGastosEfectivo'),
    colMoneda('Efectivo esperado', 'efectivoEsperado'),
    colMoneda('Efectivo contado', 'efectivoContado'),
    colMoneda('Diferencia', 'diferencia'),
    { header: 'Resultado', key: 'resultado', width: 22 },
    { header: 'Observación cierre', key: 'observacionCierre', width: 30 },
    { header: 'Sesión', key: 'id', width: 38 }
  ], cajas.map((c) => {
    const dif = num(c.diferencia);
    return {
      usuario: c.usuario?.nombre ?? '',
      estado: c.estado,
      fechaApertura: fecha(c.fechaApertura),
      fechaCierre: fecha(c.fechaCierre),
      montoBase: num(c.montoBase),
      totalEfectivo: num(c.totalEfectivo),
      totalNequi: num(c.totalNequi),
      totalDaviplata: num(c.totalDaviplata),
      totalTransferencia: num(c.totalTransferencia),
      totalTarjeta: num(c.totalTarjeta),
      totalOtro: num(c.totalOtro),
      totalRecibido: num(c.totalRecibido),
      totalGastos: num(c.totalGastos),
      totalGastosEfectivo: num(c.totalGastosEfectivo),
      efectivoEsperado: num(c.efectivoEsperado),
      efectivoContado: num(c.efectivoContado),
      diferencia: dif,
      resultado: dif == null ? '' : (Math.abs(dif) < 0.01 ? 'Cuadrada' : dif < 0 ? 'Debiendo' : 'De más'),
      observacionCierre: c.observacionCierre ?? '',
      id: c.id
    };
  }));

  // ── MARCAS ────────────────────────────────────────────────────────────────
  agregarHoja(wb, 'MARCAS', [
    { header: 'Nombre', key: 'nombre', width: 26 },
    { header: 'Código', key: 'codigo', width: 14 },
    { header: 'Activo', key: 'activo', width: 10 },
    colFecha('Creado', 'createdAt')
  ], marcas.map((m) => ({
    nombre: m.nombre,
    codigo: m.codigo ?? '',
    activo: m.activo ? 'Sí' : 'No',
    createdAt: fecha(m.createdAt)
  })));

  // ── SERVICIOS ─────────────────────────────────────────────────────────────
  agregarHoja(wb, 'SERVICIOS', [
    { header: 'Nombre', key: 'nombre', width: 30 },
    { header: 'Código', key: 'codigo', width: 14 },
    { header: 'Categoría', key: 'categoria', width: 18 },
    colMoneda('Precio', 'precio'),
    { header: 'Activo', key: 'activo', width: 10 },
    { header: 'Descripción', key: 'descripcion', width: 34 },
    colFecha('Creado', 'createdAt')
  ], servicios.map((s) => ({
    nombre: s.nombre,
    codigo: s.codigo ?? '',
    categoria: s.categoria ?? '',
    precio: num(s.precio),
    activo: s.activo ? 'Sí' : 'No',
    descripcion: s.descripcion ?? '',
    createdAt: fecha(s.createdAt)
  })));

  // ── USUARIOS (sin contraseñas ni tokens) ──────────────────────────────────
  agregarHoja(wb, 'USUARIOS', [
    { header: 'Nombre', key: 'nombre', width: 26 },
    { header: 'Email', key: 'email', width: 30 },
    { header: 'Rol', key: 'rol', width: 14 },
    { header: 'Activo', key: 'activo', width: 10 },
    colFecha('Creado', 'createdAt')
  ], usuarios.map((u) => ({
    nombre: u.nombre,
    email: u.email,
    rol: u.rol,
    activo: u.activo ? 'Sí' : 'No',
    createdAt: fecha(u.createdAt)
  })));

  // ── GARANTÍAS ─────────────────────────────────────────────────────────────
  agregarHoja(wb, 'GARANTIAS', [
    colFecha('Fecha', 'createdAt'),
    { header: 'N° orden', key: 'numero', width: 12 },
    { header: 'Cliente', key: 'cliente', width: 28 },
    { header: 'Estado', key: 'estado', width: 16 },
    { header: 'Descripción', key: 'descripcion', width: 44 },
    { header: 'Registrada por', key: 'usuario', width: 20 }
  ], garantias.map((g) => ({
    createdAt: fecha(g.createdAt),
    numero: g.pedido?.numero ?? '',
    cliente: g.pedido?.cliente?.nombre ?? '',
    estado: g.estado,
    descripcion: g.descripcion ?? '',
    usuario: g.usuario?.nombre ?? ''
  })));

  // ── CONSOLIDACIONES DE DEUDA ──────────────────────────────────────────────
  agregarHoja(wb, 'CONSOLIDACIONES', [
    colFecha('Fecha', 'createdAt'),
    { header: 'Factura origen', key: 'origen', width: 16 },
    { header: 'Factura destino', key: 'destino', width: 16 },
    colMoneda('Monto consolidado', 'monto'),
    { header: 'Motivo', key: 'motivo', width: 40 },
    { header: 'Realizada por', key: 'usuario', width: 20 },
    { header: 'Revertida', key: 'revertida', width: 12 }
  ], consolidaciones.map((c) => ({
    createdAt: fecha(c.createdAt),
    origen: c.pedidoOrigen?.numero ?? c.pedidoOrigen?.numeroLocal ?? '',
    destino: c.pedidoDestino?.numero ?? c.pedidoDestino?.numeroLocal ?? '',
    monto: num(c.montoConsolidado),
    motivo: c.motivo ?? '',
    usuario: c.usuario?.nombre ?? '',
    revertida: c.revertidoEn ? 'Sí' : 'No'
  })));

  const sufijo = todos
    ? 'completo'
    : `${req.query.desde ?? 'inicio'}_a_${req.query.hasta ?? 'hoy'}`;
  const nombreArchivo = `LavaSuit_export_${sufijo}.xlsx`;

  const buffer = await wb.xlsx.writeBuffer();

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
  res.setHeader('X-Nombre-Archivo', nombreArchivo);
  res.send(Buffer.from(buffer));
});
