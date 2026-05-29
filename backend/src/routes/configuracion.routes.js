const router   = require('express').Router();
const ctrl     = require('../controllers/configuracion.controller');
const auth     = require('../middlewares/auth.middleware');
const rol      = require('../middlewares/rol.middleware');
const validate = require('../middlewares/validate.middleware');
const schemas  = require('../schemas/configuracion.schema');

router.use(auth);

// Lectura: cualquier usuario autenticado (desktop y mobile la consumen).
router.get('/empresa', ctrl.obtener);
// Edición: solo ADMIN.
router.put('/empresa', rol('ADMIN'), validate({ body: schemas.actualizar }), ctrl.actualizar);

module.exports = router;
