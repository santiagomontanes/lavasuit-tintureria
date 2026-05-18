const { z } = require('zod');

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const emailOpcional = z.preprocess(
  (v) => (v == null || (typeof v === 'string' && v.trim() === '') ? undefined : v),
  z.string().trim().max(150).regex(emailRegex, 'Email invalido').optional()
);

const textoOpcional = (max) => z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.string().trim().max(max).optional()
);

const syncMeta = {
  clientMutationId: z.string().trim().min(1).max(80).optional(),
  deviceId:         z.string().trim().min(1).max(80).optional(),
  createdOfflineAt: z.preprocess(
    (v) => (v === '' || v == null ? undefined : v),
    z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'createdOfflineAt invalido').optional()
  )
};

const crear = z.object({
  nombre:    z.string().trim().min(1, 'Nombre requerido').max(100),
  telefono:  z.string().trim().min(6, 'Telefono invalido').max(20),
  email:     emailOpcional,
  direccion: textoOpcional(255),
  notas:     textoOpcional(2000),
  ...syncMeta
});

const actualizar = z.object({
  nombre:    z.string().trim().min(1).max(100).optional(),
  telefono:  z.string().trim().min(6).max(20).optional(),
  email:     emailOpcional,
  direccion: textoOpcional(255),
  notas:     textoOpcional(2000),
  activo:    z.boolean().optional()
});

/* Importación de Excel desde desktop.
 * El schema es permisivo a propósito: el controlador clasifica cada fila
 * (nuevo / actualizado / duplicado / error) y devuelve un resumen. */
const importarExcel = z.object({
  filas: z.array(
    z.object({
      identificador_cliente: z.any().optional(),
      nombre_cliente:        z.any().optional(),
      numero_celular:        z.any().optional(),
      direccion:             z.any().optional(),
      orden:                 z.any().optional()
    }).passthrough()
  ).min(1, 'No hay filas para importar').max(5000, 'Máximo 5000 filas por importación')
});

/* Asignación de clientes a un empleado: por lista de ids o por rango ordenBase. */
const asignar = z.object({
  usuarioId:  z.string().trim().min(1, 'usuarioId requerido'),
  clienteIds: z.array(z.string().trim().min(1)).optional(),
  desde:      z.preprocess((v) => (v === '' || v == null ? undefined : Number(v)), z.number().int().optional()),
  hasta:      z.preprocess((v) => (v === '' || v == null ? undefined : Number(v)), z.number().int().optional())
}).refine(
  (d) => (Array.isArray(d.clienteIds) && d.clienteIds.length > 0) || (d.desde != null && d.hasta != null),
  { message: 'Debe enviar clienteIds o un rango desde/hasta' }
);

/* Creación de un cliente dentro de la ruta, entre dos clientes existentes.
 * `ordenBaseRef` es el consecutivo base del cliente DESPUÉS del cual se inserta. */
const crearEnRuta = z.object({
  nombre:       z.string().trim().min(1, 'Nombre requerido').max(100),
  telefono:     z.string().trim().min(6, 'Telefono invalido').max(20),
  email:        emailOpcional,
  direccion:    textoOpcional(255),
  notas:        textoOpcional(2000),
  ordenBaseRef: z.preprocess((v) => Number(v), z.number({ message: 'ordenBaseRef invalido' }).int('ordenBaseRef invalido')),
  ...syncMeta
});

module.exports = { crear, actualizar, importarExcel, asignar, crearEnRuta };
