module.exports = (...rolesPermitidos) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'No autenticado' });
  if (!rolesPermitidos.includes(req.user.rol))
    return res.status(403).json({ error: 'Sin permiso para esta acción' });
  next();
};
