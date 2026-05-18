const { z } = require('zod');
const { METODOS_PAGO_ACTIVOS, normalizarMetodoPago } = require('../lib/metodosPago');

const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const syncMeta = {
  clientMutationId: z.string().trim().min(1).max(80).optional(),
  deviceId:         z.string().trim().min(1).max(80).optional(),
  createdOfflineAt: z.preprocess(
    (v) => (v === '' || v == null ? undefined : v),
    z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'createdOfflineAt invalido').optional()
  )
};

const crear = z.object({
  pedidoId: z.string().regex(uuidRegex, 'pedidoId invalido'),
  monto:    z.coerce.number().positive('Monto debe ser > 0'),
  metodo: z.preprocess(
    (v) => normalizarMetodoPago(typeof v === 'string' ? v.trim().toUpperCase() : v),
    z.enum(METODOS_PAGO_ACTIVOS, { message: 'Metodo de pago invalido' })
  ),
  observacion: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().max(500).optional()
  ),
  ...syncMeta
});

module.exports = { crear };
