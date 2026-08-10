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
  ),
  // Snapshot opcional de marca por item. marcaId acepta uuid; si no es uuid
  // válido (ej. id local pendiente) lo ignoramos en el preprocess para no
  // bloquear el create — el snapshot de nombre/código basta para impresión.
  marcaId: z.preprocess(
    (v) => {
      if (typeof v !== 'string') return undefined;
      const s = v.trim();
      if (!s) return undefined;
      return uuidRegex.test(s) ? s : undefined;
    },
    z.string().optional()
  ),
  marcaNombre: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().max(100).optional()
  ),
  marcaCodigo: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().max(30).optional()
  )
});

const encargadoOpcional = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.string().trim().max(120).optional()
);

const crear = z.object({
  clienteId:    id,
  items:        z.array(item).min(1, 'Al menos un item'),
  encargadoEntrega: encargadoOpcional,
  // Consolidar la deuda pendiente del cliente dentro de esta orden (punto 9).
  incluirDeudaAnterior: z.preprocess(
    (v) => (v === '' || v == null ? undefined : v),
    z.coerce.boolean().optional()
  ),
  notas:        z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().max(2000).optional()
  ),
  fechaEntrega: fechaOpcional,
  // Número de orden local generado por el cliente offline (ej. SAN-001).
  // Se almacena como referencia; el backend igual asigna `numero` oficial.
  numeroLocal:  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().max(40).optional()
  ),
  ...syncMeta
});

const actualizarEstado = z.object({
  estado: z.enum(['RECIBIDO', 'EN_PROCESO', 'LISTO', 'ENTREGADO', 'CANCELADO'], {
    message: 'Estado invalido'
  })
});

/* Item de edición: igual que `item` pero con `id` opcional. Si trae un id de
 * un PedidoItem existente, el controller lo actualiza; si no, lo crea. */
const itemEditar = item.extend({
  id: z.preprocess(
    (v) => {
      if (typeof v !== 'string') return undefined;
      const s = v.trim();
      return s && uuidRegex.test(s) ? s : undefined;
    },
    z.string().optional()
  )
});

/* Edición de pedido (admin). Reutiliza la estructura de `crear` pero todos los
 * campos generales son opcionales (solo se actualiza lo enviado) y los items
 * pueden traer id para edición incremental. No exige colores: la regla de
 * colores obligatorios vive en el frontend para no romper pedidos legacy. */
const editar = z.object({
  clienteId:    id.optional(),
  // Motivo OBLIGATORIO de la edición (auditoría).
  motivo:       z.string().trim().min(1, 'El motivo del cambio es obligatorio').max(500),
  encargadoEntrega: encargadoOpcional,
  items:        z.array(itemEditar).min(1, 'Al menos un item'),
  notas:        z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
    z.string().trim().max(2000).nullable().optional()
  ),
  fechaEntrega: z.preprocess(
    (v) => (v === '' ? null : v),
    z.union([
      z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'Fecha invalida'),
      z.null()
    ]).optional()
  ),
  // Concurrencia optimista para ediciones offline: updatedAt que tenía el
  // cliente al empezar a editar. El controller lo usa para detectar conflictos.
  baseUpdatedAt: z.string().optional(),
  // Metadata de sync (idempotencia de ediciones offline). Zod por defecto
  // descarta claves desconocidas, así que se declaran para que lleguen al
  // controller y pickSyncMeta las lea.
  clientMutationId: z.string().optional(),
  deviceId:         z.string().optional(),
  createdOfflineAt: z.string().optional()
});

module.exports = { crear, actualizarEstado, editar };
