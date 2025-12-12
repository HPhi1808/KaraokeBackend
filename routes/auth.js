// routes/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    throw new Error("JWT_SECRET is not defined in environment variables");
}

const generateRefreshToken = async (userId) => {
    const token = crypto.randomBytes(64).toString('hex');
    await pool.query(
        `INSERT INTO refresh_tokens (user_id, token) VALUES ($1, $2)`,
        [userId, token]
    );
    return token;
};

router.post('/login', async (req, res) => {
    const { identifier, password } = req.body;

    try {
        const result = await pool.query(
            `SELECT id, username, email, full_name, role, avatar_url, bio, password_hash 
             FROM users WHERE email = $1 OR username = $1`,
            [identifier]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ status: 'error', message: 'Tài khoản không tồn tại!' });
        }

        const user = result.rows[0];
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(400).json({ status: 'error', message: 'Sai mật khẩu!' });
        }
        
        // Tạo token
        const accessToken = jwt.sign(
            { user_id: user.id, role: user.role },
            JWT_SECRET,
            { expiresIn: '30m' }
        );

        const refreshToken = await generateRefreshToken(user.id);

        delete user.password_hash;

        res.json({
            status: 'success',
            message: 'Đăng nhập thành công',
            user,
            access_token: accessToken,
            refresh_token: refreshToken,
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Lỗi server' });
    }
});

// REFRESH TOKEN
router.post('/refresh', async (req, res) => {
    const { refresh_token } = req.body;
    if (!refresh_token) return res.status(401).json({ message: 'Thiếu token' });

    try {
        const result = await pool.query(
            `SELECT user_id FROM refresh_tokens WHERE token = $1 AND expires_at > NOW()`,
            [refresh_token]
        );

        if (result.rows.length === 0) {
            return res.status(403).json({ message: 'Token không hợp lệ' });
        }

        const { user_id } = result.rows[0];
        const userRes = await pool.query(`SELECT id, role FROM users WHERE id = $1`, [user_id]);
        const user = userRes.rows[0];

        const newAccessToken = jwt.sign(
            { user_id: user.id, role: user.role },
            JWT_SECRET,
            { expiresIn: '30m' }
        );

        res.json({ access_token: newAccessToken });
    } catch (err) {
        res.status(403).json({ message: 'Token không hợp lệ' });
    }
});

// LOGOUT
router.post('/logout', async (req, res) => {
  try {
    if (req.body?.refresh_token) {
      await pool.query('DELETE FROM refresh_tokens WHERE token = $1', [req.body.refresh_token]);
    }

    res.json({ status: 'success', message: 'Đăng xuất thành công' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: 'Lỗi server khi đăng xuất' });
  }
});

module.exports = router;