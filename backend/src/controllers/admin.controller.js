const prisma = require('../lib/prisma');
const asyncHandler = require('../utils/asyncHandler');
const { HttpError } = require('../middlewares/error.middleware');
const ioBus = require('../lib/io');
const { generarBackup } = require('../lib/backup');

/* Frase de confirmación fuerte exigida para restablecer la operación. */
const RESET_FRASE = 'RESTABLECER OPERACION';

const CONFIG_ID = 'singleton';

/* Lo ÚNICO que sobrevive a un restablecimiento.
 *   · Catálogos y personas: clientes, prendas (servicios), marcas, colores y
 *     usuarios — son los datos maestros del negocio.
 *   · Configuración de empresa: logo, políticas, teléfonos y clave de caja.
 *     Es trabajo de configuración, no operación; borrarla obligaría a volver a
 *     subir el logo y reescribirlo todo.
 * TODO lo demás se borra, incluidas las rutas (asignaciones cliente↔empleado). */
const CONSERVADO = [
  'cliente', 'servicio', 'marca', 'color', 'usuario',
  'configuracionEmpresa', 'configuracionAuditoria'
];

/* Conteo de TODAS las tablas que el reset vacía (verificación antes/después). */
const contarOperativas = async () => {
  const [
    pedido, pedidoItem, pago, garantia, pedidoEstadoHistorial, pedidoEdicionHistorial,
    evidenciaEntrega, consolidacionDeuda, cajaCierre, cajaSesion, sesionTrabajo,
    gasto, gastoAuditoria, syncOperation, clienteEmpleadoRuta,
    clienteIdentificadorHistorial, clientesConAsignacion
  ] = await Promise.all([
    prisma.pedido.count(), prisma.pedidoItem.count(), prisma.pago.count(),
    prisma.garantia.count(), prisma.pedidoEstadoHistorial.count(),
    prisma.pedidoEdicionHistorial.count(), prisma.evidenciaEntrega.count(),
    prisma.consolidacionDeuda.count(), prisma.cajaCierre.count(),
    prisma.cajaSesion.count(), prisma.sesionTrabajo.count(),
    prisma.gasto.count(),
    // Tablas que pueden no existir si el cliente Prisma no se regeneró todavía.
    prisma.gastoAuditoria ? prisma.gastoAuditoria.count() : Promise.resolve(0),
    prisma.syncOperation.count(),
    prisma.clienteEmpleadoRuta.count(),
    prisma.clienteIdentificadorHistorial ? prisma.clienteIdentificadorHistorial.count() : Promise.resolve(0),
    prisma.cliente.count({ where: { asignadoAId: { not: null } } })
  ]);
  return {
    pedido, pedidoItem, pago, garantia, pedidoEstadoHistorial, pedidoEdicionHistorial,
    evidenciaEntrega, consolidacionDeuda, cajaCierre, cajaSesion, sesionTrabajo,
    gasto, gastoAuditoria, syncOperation, clienteEmpleadoRuta,
    clienteIdentificadorHistorial, clientesConAsignacion
  };
};

/* Conteo de lo que NO se debe tocar. Se compara antes/después para demostrar
 * que el reset no se llevó por delante ningún dato maestro. */
const contarConservadas = async () => {
  const [cliente, servicio, marca, color, usuario] = await Promise.all([
    prisma.cliente.count(), prisma.servicio.count(), prisma.marca.count(),
    prisma.color.count(), prisma.usuario.count()
  ]);
  return { cliente, servicio, marca, color, usuario };
};

/* POST /api/admin/reset-operacion — solo ADMIN.
 *
 * Borra TODA la información operativa y CONSERVA los datos maestros. Exige
 * frase de confirmación y genera un backup previo OBLIGATORIO.
 *
 * ALCANCE COMPLETO (servidor + dispositivos): al terminar se sella
 * `ConfiguracionEmpresa.operacionResetAt`. Cada celular y el escritorio leen esa
 * marca al sincronizar y, si es más nueva que la última que aplicaron, borran su
 * copia local y descartan su cola pendiente. Sin ese sello, un dispositivo con
 * datos viejos volvería a subir justo lo que se acaba de borrar. */
exports.resetOperacion = asyncHandler(async (req, res) => {
  if (req.user?.rol !== 'ADMIN') {
    throw new HttpError(403, 'Solo un administrador puede restablecer la operación');
  }
  const confirmacion = String(req.body?.confirmacion ?? '').trim();
  if (confirmacion !== RESET_FRASE) {
    throw new HttpError(400, `Confirmación inválida. Debes enviar exactamente "${RESET_FRASE}".`);
  }

  // 1) Backup OBLIGATORIO antes de borrar. Si falla, se cancela el reset.
  let backup;
  try {
    backup = await generarBackup({ usuarioId: req.user.id, motivo: 'pre-reset-operacion' });
  } catch (e) {
    throw new HttpError(500, `No se pudo generar el backup previo; se canceló el restablecimiento: ${e.message}`);
  }

  const antes = await contarOperativas();
  const maestrosAntes = await contarConservadas();

  /* 2) Borrado en orden hijos → padres. Las FK hacia `pedido` son RESTRICT, por
   *    eso primero se vacían sus tablas hijas. La auto-referencia
   *    `pedido.consolidadoEnPedidoId` se anula antes de borrar los pedidos. */
  const operaciones = [
    prisma.consolidacionDeuda.deleteMany(),
    prisma.evidenciaEntrega.deleteMany(),
    prisma.pedidoEdicionHistorial.deleteMany(),
    prisma.pedidoEstadoHistorial.deleteMany(),
    prisma.garantia.deleteMany(),
    prisma.pedidoItem.deleteMany(),
    prisma.pago.deleteMany(),
    prisma.$executeRawUnsafe('UPDATE Pedido SET consolidadoEnPedidoId = NULL'),
    prisma.pedido.deleteMany(),
    prisma.cajaCierre.deleteMany(),
    prisma.cajaSesion.deleteMany(),
    prisma.sesionTrabajo.deleteMany(),
    prisma.gasto.deleteMany(),
    prisma.syncOperation.deleteMany(),
    // Rutas: se borran las asignaciones cliente↔empleado (los clientes y los
    // usuarios se conservan; lo que desaparece es el vínculo y su orden).
    prisma.clienteEmpleadoRuta.deleteMany(),
    prisma.cliente.updateMany({ where: { asignadoAId: { not: null } }, data: { asignadoAId: null } })
  ];
  // Auditorías cuyo modelo puede faltar si el cliente Prisma no se regeneró.
  if (prisma.gastoAuditoria) operaciones.splice(13, 0, prisma.gastoAuditoria.deleteMany());
  if (prisma.clienteIdentificadorHistorial) operaciones.push(prisma.clienteIdentificadorHistorial.deleteMany());

  await prisma.$transaction(operaciones);

  /* 3) Reiniciar AUTO_INCREMENT de la tabla operativa que lo usa (Pedido.numero)
   *    para que los consecutivos vuelvan a empezar en 1.
   *    DDL: fuera de la transacción (auto-commit). No es crítico si falla. */
  try {
    await prisma.$executeRawUnsafe('ALTER TABLE Pedido AUTO_INCREMENT = 1');
  } catch (e) {
    console.warn('[admin.resetOperacion] no se pudo reiniciar AUTO_INCREMENT de Pedido:', e.message);
  }

  /* 4) SELLO del reset: lo que hace que el borrado llegue a los celulares y al
   *    escritorio. Se guarda al final, cuando el servidor ya quedó limpio. */
  const resetAt = new Date();
  await prisma.configuracionEmpresa.upsert({
    where:  { id: CONFIG_ID },
    update: { operacionResetAt: resetAt },
    create: { id: CONFIG_ID, operacionResetAt: resetAt }
  });

  const despues = await contarOperativas();
  const maestrosDespues = await contarConservadas();

  console.log('[admin.resetOperacion] operación restablecida', {
    usuarioId: req.user.id, backup: backup?.archivo, resetAt: resetAt.toISOString(),
    antes, despues, maestrosAntes, maestrosDespues
  });

  // Los clientes conectados se enteran al instante; los que no, al sincronizar.
  ioBus.emit('operacion-restablecida', {
    usuarioId: req.user.id,
    at: resetAt.toISOString(),
    operacionResetAt: resetAt.toISOString()
  });

  res.json({
    ok: true,
    mensaje: 'Operación restablecida. Datos maestros conservados. Los celulares y el escritorio borrarán su copia local al sincronizar.',
    backup,                 // archivo de respaldo generado antes de borrar
    operacionResetAt: resetAt.toISOString(),
    antes,                  // conteos antes del borrado
    despues,                // conteos después (deben ser 0)
    maestros: { antes: maestrosAntes, despues: maestrosDespues },
    conservado: CONSERVADO
  });
});
