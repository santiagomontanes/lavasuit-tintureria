const fs = require('fs');
const path = require('path');
const multer = require('multer');
const router = require('express').Router();
const ctrl = require('../controllers/garantias.controller');
const auth = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');
const schemas = require('../schemas/garantias.schema');
const { HttpError } = require('../middlewares/error.middleware');

const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'garantias');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.heic'].includes(ext) ? ext : '.jpg';
    cb(null, `${Date.now()}-${Math.random().toString(16).slice(2)}${safeExt}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype?.startsWith('image/')) {
      return cb(new HttpError(400, 'La evidencia debe ser una imagen'));
    }
    cb(null, true);
  }
});

const requireFotoBody = (req, res, next) => {
  if (req.file?.filename) req.body.foto = req.file.filename;
  next();
};

router.use(auth);

router.get('/', validate({ query: schemas.listar }), ctrl.listar);
router.get('/pedido/:pedidoId', validate({ params: schemas.pedidoParams }), ctrl.listarPorPedido);
router.post('/', upload.single('foto'), requireFotoBody, validate({ body: schemas.crear }), ctrl.crear);
router.patch('/:id/estado', validate({ params: schemas.idParams, body: schemas.actualizarEstado }), ctrl.actualizarEstado);

module.exports = router;
