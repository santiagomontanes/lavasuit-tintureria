const { z } = require('zod');

const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const id = z.string().regex(uuidRegex, 'ID invalido');

const emptyToUndefined = (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

const syncMeta = {
  clientMutationId: z.string().trim().min(1).max(80).optional(),
  deviceId: z.string().trim().min(1).max(80).optional(),
  createdOfflineAt: z.preprocess(
    (v) => (v === '' || v == null ? undefined : v),
    z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'createdOfflineAt invalido').optional()
  )
};

const crear = z.object({
  pedidoId: id,
  pedidoItemId: z.preprocess(emptyToUndefined, id.optional()),
  descripcion: z.string().trim().min(1, 'Descripcion obligatoria').max(3000),
  foto: z.string().trim().min(1, 'Foto obligatoria'),
  ...syncMeta
});

const listar = z.object({
  estado: z.enum(['ABIERTA', 'EN_REVISION', 'RESUELTA', 'RECHAZADA']).optional(),
  pedidoId: z.preprocess(emptyToUndefined, id.optional()),
  usuarioId: z.preprocess(emptyToUndefined, id.optional()),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50)
});

const pedidoParams = z.object({ pedidoId: id });
const idParams = z.object({ id });

const actualizarEstado = z.object({
  estado: z.enum(['ABIERTA', 'EN_REVISION', 'RESUELTA', 'RECHAZADA'], {
    message: 'Estado de garantia invalido'
  })
});

module.exports = { crear, listar, pedidoParams, idParams, actualizarEstado };
