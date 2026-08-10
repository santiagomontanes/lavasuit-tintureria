const { z } = require('zod');

const METODOS = ['EFECTIVO', 'NEQUI', 'DAVIPLATA', 'TRANSFERENCIA', 'TARJETA', 'YAPE', 'PLIN', 'OTRO'];

const syncMeta = {
  clientMutationId: z.string().trim().min(1).max(80).optional(),
  deviceId:         z.string().trim().min(1).max(80).optional(),
  createdOfflineAt: z.preprocess(
    (v) => (v === '' || v == null ? undefined : v),
    z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'createdOfflineAt invalido').optional()
  )
};

// Acepta null/undefined/"" como "sin valor" (→ undefined) para no fallar con
// payloads que envían descripcion:null desde la cola offline del móvil.
const textoOpc = (max) => z.preprocess(
  (v) => (v == null || (typeof v === 'string' && v.trim() === '') ? undefined : v),
  z.string().trim().max(max).optional()
);

const fechaOpc = z.preprocess(
  (v) => (v === '' || v == null ? undefined : v),
  z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'Fecha invalida').optional()
);

const metodoOpc = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.enum(METODOS, { message: 'Método de pago inválido' }).optional()
);

const crear = z.object({
  concepto:    z.string().trim().min(1, 'Concepto requerido').max(150),
  categoria:   z.string().trim().min(1, 'Categoría requerida').max(60),
  valor:       z.coerce.number().positive('El valor debe ser mayor a 0'),
  fecha:       fechaOpc,
  metodoPago:  metodoOpc,
  descripcion: textoOpc(2000),
  ...syncMeta
});

const editar = z.object({
  concepto:    z.string().trim().min(1).max(150).optional(),
  categoria:   z.string().trim().min(1).max(60).optional(),
  valor:       z.coerce.number().positive('El valor debe ser mayor a 0').optional(),
  fecha:       fechaOpc,
  metodoPago:  metodoOpc,
  descripcion: z.preprocess(
    (v) => (v === '' ? null : v),
    z.string().trim().max(2000).nullable().optional()
  )
});

module.exports = { crear, editar, METODOS };
