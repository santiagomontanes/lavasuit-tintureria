const router = require('express').Router();
const ctrl   = require('../controllers/licencia.controller');

/* Estas rutas NO usan el middleware de auth: se llaman ANTES del login,
 * desde la pantalla de activación de desktop y mobile. */
router.post('/activar',   ctrl.activar);
router.post('/verificar', ctrl.verificar);

module.exports = router;
