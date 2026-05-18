const { fail } = require('../utils/respond');

module.exports = (schemas) => (req, res, next) => {
  try {
    if (schemas.body)   req.body   = schemas.body.parse(req.body);
    if (schemas.params) req.params = schemas.params.parse(req.params);
    if (schemas.query)  req.query  = schemas.query.parse(req.query);
    next();
  } catch (e) {
    if (e && Array.isArray(e.issues)) {
      const errores = e.issues.map((i) => ({
        path:    Array.isArray(i.path) ? i.path.join('.') : String(i.path),
        message: i.message
      }));
      return fail(res, 400, 'Datos inválidos', errores);
    }
    next(e);
  }
};
