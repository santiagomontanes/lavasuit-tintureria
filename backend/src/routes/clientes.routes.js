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

// #Rutas M2M: gestión de asignaciones por cliente (ADMIN). Antes de PUT/DELETE '/:id'.
router.get('/:id/asignaciones',               ctrl.listarAsignaciones);
router.post('/:id/asignaciones',              rol('ADMIN'), ctrl.agregarAsignaciones);
router.put('/:id/asignaciones',               rol('ADMIN'), ctrl.reemplazarAsignaciones);
router.delete('/:id/asignaciones/:usuarioId', rol('ADMIN'), ctrl.quitarAsignacion);

router.get('/:id/deuda', ctrl.deuda);
router.get('/:id/facturas', ctrl.facturas);

/* Cambio del número/identificador visible del cliente. Endpoint aparte de
 * PUT '/:id' a propósito: exige ADMIN + motivo y deja auditoría. El PUT normal
 * NO puede tocar el identificador (el schema `actualizar` no lo acepta y zod
 * descarta las claves desconocidas). */
router.patch('/:id/identificador', rol('ADMIN'), ctrl.cambiarIdentificador);
router.get('/:id/identificador-historial', ctrl.historialIdentificador);
router.get('/:id',    ctrl.obtener);
router.post('/',      validate({ body: schemas.crear }),      ctrl.crear);
router.put('/:id',    validate({ body: schemas.actualizar }), ctrl.actualizar);
router.delete('/:id', ctrl.desactivar);

module.exports = router;
