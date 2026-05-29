const router = require('express').Router();
const multer = require('multer');
const ctrl   = require('../controllers/servicios.controller');
const importCtrl = require('../controllers/importacion.controller');
const auth   = require('../middlewares/auth.middleware');
const rol    = require('../middlewares/rol.middleware');

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 }
});

router.use(auth);

// Endpoints específicos antes de los dinámicos para evitar colisión con /:id.
router.get('/autocomplete',     ctrl.autocomplete);
router.get('/plantilla-excel',  rol('ADMIN'), importCtrl.plantillaPrendas);
router.post('/importar-excel',  rol('ADMIN'), upload.single('archivo'), importCtrl.importarPrendas);

router.get('/',       ctrl.listar);
router.post('/',      ctrl.crear);
router.patch('/:id',  ctrl.actualizar);
router.put('/:id',    ctrl.actualizarPut);
router.delete('/:id', ctrl.desactivar);

module.exports = router;
