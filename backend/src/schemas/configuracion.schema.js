const { z } = require('zod');

/* Texto opcional: cadena vacía -> null. No se hace trim para preservar saltos
 * de línea de políticas / pie de recibo. */
const textoOpcional = (max) => z.preprocess(
  (v) => (v == null || (typeof v === 'string' && v.trim() === '') ? null : v),
  z.string().max(max, `Máximo ${max} caracteres`).nullable().optional()
);

const actualizar = z.object({
  nombreNegocio:  z.string().trim().min(1, 'Nombre del negocio requerido').max(150),
  nit:            textoOpcional(40),
  telefono:       textoOpcional(40),
  // Varios números, uno por línea o separados por / , ;
  telefonosContacto: textoOpcional(300),
  direccion:      textoOpcional(255),
  ciudad:         textoOpcional(120),
  // Logo en base64 (data URI). El límite de express.json acota el tamaño real.
  logoBase64:     textoOpcional(3_000_000),
  politicasTexto: textoOpcional(4000),
  garantiaTexto:  textoOpcional(4000),
  pieRecibo:      textoOpcional(2000)
});

module.exports = { actualizar };
