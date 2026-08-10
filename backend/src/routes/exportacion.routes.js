const router = require('express').Router();
const ctrl   = require('../controllers/exportacion.controller');
const auth   = require('../middlewares/auth.middleware');
const rol    = require('../middlewares/rol.middleware');

router.use(auth);

/* Solo ADMIN: el archivo contiene la operación completa del negocio.
 * Es de solo lectura — no modifica ningún dato. */
router.get('/excel', rol('ADMIN'), ctrl.excel);

/* Exportación de clientes. Cualquier usuario autenticado puede sacarla: es la
 * misma información que ya ve en la pantalla de Clientes. */
router.get('/clientes', ctrl.clientes);

module.exports = router;
