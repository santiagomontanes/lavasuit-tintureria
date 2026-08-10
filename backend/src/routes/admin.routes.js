const router = require('express').Router();
const ctrl   = require('../controllers/admin.controller');
const auth   = require('../middlewares/auth.middleware');
const rol    = require('../middlewares/rol.middleware');

router.use(auth);

router.post('/reset-operacion', rol('ADMIN'), ctrl.resetOperacion);

module.exports = router;
