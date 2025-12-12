const express = require('express');
const router = express.Router();
const { verifyToken, requireAdmin, requireOwn } = require('../middlewares/auth');
const pool = require('../config/db');

// Lấy danh sách users
router.get('/', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, username, email, full_name, role, avatar_url, bio, created_at 
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
router.delete('/:id', verifyToken, requireOwn, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ status: 'success' });
  } catch (err) {
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
        await pool.query(
            `INSERT INTO notifications (user_id, title, message, type) 
             VALUES ($1, $2, $3, $4)`,
            [id, title, message, type || 'warning']
        );

        res.json({ status: 'success', message: 'Đã gửi thông báo thành công' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Lỗi server khi gửi tin nhắn' });
    }
});

module.exports = router;