const rateLimit = require('express-rate-limit');
const { fail } = require('../utils/respond');

const isTest = () => process.env.NODE_ENV === 'test';

const handler = (req, res, _next, options) =>
  fail(res, options.statusCode, 'Demasiados intentos. Intenta de nuevo más tarde.');

exports.loginLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             Number(process.env.RATE_LIMIT_LOGIN_MAX ?? 10),
  standardHeaders: true,
  legacyHeaders:   false,
  skip:            isTest,
  handler
});

exports.registroLimiter = rateLimit({
  windowMs:        60 * 60 * 1000,
  max:             Number(process.env.RATE_LIMIT_REGISTRO_MAX ?? 5),
  standardHeaders: true,
  legacyHeaders:   false,
  skip:            isTest,
  handler
});
