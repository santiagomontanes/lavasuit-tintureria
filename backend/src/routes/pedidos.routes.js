const fs     = require('fs');
const path   = require('path');
const multer = require('multer');
const router = require('express').Router();
const ctrl   = require('../controllers/pedidos.controller');
const auth   = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');
const schemas  = require('../schemas/pedidos.schema');
const { HttpError } = require('../middlewares/error.middleware');

const entregasDir = path.join(process.cwd(), 'public', 'uploads', 'entregas');
fs.mkdirSync(entregasDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, entregasDir),
  filename:    (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.heic'].includes(ext) ? ext : '.jpg';
    cb(null, `${Date.now()}-${Math.random().toString(16).slice(2)}${safeExt}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype?.startsWith('image/')) {
      return cb(new HttpError(400, 'La evidencia debe ser una imagen'));
    }
    cb(null, true);
  }
});

router.use(auth);

router.get('/',              ctrl.listar);
// #2 Diagnóstico READ-ONLY de posibles duplicados históricos. NO borra ni
// fusiona nada; sólo agrupa candidatos para revisión manual. Antes de '/:id'.
router.get('/diagnostico/duplicados', ctrl.detectarDuplicados);
router.get('/:id',           ctrl.obtener);
router.post('/',             validate({ body: schemas.crear }),            ctrl.crear);
router.patch('/:id/estado',  validate({ body: schemas.actualizarEstado }), ctrl.actualizarEstado);
router.patch('/:id',         validate({ body: schemas.editar }),           ctrl.editar);
router.delete('/:id',        ctrl.eliminar);
router.post('/:id/entregar', upload.single('foto'),                        ctrl.entregar);
router.get('/:id/evidencia-entrega', ctrl.obtenerEvidenciaEntrega);
router.get('/:id/historial-ediciones', ctrl.historialEdiciones);
router.post('/:id/consolidar-deuda',       ctrl.consolidarDeuda);
router.post('/:id/revertir-consolidacion', ctrl.revertirConsolidacion);

module.exports = router;
