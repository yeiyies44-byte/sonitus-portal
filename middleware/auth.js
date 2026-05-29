const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'sonitus_jwt_2024_clave_privada';

function requireAuth(req, res, next) {
  const token = req.cookies?.stoken;
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.clearCookie('stoken');
    res.status(401).json({ error: 'Sesión expirada' });
  }
}

function requireTeacher(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user?.role !== 'teacher') return res.status(403).json({ error: 'Acceso solo para profesor' });
    next();
  });
}

module.exports = { requireAuth, requireTeacher, SECRET };
