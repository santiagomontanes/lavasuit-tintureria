const router   = require('express').Router();
const ctrl     = require('../controllers/gastos.controller');
const auth     = require('../middlewares/auth.middleware');
const rol      = require('../middlewares/rol.middleware');
const validate = require('../middlewares/validate.middleware');
const schemas  = require('../schemas/gastos.schema');

router.use(auth);

// RECOLECTOR no administra gastos. ADMIN/EMPLEADO/CAJERO sí (la propiedad de
// cada gasto la valida el controller: no-admin sólo ve/edita los suyos).
const puedeGastos = rol('ADMIN', 'EMPLEADO', 'CAJERO');

router.get('/',       puedeGastos, ctrl.listar);
router.get('/:id',    puedeGastos, ctrl.obtener);
router.post('/',      puedeGastos, validate({ body: schemas.crear }),  ctrl.crear);
router.patch('/:id',  puedeGastos, validate({ body: schemas.editar }), ctrl.actualizar);
router.delete('/:id', puedeGastos, ctrl.eliminar);

module.exports = router;
