const router = require('express').Router();
const ctrl   = require('../controllers/servicios.controller');
const auth   = require('../middlewares/auth.middleware');

router.use(auth);
router.get('/',       ctrl.listar);
router.post('/',      ctrl.crear);
router.patch('/:id',  ctrl.actualizar);
router.put('/:id',    ctrl.actualizarPut);
router.delete('/:id', ctrl.desactivar);

module.exports = router;
