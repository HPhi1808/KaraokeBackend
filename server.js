const path = require('path');
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// --- 1. API ĐĂNG KÝ (Register) ---
app.post('/api/register', async (req, res) => {
    const { email, username, password, fullName } = req.body; 

    try {
        // 1. Kiểm tra Email HOẶC Username đã tồn tại chưa
        const checkExist = await pool.query(
            'SELECT * FROM users WHERE email = $1 OR username = $2', 
            [email, username]
        );

        if (checkExist.rows.length > 0) {
            const user = checkExist.rows[0];
            if (user.email === email) {
                return res.status(409).json({ status: 'error', message: 'Email đã được sử dụng!' });
            }
            if (user.username === username) {
                return res.status(409).json({ status: 'error', message: 'Tên đăng nhập đã tồn tại!' });
            }
        }

        // 2. Mã hóa mật khẩu
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // 3. Lưu vào Database
        const newUser = await pool.query(
            'INSERT INTO users (email, username, password_hash, full_name) VALUES ($1, $2, $3, $4) RETURNING *',
            [email, username, hashedPassword, fullName]
        );

        res.json({ status: 'success', user: newUser.rows[0] });

    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Lỗi Server' });
    }
});

// --- 2. API ĐĂNG NHẬP (Login) ---
app.post('/api/login', async (req, res) => {
    const { identifier, password } = req.body;

    try {
        // Tìm user theo email hoặc username
        const user = await pool.query(
            'SELECT * FROM users WHERE email = $1 OR username = $1', 
            [identifier]
        );
        
        if (user.rows.length === 0) {
            return res.status(400).json({ status: 'error', message: 'Tài khoản không tồn tại!' });
        }

        const dbHash = user.rows[0].password_hash;
        const validPass = await bcrypt.compare(password, dbHash);
        
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
        res.status(500).json({ status: 'error', message: 'Lỗi Server' });
    }
});

// --- 3. API LẤY DANH SÁCH BÀI HÁT ---
app.get('/api/songs', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM songs ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- 4. API ĐỒNG BỘ MẬT KHẨU
app.post('/api/sync-password', async (req, res) => {
    const { identifier, password } = req.body;
    const email = identifier;
    const newPassword = password;

    try {
        if (!email || !newPassword) {
            return res.status(400).json({ status: 'error', message: 'Thiếu thông tin đồng bộ' });
        }

        // 1. Mã hóa mật khẩu mới
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        // 2. Cập nhật vào Database
        const updateRes = await pool.query(
            'UPDATE users SET password_hash = $1 WHERE email = $2 RETURNING *',
            [hashedPassword, email]
        );

        if (updateRes.rowCount === 0) {
            return res.status(404).json({ status: 'error', message: 'Email không tồn tại' });
        }

        const userData = updateRes.rows[0];
        delete userData.password_hash;
        
        res.json({ status: 'success', message: 'Đồng bộ thành công!', user: userData });

    } catch (err) {
        res.status(500).json({ status: 'error', message: 'Lỗi Server khi đồng bộ' });
    }
});

// --- API KIỂM TRA EMAIL TỒN TẠI ---
app.post('/api/check-email', async (req, res) => {
    const { email } = req.body;
    try {
        const user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        
        if (user.rows.length > 0) {
            res.json({ exists: true });
        } else {
            res.json({ exists: false });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// Chạy Server
app.listen(port, () => {
    console.log(`🚀 Server đang chạy tại: http://localhost:${port}`);
});