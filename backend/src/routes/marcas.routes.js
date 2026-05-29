const router  = require('express').Router();
const multer  = require('multer');
const ctrl    = require('../controllers/marcas.controller');
const importCtrl = require('../controllers/importacion.controller');
const auth    = require('../middlewares/auth.middleware');
const rol     = require('../middlewares/rol.middleware');

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024 }
});

router.use(auth);

router.get('/',                ctrl.listar);
router.get('/autocomplete',    ctrl.autocomplete);
router.get('/plantilla-excel', rol('ADMIN'), importCtrl.plantillaMarcas);
router.post('/importar-excel', rol('ADMIN'), upload.single('archivo'), importCtrl.importarMarcas);
router.get('/:id',           ctrl.obtener);
router.post('/',             rol('ADMIN'), ctrl.crear);
router.patch('/:id',         rol('ADMIN'), ctrl.actualizar);
router.put('/:id',           rol('ADMIN'), ctrl.actualizarPut);
router.delete('/:id',        rol('ADMIN'), ctrl.desactivar);

module.exports = router;
