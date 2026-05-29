const bcrypt       = require('bcryptjs');
const router       = require('express').Router();
const prisma       = require('../lib/prisma');
const auth         = require('../middlewares/auth.middleware');
const rol          = require('../middlewares/rol.middleware');
const asyncHandler = require('../utils/asyncHandler');
const { HttpError } = require('../middlewares/error.middleware');

const ROLES_VALIDOS = ['ADMIN', 'EMPLEADO', 'CAJERO', 'RECOLECTOR'];
const SELECT_USUARIO = {
  id: true,
  nombre: true,
  email: true,
  rol: true,
  activo: true,
  createdAt: true,
  updatedAt: true
};

const validarEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s ?? '').trim());

const normalizarRol = (rol) => String(rol ?? 'EMPLEADO').trim().toUpperCase();

async function validarCambioNoDejaSinAdmins(id, data) {
  const cambiaActivo = Object.prototype.hasOwnProperty.call(data, 'activo');
  const cambiaRol    = Object.prototype.hasOwnProperty.call(data, 'rol');
  if (!cambiaActivo && !cambiaRol) return;

  const actual = await prisma.usuario.findUnique({
    where: { id },
    select: { id: true, rol: true, activo: true }
  });
  if (!actual) throw new HttpError(404, 'Usuario no encontrado');
  if (actual.rol !== 'ADMIN' || actual.activo !== true) return;

  const quedaAdminActivo =
    (cambiaActivo ? data.activo === true : actual.activo === true) &&
    (cambiaRol ? data.rol === 'ADMIN' : actual.rol === 'ADMIN');
  if (quedaAdminActivo) return;

  const otrosAdmins = await prisma.usuario.count({
    where: { id: { not: id }, rol: 'ADMIN', activo: true }
  });
  if (otrosAdmins === 0) {
    throw new HttpError(400, 'No se puede dejar el sistema sin administradores activos');
  }
}

router.use(auth);
router.use(rol('ADMIN'));

router.get('/',
  asyncHandler(async (req, res) => {
    const usuarios = await prisma.usuario.findMany({
      select: SELECT_USUARIO,
      orderBy: [{ activo: 'desc' }, { nombre: 'asc' }]
    });
    res.json(usuarios);
  })
);

router.post('/',
  asyncHandler(async (req, res) => {
    const nombre   = String(req.body?.nombre ?? '').trim();
    const email    = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    const rolNuevo = normalizarRol(req.body?.rol);
    const activo   = req.body?.activo !== false;

    if (!nombre)                           throw new HttpError(400, 'Nombre requerido');
    if (!validarEmail(email))              throw new HttpError(400, 'Email invalido');
    if (password.length < 8)               throw new HttpError(400, 'Contrasena minima 8 caracteres');
    if (!ROLES_VALIDOS.includes(rolNuevo)) throw new HttpError(400, `Rol invalido (validos: ${ROLES_VALIDOS.join(', ')})`);

    const existe = await prisma.usuario.findUnique({ where: { email }, select: { id: true } });
    if (existe) throw new HttpError(409, 'Email ya registrado');

    const hash = await bcrypt.hash(password, 10);
    const usuario = await prisma.usuario.create({
      data: { nombre, email, password: hash, rol: rolNuevo, activo },
      select: SELECT_USUARIO
    });
    res.status(201).json(usuario);
  })
);

router.patch('/:id',
  asyncHandler(async (req, res) => {
    const data = {};

    if (Object.prototype.hasOwnProperty.call(req.body, 'nombre')) {
      const nombre = String(req.body.nombre ?? '').trim();
      if (!nombre) throw new HttpError(400, 'Nombre requerido');
      data.nombre = nombre;
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'email')) {
      const email = String(req.body.email ?? '').trim().toLowerCase();
      if (!validarEmail(email)) throw new HttpError(400, 'Email invalido');
      data.email = email;
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'rol')) {
      const rolNuevo = normalizarRol(req.body.rol);
      if (!ROLES_VALIDOS.includes(rolNuevo)) {
        throw new HttpError(400, `Rol invalido (validos: ${ROLES_VALIDOS.join(', ')})`);
      }
      data.rol = rolNuevo;
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'activo')) {
      data.activo = req.body.activo === true || req.body.activo === 'true';
    }

    if (Object.keys(data).length === 0) throw new HttpError(400, 'No hay cambios para aplicar');
    await validarCambioNoDejaSinAdmins(req.params.id, data);

    try {
      const usuario = await prisma.usuario.update({
        where: { id: req.params.id },
        data,
        select: SELECT_USUARIO
      });
      res.json(usuario);
    } catch (e) {
      if (e?.code === 'P2025') throw new HttpError(404, 'Usuario no encontrado');
      if (e?.code === 'P2002') throw new HttpError(409, 'Email ya registrado');
      throw e;
    }
  })
);

router.patch('/:id/password',
  asyncHandler(async (req, res) => {
    const password = String(req.body?.password ?? '');
    if (password.length < 8) throw new HttpError(400, 'Contrasena minima 8 caracteres');

    try {
      const hash = await bcrypt.hash(password, 10);
      await prisma.usuario.update({
        where: { id: req.params.id },
        data: { password: hash }
      });
      res.json({ mensaje: 'Contrasena actualizada' });
    } catch (e) {
      if (e?.code === 'P2025') throw new HttpError(404, 'Usuario no encontrado');
      throw e;
    }
  })
);

router.patch('/:id/estado',
  asyncHandler(async (req, res) => {
    if (!Object.prototype.hasOwnProperty.call(req.body, 'activo')) {
      throw new HttpError(400, 'Campo activo requerido');
    }
    const data = { activo: req.body.activo === true || req.body.activo === 'true' };
    await validarCambioNoDejaSinAdmins(req.params.id, data);

    try {
      const usuario = await prisma.usuario.update({
        where: { id: req.params.id },
        data,
        select: SELECT_USUARIO
      });
      res.json(usuario);
    } catch (e) {
      if (e?.code === 'P2025') throw new HttpError(404, 'Usuario no encontrado');
      throw e;
    }
  })
);

module.exports = router;
