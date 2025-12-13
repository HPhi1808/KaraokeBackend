// middlewares/auth.js
const jwt = require('jsonwebtoken');
const pool = require('../config/db'); 

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET không được để trống trong .env!');
}

const verifyToken = async (req, res, next) => {
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
        
        // Chỉ kiểm tra Database nếu là Admin hoặc Owner
        if (decoded.role === 'admin' || decoded.role === 'own') {
            const sessionCheck = await pool.query(
                'SELECT 1 FROM refresh_tokens WHERE user_id = $1 LIMIT 1',
                [decoded.user_id]
            );

            if (sessionCheck.rows.length === 0) {
                return res.status(401).json({ 
                    status: 'error', 
                    message: 'Phiên quản trị đã bị hủy từ phía Server' 
                });
            }
        }
        

        req.user = decoded; 
        next();
    } catch (err) {
        return res.status(403).json({
            status: 'error',
            message: 'Token không hợp lệ hoặc đã hết hạn'
        });
    }
};

const requireAdmin = (req, res, next) => {
  if (req.user.role === 'own') return next(); 
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