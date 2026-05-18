const { fail } = require('../utils/respond');

class HttpError extends Error {
  constructor(status, message, errors) {
    super(message);
    this.name   = 'HttpError';
    this.status = status;
    if (errors) this.errors = errors;
  }
}

const notFoundHandler = (req, res) =>
  fail(res, 404, 'Recurso no encontrado');

const errorHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  const status     = Number.isInteger(err?.status) ? err.status : 500;
  const isInternal = status >= 500;
  const message    = isInternal ? 'Error interno del servidor' : (err?.message || 'Error');

  if (isInternal) {
    console.error('[server-error]', {
      method:  req.method,
      url:     req.originalUrl,
      message: err?.message,
      stack:   err?.stack
    });
  } else {
    console.warn('[client-error]', {
      method:  req.method,
      url:     req.originalUrl,
      status,
      message: err?.message
    });
  }

  return fail(res, status, message, err?.errors);
};

module.exports = { HttpError, errorHandler, notFoundHandler };
