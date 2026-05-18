const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const asyncHandler = require('../utils/asyncHandler');
const { HttpError } = require('../middlewares/error.middleware');

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const usuario = await prisma.usuario.findUnique({ where: { email } });
  if (!usuario || !usuario.activo) throw new HttpError(401, 'Credenciales incorrectas');

  const ok = await bcrypt.compare(password, usuario.password);
  if (!ok) throw new HttpError(401, 'Credenciales incorrectas');

  const token = jwt.sign(
    { id: usuario.id, rol: usuario.rol, nombre: usuario.nombre },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

  res.json({
    token,
    usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol }
  });
});

exports.registro = asyncHandler(async (req, res) => {
  const { nombre, email, password, rol } = req.body;
  const existe = await prisma.usuario.findUnique({ where: { email } });
  if (existe) throw new HttpError(409, 'Email ya registrado');

  const hash = await bcrypt.hash(password, 10);
  const usuario = await prisma.usuario.create({
    data:   { nombre, email, password: hash, rol: rol || 'EMPLEADO' },
    select: { id: true, nombre: true, email: true, rol: true }
  });
  res.status(201).json(usuario);
});

exports.me = asyncHandler(async (req, res) => {
  const usuario = await prisma.usuario.findUnique({
    where:  { id: req.user.id },
    select: { id: true, nombre: true, email: true, rol: true, createdAt: true }
  });
  if (!usuario) throw new HttpError(404, 'No encontrado');
  res.json(usuario);
});

exports.cambiarPassword = asyncHandler(async (req, res) => {
  const { passwordActual, passwordNuevo } = req.body;
  const usuario = await prisma.usuario.findUnique({ where: { id: req.user.id } });
  if (!usuario) throw new HttpError(404, 'Usuario no encontrado');

  const ok = await bcrypt.compare(passwordActual, usuario.password);
  if (!ok) throw new HttpError(401, 'Contraseña actual incorrecta');

  const hash = await bcrypt.hash(passwordNuevo, 10);
  await prisma.usuario.update({ where: { id: req.user.id }, data: { password: hash } });
  res.json({ mensaje: 'Contraseña actualizada' });
});
