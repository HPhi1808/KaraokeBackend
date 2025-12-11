const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../config/db');

// --- 1. ĐĂNG KÝ ---
router.post('/register', async (req, res) => {
    const { email, username, password, fullName } = req.body; 
    try {
        const checkExist = await pool.query(
            'SELECT * FROM users WHERE email = $1 OR username = $2', 
            [email, username]
        );

        if (checkExist.rows.length > 0) {
            const user = checkExist.rows[0];
            if (user.email === email) return res.status(409).json({ status: 'error', message: 'Email đã được sử dụng!' });
            if (user.username === username) return res.status(409).json({ status: 'error', message: 'Tên đăng nhập đã tồn tại!' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = await pool.query(
            'INSERT INTO users (email, username, password_hash, full_name, role) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [email, username, hashedPassword, fullName, 'user']
        );

        res.json({ status: 'success', user: newUser.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Lỗi Server' });
    }
});

// --- 2. ĐĂNG NHẬP ---
router.post('/login', async (req, res) => {
    const { identifier, password } = req.body;
    try {
        const user = await pool.query('SELECT * FROM users WHERE email = $1 OR username = $1', [identifier]);
        
        if (user.rows.length === 0) {
            return res.status(400).json({ status: 'error', message: 'Tài khoản không tồn tại!' });
        }

        const validPass = await bcrypt.compare(password, user.rows[0].password_hash);
        
        // QUAN TRỌNG: Trả về email khi sai pass để App Android dùng tính năng Sync
        if (!validPass) {
            return res.status(400).json({ 
                status: 'error', 
                message: 'Sai mật khẩu!',
                email: user.rows[0].email 
            });
        }
        
        const userData = user.rows[0];
        delete userData.password_hash;
        res.json({ status: 'success', message: 'Đăng nhập thành công!', user: userData });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Lỗi Server' });
    }
});

// --- 3. KIỂM TRA EMAIL ---
router.post('/check-email', async (req, res) => {
    const { email } = req.body;
    try {
        const user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        res.json({ exists: user.rows.length > 0 });
    } catch (err) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// --- 4. ĐỒNG BỘ MẬT KHẨU ---
router.post('/sync-password', async (req, res) => {
    const { identifier, password } = req.body; 
    // Map lại biến cho đúng logic
    const email = identifier;
    const newPassword = password;

    try {
        if (!email || !newPassword) return res.status(400).json({ status: 'error', message: 'Thiếu thông tin' });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        const updateRes = await pool.query(
            'UPDATE users SET password_hash = $1 WHERE email = $2 RETURNING *',
            [hashedPassword, email]
        );

        if (updateRes.rowCount === 0) return res.status(404).json({ status: 'error', message: 'Email không tồn tại' });

        const userData = updateRes.rows[0];
        delete userData.password_hash;
        res.json({ status: 'success', message: 'Đồng bộ thành công!', user: userData });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Lỗi Server khi đồng bộ' });
    }
});

module.exports = router;