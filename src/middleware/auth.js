const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'clinic_appointment_secret_key_2024';

function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, name: user.name },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: '未提供认证令牌' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: '认证令牌无效或已过期' });
  }
}

function adminMiddleware(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: '需要管理员权限' });
  }
  next();
}

function patientMiddleware(req, res, next) {
  if (req.user.role !== 'patient') {
    return res.status(403).json({ message: '需要患者权限' });
  }
  next();
}

module.exports = {
  generateToken,
  authMiddleware,
  adminMiddleware,
  patientMiddleware
};
