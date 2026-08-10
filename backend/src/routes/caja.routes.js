const router      = require('express').Router();
const ctrl        = require('../controllers/caja.controller');
const cajaSesCtrl = require('../controllers/cajaSesion.controller');
const auth        = require('../middlewares/auth.middleware');

router.use(auth);

// ── Endpoints originales (sin cambios) ──────────────────────────────────────
router.get('/resumen',   ctrl.resumen);
router.post('/cierre',   ctrl.cierre);
router.get('/historial', ctrl.historial);

// ── Nuevos endpoints: apertura / cierre / sesiones ──────────────────────────
router.post('/abrir',    cajaSesCtrl.abrir);
router.get('/actual',    cajaSesCtrl.actual);
router.post('/cerrar',   cajaSesCtrl.cerrar);
router.get('/sesiones',  cajaSesCtrl.sesiones);
// Detalle de una sesión con SUS gastos y pagos (filtrados por cajaSesionId).
router.get('/sesiones/:id', cajaSesCtrl.detalleSesion);

module.exports = router;
