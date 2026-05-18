const router   = require('express').Router();
const ctrl     = require('../controllers/auth.controller');
const auth     = require('../middlewares/auth.middleware');
const rol      = require('../middlewares/rol.middleware');
const validate = require('../middlewares/validate.middleware');
const schemas  = require('../schemas/auth.schema');
const { loginLimiter, registroLimiter } = require('../middlewares/rate-limit.middleware');

router.post('/login',
  loginLimiter,
  validate({ body: schemas.login }),
  ctrl.login
);

router.post('/registro',
  registroLimiter,
  auth, rol('ADMIN'),
  validate({ body: schemas.registro }),
  ctrl.registro
);

router.get('/me',
  auth,
  ctrl.me
);

router.put('/password',
  auth,
  validate({ body: schemas.cambiarPassword }),
  ctrl.cambiarPassword
);

module.exports = router;
