const express = require('express');
const router = express.Router();
const { verifyToken, requireAdmin, requireOwn } = require('../middlewares/auth');
const pool = require('../config/db');

// Lấy danh sách users
router.get('/', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, username, email, full_name, role, avatar_url, bio, created_at, locked_until
      FROM users 
      ORDER BY created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Đổi role
router.patch('/:id/role', verifyToken, requireOwn, async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;

  try {
    const { rows } = await pool.query(
      'UPDATE users SET role = $1 WHERE id = $2 RETURNING *',
      [role, id]
    );
    res.json({ status: 'success', user: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Xoá user
router.delete('/:id', verifyToken, requireAdmin, async (req, res) => {
  const { id } = req.params;      // ID người bị xóa
  const requesterId = req.user.user_id; // ID người thực hiện lệnh (lấy từ token)
  const requesterRole = req.user.role;  // Role người thực hiện lệnh

  try {
    // 1. Lấy thông tin role của người BỊ xóa
    const targetUser = await pool.query('SELECT role FROM users WHERE id = $1', [id]);

    if (targetUser.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Người dùng không tồn tại' });
    }

    const targetRole = targetUser.rows[0].role;

    // 2. LOGIC PHÂN QUYỀN CHẶT CHẼ
    
    // Nếu người xóa là ADMIN thường
    if (requesterRole === 'admin') {
        // Chỉ cho phép xóa 'user' hoặc 'guest'
        if (targetRole === 'admin' || targetRole === 'own') {
            return res.status(403).json({ 
                status: 'error', 
                message: 'Admin chỉ có thể xóa User hoặc Guest. Không thể xóa Admin khác hoặc Owner!' 
            });
        }
    }

    // (Nếu requesterRole là 'own' thì bỏ qua đoạn if trên -> được quyền xóa tất cả)

    // 3. Ngăn chặn tự xóa chính mình (Dù là Owner cũng không nên tự xóa nick mình khi đang đăng nhập)
    if (parseInt(id) === requesterId) {
        return res.status(400).json({ status: 'error', message: 'Bạn không thể tự xóa tài khoản của chính mình!' });
    }

    // 4. Thực hiện xóa
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ status: 'success', message: 'Đã xóa thành công user này.' });

  } catch (err) {
    console.error("Delete Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Gửi tin nhắn tới user
router.post('/:id/message', verifyToken, requireAdmin, async (req, res) => {
    const { id } = req.params; // ID của người nhận
    const { title, message, type } = req.body;

    if (!title || !message) {
        return res.status(400).json({ status: 'error', message: 'Thiếu tiêu đề hoặc nội dung' });
    }

    try {
        // CẬP NHẬT QUERY: Thêm is_read = false và created_at = NOW()
        await pool.query(
            `INSERT INTO notifications (user_id, title, message, type, is_read, created_at) 
             VALUES ($1, $2, $3, $4, false, NOW())`,
            [id, title, message, type || 'warning']
        );

        res.json({ status: 'success', message: 'Đã gửi thông báo thành công' });
    } catch (err) {
        console.error("Lỗi gửi tin nhắn:", err); // In lỗi ra terminal để dễ debug
        res.status(500).json({ status: 'error', message: 'Lỗi server: ' + err.message });
    }
});


// API KHOÁ / MỞ KHOÁ TÀI KHOẢN
router.post('/:id/lock', verifyToken, requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { duration } = req.body; // duration: 'unlock', '1h', '24h', '7d', 'forever'
    
    const requesterRole = req.user.role;
    const requesterId = req.user.user_id;

    try {
        // 1. Kiểm tra User mục tiêu
        const targetUser = await pool.query('SELECT role FROM users WHERE id = $1', [id]);
        if (targetUser.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Người dùng không tồn tại' });
        }
        const targetRole = targetUser.rows[0].role;

        // 2. CHECK QUYỀN (Logic giống hệt xoá)
        if (requesterRole === 'admin') {
            if (targetRole === 'admin' || targetRole === 'own') {
                return res.status(403).json({ 
                    status: 'error', 
                    message: 'Admin không thể khoá Admin khác hoặc Owner!' 
                });
            }
        }

        if (parseInt(id) === requesterId) {
            return res.status(400).json({ status: 'error', message: 'Không thể tự khoá chính mình' });
        }

        // 3. Tính toán thời gian khoá
        let sql = '';
        if (duration === 'unlock') {
            sql = 'UPDATE users SET locked_until = NULL WHERE id = $1';
        } else if (duration === 'forever') {
            // Khoá 100 năm
            sql = "UPDATE users SET locked_until = (NOW() + interval '100 years') WHERE id = $1";
        } else {
            // duration ví dụ: '1 hour', '1 day', '7 days'
            // Để an toàn, ta nên switch case hoặc map
            const intervalMap = {
                '1h': '1 hour',
                '24h': '1 day',
                '7d': '7 days',
                '30d': '30 days'
            };
            const dbInterval = intervalMap[duration] || '1 hour'; // Mặc định 1h nếu gửi sai
            sql = `UPDATE users SET locked_until = (NOW() + interval '${dbInterval}') WHERE id = $1`;
        }

        // 4. Thực thi Update
        await pool.query(sql, [id]);

        // 5. QUAN TRỌNG: Xóa luôn Refresh Token để User bị đá ra ngay lập tức
        if (duration !== 'unlock') {
            await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [id]);
        }

        res.json({ status: 'success', message: duration === 'unlock' ? 'Đã mở khoá' : 'Đã khoá tài khoản thành công' });

    } catch (err) {
        console.error("Lock Error:", err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;