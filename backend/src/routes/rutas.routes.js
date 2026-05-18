const router   = require('express').Router();
const ctrl     = require('../controllers/rutas.controller');
const auth     = require('../middlewares/auth.middleware');
const rol      = require('../middlewares/rol.middleware');
const validate = require('../middlewares/validate.middleware');
const schemas  = require('../schemas/clientes.schema');

router.use(auth);

router.get('/',  rol('ADMIN'), ctrl.listar);
router.post('/', rol('ADMIN'), validate({ body: schemas.asignar }), ctrl.crear);

module.exports = router;
