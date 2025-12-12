const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET không được để trống trong .env!');
}
const verifyToken = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            status: 'error',
            message: 'Access token bị thiếu hoặc sai định dạng'
        });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // chứa { user_id, role }
        next();
    } catch (err) {
        return res.status(403).json({
            status: 'error',
            message: 'Token không hợp lệ hoặc đã hết hạn'
        });
    }
};

// middlewares/auth.js
const requireAdmin = (req, res, next) => {
  if (req.user.role === 'own') return next();  // Own có quyền full
  if (req.user.role !== 'admin') {
    return res.status(403).json({ status: 'error', message: 'Chỉ admin mới có quyền' });
  }
  next();
};

const requireOwn = (req, res, next) => {
  if (req.user.role !== 'own') {
    return res.status(403).json({ status: 'error', message: 'Chỉ owner mới có quyền' });
  }
  next();
};

module.exports = { verifyToken, requireAdmin, requireOwn };