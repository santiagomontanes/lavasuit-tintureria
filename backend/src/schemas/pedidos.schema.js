const { z } = require('zod');

const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const id = z.string().regex(uuidRegex, 'ID invalido');

const fechaOpcional = z.preprocess(
  (v) => (v === '' || v == null ? undefined : v),
  z.string()
    .refine((s) => !Number.isNaN(Date.parse(s)), 'Fecha invalida')
    .optional()
);

const syncMeta = {
  clientMutationId: z.string().trim().min(1).max(80).optional(),
  deviceId:         z.string().trim().min(1).max(80).optional(),
  createdOfflineAt: z.preprocess(
    (v) => (v === '' || v == null ? undefined : v),
    z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'createdOfflineAt invalido').optional()
  )
};

const item = z.object({
  servicioId: id,
  nombre:     z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().max(120).optional()
  ),
  servicioNombre: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().max(120).optional()
  ),
  cantidad:   z.coerce.number().int('Cantidad debe ser entero').positive('Cantidad debe ser > 0'),
  precio:     z.coerce.number().nonnegative('Precio invalido'),
  colorActual: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().max(80).optional()
  ),
  colorDeseado: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().max(80).optional()
  ),
  observaciones: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().max(2000).optional()
  ),
  observacion: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().max(2000).optional()
  )
});

const crear = z.object({
  clienteId:    id,
  items:        z.array(item).min(1, 'Al menos un item'),
  notas:        z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().max(2000).optional()
  ),
  fechaEntrega: fechaOpcional,
  ...syncMeta
});

const actualizarEstado = z.object({
  estado: z.enum(['RECIBIDO', 'EN_PROCESO', 'LISTO', 'ENTREGADO', 'CANCELADO'], {
    message: 'Estado invalido'
  })
});

module.exports = { crear, actualizarEstado };
