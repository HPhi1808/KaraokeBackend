// routes/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../config/db');

// Kiểm tra Secret Key
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    throw new Error("JWT_SECRET is not defined in environment variables");
}

// Hàm helper tạo Refresh Token
const generateRefreshToken = async (userId) => {
    const token = crypto.randomBytes(64).toString('hex');
    await pool.query(
        `INSERT INTO refresh_tokens (user_id, token) VALUES ($1, $2)`,
        [userId, token]
    );
    return token;
};

// --- 1. ĐĂNG KÝ (REGISTER) - MỚI BỔ SUNG ---
router.post('/register', async (req, res) => {
    const { username, password, email, full_name } = req.body;

    // Validate cơ bản
    if (!username || !password || !email) {
        return res.status(400).json({ status: 'error', message: 'Vui lòng nhập đủ thông tin!' });
    }

    try {
        // Kiểm tra user tồn tại chưa
        const userExist = await pool.query(
            'SELECT id FROM users WHERE username = $1 OR email = $2',
            [username, email]
        );

        if (userExist.rows.length > 0) {
            return res.status(400).json({ status: 'error', message: 'Username hoặc Email đã tồn tại' });
        }

        // Mã hóa mật khẩu
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Tạo user mới (Mặc định role là 'user')
        const newUser = await pool.query(
            `INSERT INTO users (username, password_hash, email, full_name, role) 
             VALUES ($1, $2, $3, $4, 'user') 
             RETURNING id, username, email, full_name, role, created_at`,
            [username, hashedPassword, email, full_name || username]
        );

        const user = newUser.rows[0];

        // Tạo token ngay sau khi đăng ký để tự động đăng nhập
        const accessToken = jwt.sign(
            { user_id: user.id, role: user.role },
            JWT_SECRET,
            { expiresIn: '30m' }
        );
        const refreshToken = await generateRefreshToken(user.id);

        res.json({
            status: 'success',
            message: 'Đăng ký thành công',
            user,
            access_token: accessToken,
            refresh_token: refreshToken
        });

    } catch (err) {
        console.error("Register Error:", err);
        res.status(500).json({ status: 'error', message: 'Lỗi server khi đăng ký' });
    }
});

// --- 2. ĐĂNG NHẬP (LOGIN) ---
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

// --- 3. REFRESH TOKEN ---
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

// --- 4. LOGOUT ---
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

// --- 5. KIỂM TRA EMAIL (CHECK EMAIL) ---
router.post('/check-email', async (req, res) => {
    const { email } = req.body;
    try {
        const user = await pool.query('SELECT id FROM users WHERE email = $1', [email]);

        // Trả về cấu trúc chuẩn có status để App dễ xử lý
        res.json({
            status: 'success',
            exists: user.rows.length > 0,
            message: user.rows.length > 0 ? 'Email đã tồn tại' : 'Email chưa tồn tại'
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Lỗi server khi kiểm tra email' });
    }
});

// --- 6. ĐỒNG BỘ MẬT KHẨU (CÓ TRẢ VỀ TOKEN) ---
router.post('/sync-password', async (req, res) => {
    const { identifier, password } = req.body;
    // Map lại biến
    const email = identifier;
    const newPassword = password;

    try {
        if (!email || !newPassword) {
            return res.status(400).json({ status: 'error', message: 'Thiếu thông tin email hoặc mật khẩu' });
        }

        // 1. Mã hóa mật khẩu mới
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        // 2. Cập nhật vào DB
        const updateRes = await pool.query(
            'UPDATE users SET password_hash = $1 WHERE email = $2 RETURNING id, username, email, full_name, role, created_at',
            [hashedPassword, email]
        );

        if (updateRes.rowCount === 0) {
            return res.status(404).json({ status: 'error', message: 'Email không tồn tại trong hệ thống' });
        }

        const user = updateRes.rows[0];

        // === 3. TẠO TOKEN MỚI ===
        const accessToken = jwt.sign(
            { user_id: user.id, role: user.role },
            JWT_SECRET,
            { expiresIn: '30m' }
        );

        const refreshToken = await generateRefreshToken(user.id);

        // 4. Trả về kết quả đầy đủ
        res.json({
            status: 'success',
            message: 'Đồng bộ mật khẩu thành công!',
            user: user,
            access_token: accessToken,  // App sẽ nhận được token mới
            refresh_token: refreshToken
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Lỗi Server khi đồng bộ' });
    }
});

module.exports = router;