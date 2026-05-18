const router   = require('express').Router();
const ctrl     = require('../controllers/clientes.controller');
const auth     = require('../middlewares/auth.middleware');
const rol      = require('../middlewares/rol.middleware');
const validate = require('../middlewares/validate.middleware');
const schemas  = require('../schemas/clientes.schema');

router.use(auth);

// Rutas específicas ANTES de '/:id' para que no las capture el parámetro.
router.get('/',          ctrl.listar);
router.get('/asignados', ctrl.listarAsignados);

router.post('/importar-excel', rol('ADMIN'), validate({ body: schemas.importarExcel }), ctrl.importarExcel);
router.post('/asignar',        rol('ADMIN'), validate({ body: schemas.asignar }),        ctrl.asignar);
router.post('/crear-en-ruta',  validate({ body: schemas.crearEnRuta }),                  ctrl.crearEnRuta);

router.get('/:id',    ctrl.obtener);
router.post('/',      validate({ body: schemas.crear }),      ctrl.crear);
router.put('/:id',    validate({ body: schemas.actualizar }), ctrl.actualizar);
router.delete('/:id', ctrl.desactivar);

module.exports = router;
