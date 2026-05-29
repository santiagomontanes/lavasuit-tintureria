const prisma = require('../lib/prisma');
const asyncHandler = require('../utils/asyncHandler');
const ioBus = require('../lib/io');

/* Tabla singleton: siempre operamos sobre el mismo registro. */
const CONFIG_ID = 'singleton';

const CONFIG_DEFAULT = {
  id:             CONFIG_ID,
  nombreNegocio:  'LavaSuit',
  nit:            null,
  telefono:       null,
  direccion:      null,
  ciudad:         null,
  logoBase64:     null,
  politicasTexto: null,
  garantiaTexto:  null,
  pieRecibo:      null
};

/* GET /api/configuracion/empresa — cualquier usuario autenticado puede leer. */
exports.obtener = asyncHandler(async (req, res) => {
  const config = await prisma.configuracionEmpresa.findUnique({ where: { id: CONFIG_ID } });
  res.json(config ?? CONFIG_DEFAULT);
});

/* PUT /api/configuracion/empresa — solo ADMIN (rol verificado en la ruta). */
exports.actualizar = asyncHandler(async (req, res) => {
  const {
    nombreNegocio, nit, telefono, direccion, ciudad,
    logoBase64, politicasTexto, garantiaTexto, pieRecibo
  } = req.body;

  const data = {
    nombreNegocio: (nombreNegocio && String(nombreNegocio).trim()) || 'LavaSuit',
    nit:            nit ?? null,
    telefono:       telefono ?? null,
    direccion:      direccion ?? null,
    ciudad:         ciudad ?? null,
    logoBase64:     logoBase64 ?? null,
    politicasTexto: politicasTexto ?? null,
    garantiaTexto:  garantiaTexto ?? null,
    pieRecibo:      pieRecibo ?? null,
    actualizadoPorId: req.user?.id ?? null
  };

  const config = await prisma.configuracionEmpresa.upsert({
    where:  { id: CONFIG_ID },
    update: data,
    create: { id: CONFIG_ID, ...data }
  });

  console.log('[configuracion.actualizar] actualizada por', req.user?.id ?? '-');
  ioBus.emit('configuracion-actualizada', config);
  res.json(config);
});
