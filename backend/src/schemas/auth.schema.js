const { z } = require('zod');

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const emailSchema = z
  .string({ message: 'Email requerido' })
  .trim()
  .max(150, 'Email demasiado largo')
  .regex(emailRegex, 'Email inválido');

const login = z.object({
  email:    emailSchema,
  password: z.string({ message: 'Contraseña requerida' }).min(1, 'Contraseña requerida')
});

const registro = z.object({
  nombre:   z.string().trim().min(2, 'Nombre muy corto').max(100),
  email:    emailSchema,
  password: z.string().min(6, 'Contraseña mínimo 6 caracteres').max(100),
  rol:      z.enum(['ADMIN', 'EMPLEADO', 'CAJERO']).optional()
});

const cambiarPassword = z.object({
  passwordActual: z.string().min(1, 'Contraseña actual requerida'),
  passwordNuevo:  z.string().min(6, 'Contraseña nueva mínimo 6 caracteres').max(100)
});

module.exports = { login, registro, cambiarPassword };
