const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json()); // Quan trọng: để đọc được JSON từ App gửi lên

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// --- 1. API ĐĂNG KÝ (Register) ---
app.post('/api/register', async (req, res) => {
    const { phone, password, full_name } = req.body;
    try {
        // Kiểm tra xem số điện thoại đã tồn tại chưa
        const checkUser = await pool.query('SELECT * FROM users WHERE phone_number = $1', [phone]);
        if (checkUser.rows.length > 0) {
            return res.status(400).json({ status: 'error', message: 'Số điện thoại này đã được đăng ký!' });
        }

        // Mã hóa mật khẩu (Không lưu pass thô)
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Lưu vào Database
        const newUser = await pool.query(
            'INSERT INTO users (phone_number, password_hash, full_name) VALUES ($1, $2, $3) RETURNING user_id, full_name, role',
            [phone, hashedPassword, full_name]
        );

        res.json({ status: 'success', message: 'Đăng ký thành công!', user: newUser.rows[0] });

    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Lỗi Server: ' + err.message });
    }
});

// --- 2. API ĐĂNG NHẬP (Login) ---
app.post('/api/login', async (req, res) => {
    const { phone, password } = req.body;
    try {
        // Tìm user theo số điện thoại
        const user = await pool.query('SELECT * FROM users WHERE phone_number = $1', [phone]);
        
        if (user.rows.length === 0) {
            return res.status(400).json({ status: 'error', message: 'Số điện thoại không tồn tại!' });
        }

        // So sánh mật khẩu nhập vào với mật khẩu đã mã hóa
        const validPass = await bcrypt.compare(password, user.rows[0].password_hash);
        if (!validPass) {
            return res.status(400).json({ status: 'error', message: 'Sai mật khẩu!' });
        }

        // Đăng nhập thành công -> Trả về thông tin (trừ mật khẩu)
        const userData = user.rows[0];
        delete userData.password_hash; // Xóa pass trước khi gửi về

        res.json({ status: 'success', message: 'Đăng nhập thành công!', user: userData });

    } catch (err) {
        console.error(err);
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

// Chạy Server
app.listen(port, () => {
    console.log(`🚀 Server đang chạy tại: http://localhost:${port}`);
});