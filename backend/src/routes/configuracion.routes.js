const router   = require('express').Router();
const ctrl     = require('../controllers/configuracion.controller');
const auth     = require('../middlewares/auth.middleware');
const rol      = require('../middlewares/rol.middleware');
const validate = require('../middlewares/validate.middleware');
const schemas  = require('../schemas/configuracion.schema');

router.use(auth);

// Lectura: cualquier usuario autenticado (desktop y mobile la consumen).
router.get('/empresa', ctrl.obtener);
// Edición datos de empresa/recibo: solo ADMIN.
router.put('/empresa', rol('ADMIN'), validate({ body: schemas.actualizar }), ctrl.actualizar);

// ── Opciones Avanzadas (solo ADMIN) ──
router.post('/verificar-password', rol('ADMIN'), ctrl.verificarPassword);
router.post('/password',           rol('ADMIN'), ctrl.cambiarPassword);
router.patch('/avanzada',          rol('ADMIN'), ctrl.actualizarAvanzada);
router.get('/auditoria',           rol('ADMIN'), ctrl.auditoria);

module.exports = router;
