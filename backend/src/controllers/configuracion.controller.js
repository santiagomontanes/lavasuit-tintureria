const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const asyncHandler = require('../utils/asyncHandler');
const { HttpError } = require('../middlewares/error.middleware');
const ioBus = require('../lib/io');

/* Tabla singleton: siempre operamos sobre el mismo registro. */
const CONFIG_ID = 'singleton';

/* Flags de Opciones Avanzadas con su etiqueta legible (para auditoría/UI).
 * Todas por defecto en true = comportamiento actual del sistema. */
const FLAGS = {
  mostrarNombreEnRecibo:  'Mostrar nombre de la lavandería en recibos',
  descontarGastosDeCaja:  'Descontar gastos automáticamente de caja',
  exigirFotoCambioEstado: 'Exigir fotografía para cambio de estado',
  exigirFotoEntrega:      'Exigir fotografia para entrega',
  solicitarMontoRecibido: 'Solicitar monto recibido',
  mostrarDeudaConsolidadaEnFactura: 'Mostrar deuda anterior consolidada en factura',
  backupAutomaticoAlCerrarDia: 'Generar backup automático al cerrar el día'
};

const CONFIG_DEFAULT = {
  id:             CONFIG_ID,
  nombreNegocio:  'LavaSuit',
  nit:            null,
  telefono:       null,
  telefonosContacto: null,
  direccion:      null,
  ciudad:         null,
  logoBase64:     null,
  politicasTexto: null,
  garantiaTexto:  null,
  pieRecibo:      null,
  mostrarNombreEnRecibo:  true,
  descontarGastosDeCaja:  true,
  exigirFotoCambioEstado: true,
  exigirFotoEntrega:      false,
  solicitarMontoRecibido: true,
  mostrarDeudaConsolidadaEnFactura: false,
  backupAutomaticoAlCerrarDia: true,
  claveCajaOffline: null
};

/* Quita el hash y expone si la contraseña ya fue creada. NUNCA devolver el hash. */
const sanear = (config) => {
  const base = config ?? CONFIG_DEFAULT;
  const { configPasswordHash, ...rest } = base;
  return { ...rest, configPasswordSet: !!config?.configPasswordHash };
};

/* GET /api/configuracion/empresa — cualquier usuario autenticado puede leer.
 * Devuelve también los flags avanzados (desktop y mobile los aplican). */
exports.obtener = asyncHandler(async (req, res) => {
  const config = await prisma.configuracionEmpresa.findUnique({ where: { id: CONFIG_ID } });
  res.json(sanear(config));
});

/* PUT /api/configuracion/empresa — solo ADMIN (datos de empresa/recibo). No
 * toca los flags avanzados ni la contraseña (se editan por su propio endpoint). */
exports.actualizar = asyncHandler(async (req, res) => {
  const {
    nombreNegocio, nit, telefono, telefonosContacto, direccion, ciudad,
    logoBase64, politicasTexto, garantiaTexto, pieRecibo, claveCajaOffline
  } = req.body;

  const data = {
    nombreNegocio: (nombreNegocio && String(nombreNegocio).trim()) || 'LavaSuit',
    nit:            nit ?? null,
    telefono:       telefono ?? null,
    // Lista de teléfonos del bloque CONTACTO del recibo.
    telefonosContacto: telefonosContacto ?? null,
    direccion:      direccion ?? null,
    ciudad:         ciudad ?? null,
    logoBase64:     logoBase64 ?? null,
    politicasTexto: politicasTexto ?? null,
    garantiaTexto:  garantiaTexto ?? null,
    pieRecibo:      pieRecibo ?? null,
    actualizadoPorId: req.user?.id ?? null
  };
  // Clave para cerrar caja offline (punto 2). Solo se toca si viene en el body:
  // string vacío = deshabilitar; ausente = no cambiar.
  if (Object.prototype.hasOwnProperty.call(req.body, 'claveCajaOffline')) {
    const c = claveCajaOffline == null ? null : String(claveCajaOffline).trim();
    data.claveCajaOffline = c || null;
  }

  const config = await prisma.configuracionEmpresa.upsert({
    where:  { id: CONFIG_ID },
    update: data,
    create: { id: CONFIG_ID, ...data }
  });

  ioBus.emit('configuracion-actualizada', sanear(config));
  res.json(sanear(config));
});

/* POST /api/configuracion/verificar-password — ADMIN. Gate de la UI.
 * Si aún no hay contraseña creada → { ok:false, configurar:true }. */
exports.verificarPassword = asyncHandler(async (req, res) => {
  const config = await prisma.configuracionEmpresa.findUnique({ where: { id: CONFIG_ID } });
  if (!config?.configPasswordHash) return res.json({ ok: false, configurar: true });
  const ok = await bcrypt.compare(String(req.body?.password ?? ''), config.configPasswordHash);
  res.json({ ok, configurar: false });
});

/* POST /api/configuracion/password — ADMIN. Crea o cambia la contraseña de
 * Opciones Avanzadas. Si ya existe, exige la actual. Registra auditoría. */
exports.cambiarPassword = asyncHandler(async (req, res) => {
  const { passwordActual, nuevaPassword } = req.body ?? {};
  if (!nuevaPassword || String(nuevaPassword).length < 4) {
    throw new HttpError(400, 'La nueva contraseña debe tener al menos 4 caracteres');
  }
  const config = await prisma.configuracionEmpresa.findUnique({ where: { id: CONFIG_ID } });
  if (config?.configPasswordHash) {
    const ok = await bcrypt.compare(String(passwordActual ?? ''), config.configPasswordHash);
    if (!ok) throw new HttpError(401, 'Contraseña actual incorrecta');
  }
  const hash = await bcrypt.hash(String(nuevaPassword), 10);
  await prisma.$transaction(async (tx) => {
    await tx.configuracionEmpresa.upsert({
      where:  { id: CONFIG_ID },
      update: { configPasswordHash: hash, actualizadoPorId: req.user?.id ?? null },
      create: { id: CONFIG_ID, configPasswordHash: hash, actualizadoPorId: req.user?.id ?? null }
    });
    await tx.configuracionAuditoria.create({
      data: {
        usuarioId:     req.user?.id ?? null,
        campo:         'configPasswordHash',
        etiqueta:      'Contraseña de Opciones Avanzadas',
        valorAnterior: config?.configPasswordHash ? '••••' : '(sin definir)',
        valorNuevo:    '••••'
      }
    });
  });
  res.json({ ok: true, creada: !config?.configPasswordHash });
});

/* PATCH /api/configuracion/avanzada — ADMIN. Actualiza los flags avanzados.
 * Exige la contraseña de configuración (que debe existir) y audita cada cambio. */
exports.actualizarAvanzada = asyncHandler(async (req, res) => {
  const config = await prisma.configuracionEmpresa.findUnique({ where: { id: CONFIG_ID } });
  if (!config?.configPasswordHash) {
    throw new HttpError(400, 'Primero crea la contraseña de Opciones Avanzadas');
  }
  const ok = await bcrypt.compare(String(req.body?.password ?? ''), config.configPasswordHash);
  if (!ok) throw new HttpError(401, 'Contraseña de configuración incorrecta');

  const data = {};
  const cambios = [];
  for (const key of Object.keys(FLAGS)) {
    if (typeof req.body[key] === 'boolean') {
      const anterior = config[key] ?? CONFIG_DEFAULT[key] ?? true;
      data[key] = req.body[key];
      if (anterior !== req.body[key]) {
        cambios.push({
          campo:         key,
          etiqueta:      FLAGS[key],
          valorAnterior: anterior ? 'Sí' : 'No',
          valorNuevo:    req.body[key] ? 'Sí' : 'No'
        });
      }
    }
  }
  if (Object.keys(data).length === 0) throw new HttpError(400, 'No hay cambios para aplicar');
  data.actualizadoPorId = req.user?.id ?? null;

  const actualizado = await prisma.$transaction(async (tx) => {
    const c = await tx.configuracionEmpresa.update({ where: { id: CONFIG_ID }, data });
    for (const cam of cambios) {
      await tx.configuracionAuditoria.create({ data: { usuarioId: req.user?.id ?? null, ...cam } });
    }
    return c;
  });

  ioBus.emit('configuracion-actualizada', sanear(actualizado));
  res.json(sanear(actualizado));
});

/* GET /api/configuracion/auditoria — ADMIN. Historial de cambios de config. */
exports.auditoria = asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? '100'), 10) || 100, 300);
  const filas = await prisma.configuracionAuditoria.findMany({
    include: { usuario: { select: { id: true, nombre: true, rol: true } } },
    orderBy: { createdAt: 'desc' },
    take:    limit
  });
  res.json(filas.map((f) => ({
    id:            f.id,
    campo:         f.campo,
    etiqueta:      f.etiqueta,
    valorAnterior: f.valorAnterior,
    valorNuevo:    f.valorNuevo,
    usuario:       f.usuario,
    createdAt:     f.createdAt
  })));
});
