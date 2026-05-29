const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const morgan  = require('morgan');
const path    = require('path');

const { errorHandler, notFoundHandler } = require('./middlewares/error.middleware');

const buildApp = () => {
  const app = express();

  const corsOriginRaw = (process.env.CORS_ORIGIN ?? '*').trim();
  const corsOrigin = corsOriginRaw === '*'
    ? true
    : corsOriginRaw.split(',').map((s) => s.trim()).filter(Boolean);

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: corsOrigin }));

  if (process.env.NODE_ENV !== 'test') {
    app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
  }

  // 4mb: permite enviar el logo de empresa en base64 dentro del JSON.
  app.use(express.json({ limit: '4mb' }));
  app.use(express.urlencoded({ extended: true, limit: '4mb' }));
  app.use('/uploads', express.static(path.join(process.cwd(), 'public', 'uploads')));

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', db: 'mysql', timestamp: new Date() });
  });

  // /discovery: endpoint público sin auth para que clientes (mobile/desktop)
  // verifiquen rápidamente que apuntan a un backend LavaSuit válido.
  const { discoveryPayload } = require('./lib/discovery');
  app.get('/discovery', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(discoveryPayload({ port: process.env.PORT || 3000 }));
  });

  app.use('/api/licencias', require('./routes/licencias.routes'));
  app.use('/api/auth',      require('./routes/auth.routes'));
  app.use('/api/clientes',  require('./routes/clientes.routes'));
  app.use('/api/configuracion', require('./routes/configuracion.routes'));
  app.use('/api/rutas',     require('./routes/rutas.routes'));
  app.use('/api/pedidos',   require('./routes/pedidos.routes'));
  app.use('/api/servicios', require('./routes/servicios.routes'));
  app.use('/api/marcas',    require('./routes/marcas.routes'));
  app.use('/api/colores',   require('./routes/colores.routes'));
  app.use('/api/usuarios',  require('./routes/usuarios.routes'));
  app.use('/api/empleados', require('./routes/empleados.routes'));
  app.use('/api/pagos',     require('./routes/pagos.routes'));
  app.use('/api/garantias', require('./routes/garantias.routes'));
  app.use('/api/reportes',  require('./routes/reportes.routes'));
  app.use('/api/sesiones-trabajo', require('./routes/sesiones-trabajo.routes'));
  app.use('/api/caja',      require('./routes/caja.routes'));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};

module.exports = buildApp;
