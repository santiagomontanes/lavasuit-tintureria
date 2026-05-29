const router = require('express').Router();
const ctrl   = require('../controllers/colores.controller');
const auth   = require('../middlewares/auth.middleware');
const rol    = require('../middlewares/rol.middleware');

router.use(auth);

// Endpoints específicos antes de los dinámicos.
router.get('/autocomplete', ctrl.autocomplete);

router.get('/',       ctrl.listar);
router.get('/:id',    ctrl.obtener);
router.post('/',      rol('ADMIN'), ctrl.crear);
router.patch('/:id',  rol('ADMIN'), ctrl.actualizar);
router.put('/:id',    rol('ADMIN'), ctrl.actualizarPut);
router.delete('/:id', rol('ADMIN'), ctrl.desactivar);

module.exports = router;
