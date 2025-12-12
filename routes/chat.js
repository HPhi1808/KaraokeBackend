// routes/chat.js
const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middlewares/auth');
const pool = require('../config/db');

// Gửi tin nhắn
router.post('/', verifyToken, async (req, res) => {
    const sender_id = req.user.user_id; // Lấy từ JWT, không cần gửi trong body nữa
    const { receiver_id, content } = req.body;

    if (!receiver_id || !content?.trim()) {
        return res.status(400).json({ status: 'error', message: 'Thiếu receiver_id hoặc nội dung' });
    }

    try {
        const result = await pool.query(
            `INSERT INTO messages (sender_id, receiver_id, content) 
             VALUES ($1, $2, $3) 
             RETURNING message_id, sender_id, receiver_id, content, sent_at, is_read`,
            [sender_id, receiver_id, content.trim()]
        );

        res.json({
            status: 'success',
            message: result.rows[0]
        });
    } catch (err) {
        console.error('Lỗi gửi tin nhắn:', err);
        res.status(500).json({ status: 'error', message: 'Không thể gửi tin nhắn' });
    }
});

// Lấy lịch sử chat giữa 2 người
router.get('/:friend_id', verifyToken, async (req, res) => {
    const user_id = req.user.user_id;        // Người đang đăng nhập
    const friend_id = parseInt(req.params.friend_id);

    if (!friend_id) {
        return res.status(400).json({ status: 'error', message: 'Thiếu friend_id' });
    }

    try {
        const result = await pool.query(
            `SELECT 
                message_id,
                sender_id,
                receiver_id,
                content,
                sent_at,
                is_read
             FROM messages 
             WHERE (sender_id = $1 AND receiver_id = $2) 
                OR (sender_id = $2 AND receiver_id = $1)
             ORDER BY sent_at ASC`,
            [user_id, friend_id]
        );

        // Đánh dấu đã đọc (tùy chọn, bạn có thể bật nếu muốn)
        await pool.query(
            `UPDATE messages 
             SET is_read = true 
             WHERE sender_id = $1 AND receiver_id = $2 AND is_read = false`,
            [friend_id, user_id]
        );

        res.json(result.rows);
    } catch (err) {
        console.error('Lỗi lấy tin nhắn:', err);
        res.status(500).json({ status: 'error', message: 'Không thể tải tin nhắn' });
    }
});

module.exports = router;