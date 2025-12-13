// routes/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../config/db');

const { verifyToken } = require('../middlewares/auth');

// Kiểm tra Secret Key
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    throw new Error("JWT_SECRET is not defined in environment variables");
}

// Hàm helper tạo Refresh Token
const generateRefreshToken = async (userId, role) => {
    const token = crypto.randomBytes(64).toString('hex');

    // 1. Single Session: Xóa token cũ để đảm bảo chỉ đăng nhập 1 nơi
    await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);

    // 2. Quyết định thời gian hết hạn dựa vào Role
    let expiryInterval = '90 days'; // Mặc định cho User/Guest

    if (role === 'admin' || role === 'own') {
        expiryInterval = '1 day';
    }

    // 3. Thêm mới với thời gian hết hạn cụ thể
    await pool.query(
        `INSERT INTO refresh_tokens (user_id, token, expires_at) 
         VALUES ($1, $2, NOW() + $3::INTERVAL)`,
        [userId, token, expiryInterval]
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
    // Thêm biến platform từ req.body
    const { identifier, password, platform } = req.body;

    try {
        const result = await pool.query(
            `SELECT id, username, email, full_name, role, avatar_url, bio, password_hash, locked_until
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

        if (user.locked_until && new Date(user.locked_until) > new Date()) {
            return res.status(403).json({
                status: 'error',
                message: `Tài khoản của bạn đã bị khoá đến: ${new Date(user.locked_until).toLocaleString('vi-VN')} do vi phạm tiêu chuẩn cộng đồng.`
            });
        }

        // === [LOGIC MỚI] CHẶN ADMIN ĐĂNG NHẬP TỪ APP ===
        if ((user.role === 'admin' || user.role === 'own')) {
            // Nếu là Admin, bắt buộc phải có cờ platform = 'web_admin'
            if (platform !== 'web_admin') {
                // Trả về lỗi 403 Forbidden ngay lập tức
                // KHÔNG tạo token, KHÔNG ghi vào DB
                return res.status(403).json({
                    status: 'error',
                    message: 'Tài khoản Admin vui lòng đăng nhập trên trang quản trị Web!'
                });
            }
        }
        // ===============================================

        // Tạo Access Token
        const accessToken = jwt.sign(
            { user_id: user.id, role: user.role },
            JWT_SECRET,
            { expiresIn: '30m' }
        );

        // Tạo Refresh Token (Truyền thêm Role để tính thời hạn)
        const refreshToken = await generateRefreshToken(user.id, user.role);

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
        const refresh_token = req.body?.refresh_token;

        // Chỉ xóa nếu Client có gửi token lên
        if (refresh_token) {
            await pool.query('DELETE FROM refresh_tokens WHERE token = $1', [refresh_token]);
        }

        // để App yên tâm xóa local data
        res.json({ status: 'success', message: 'Đăng xuất thành công' });
    } catch (err) {
        console.error("Logout Error:", err);
        // Vẫn trả về lỗi server để log, nhưng App sẽ không quan tâm lắm
        res.status(500).json({ status: 'error', message: 'Lỗi server khi đăng xuất' });
    }
});

// --- 5. KIỂM TRA EMAIL (CHECK EMAIL) ---
router.post('/check-email', async (req, res) => {
    const { email } = req.body;
    try {
        const user = await pool.query('SELECT id, role FROM users WHERE email = $1', [email]);

        // Trả về cấu trúc chuẩn có status để App dễ xử lý
        res.json({
            status: 'success',
            exists: user.rows.length > 0,
            message: user.rows.length > 0 ? 'Email đã tồn tại' : 'Email chưa tồn tại',
            role: user.rows[0].role
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

// --- 7. ĐĂNG NHẬP KHÁCH (GUEST LOGIN) ---
router.post('/guest-login', async (req, res) => {
    try {
        // 1. Tạo một định danh ngẫu nhiên cho khách
        const randomId = crypto.randomBytes(8).toString('hex');
        const guestUsername = `guest_${randomId}`;
        const guestEmail = `${guestUsername}@anon.com`;

        // 2. Tạo password ngẫu nhiên
        const randomPass = crypto.randomBytes(16).toString('hex');
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(randomPass, salt);

        // 3.TẠO MỚI khách vào Database
        const newUser = await pool.query(
            `INSERT INTO users (username, password_hash, email, full_name, role) 
             VALUES ($1, $2, $3, $4, 'guest') 
             RETURNING id, username, email, full_name, role, created_at`,
            [guestUsername, hashedPassword, guestEmail, 'Khách ghé thăm']
        );

        const user = newUser.rows[0];

        // 4. Tạo Token cho khách (Role là 'guest')
        const accessToken = jwt.sign(
            { user_id: user.id, role: 'guest' },
            JWT_SECRET,
            { expiresIn: '30m' }
        );

        // Tạo Refresh Token
        const refreshToken = await generateRefreshToken(user.id);

        res.json({
            status: 'success',
            message: 'Đăng nhập khách thành công',
            user: {
                id: user.id,
                username: user.username,
                full_name: user.full_name,
                role: user.role,
                created_at: user.created_at
            },
            access_token: accessToken,
            refresh_token: refreshToken
        });

    } catch (err) {
        console.error("Guest Login Error:", err);
        res.status(500).json({ status: 'error', message: 'Lỗi tạo tài khoản khách' });
    }
});



// API Xóa tài khoản vĩnh viễn (Dùng để dọn dẹp Guest)
router.delete('/delete-guest', verifyToken, async (req, res) => {
    try {
        const { user_id, role } = req.user; // Lấy thông tin từ Token

        // BƯỚC BẢO MẬT: Kiểm tra xem có đúng là Guest không?
        if (role !== 'guest') {
            return res.status(403).json({
                status: 'error',
                message: 'Chỉ tài khoản Khách mới được phép sử dụng API này!'
            });
        }

        // Nếu đúng là Guest thì cho phép xóa chính mình
        await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [user_id]);
        await pool.query('DELETE FROM users WHERE id = $1', [user_id]);

        res.json({ status: 'success', message: 'Đã dọn dẹp tài khoản khách.' });
    } catch (err) {
        console.error("Delete Guest Error:", err);
        res.status(500).json({ status: 'error', message: 'Lỗi server' });
    }
});


module.exports = router;