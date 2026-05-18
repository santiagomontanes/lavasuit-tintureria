const router   = require('express').Router();
const ctrl     = require('../controllers/pagos.controller');
const auth     = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');
const schemas  = require('../schemas/pagos.schema');

router.use(auth);

router.post('/',                  validate({ body: schemas.crear }), ctrl.crear);
router.get('/pedido/:pedidoId',                                       ctrl.listarPorPedido);

module.exports = router;
