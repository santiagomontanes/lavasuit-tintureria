const router = require('express').Router();
const ctrl   = require('../controllers/backups.controller');
const auth   = require('../middlewares/auth.middleware');
const rol    = require('../middlewares/rol.middleware');

router.use(auth);

router.get('/',         rol('ADMIN'), ctrl.listar);
router.post('/generar', rol('ADMIN'), ctrl.generar);

// ── Copias en Google Drive (mismo sistema que el proyecto de referencia) ──
router.get('/drive/estado',   rol('ADMIN'), ctrl.driveEstado);
router.get('/drive',          rol('ADMIN'), ctrl.driveListar);
router.post('/drive/conectar', rol('ADMIN'), ctrl.driveConectar);
router.post('/drive/subir',    rol('ADMIN'), ctrl.driveSubir);

module.exports = router;
