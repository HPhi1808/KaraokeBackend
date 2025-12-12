// routes/moments.js
const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middlewares/auth');
const pool = require('../config/db');

// Post moment (chỉ user đã login)
router.post('/', verifyToken, async (req, res) => {
    const user_id = req.user.user_id;  // Lấy từ JWT
    const { audio_url, description } = req.body;

    if (!audio_url) {
        return res.status(400).json({ status: 'error', message: 'Thiếu audio_url' });
    }

    try {
        const result = await pool.query(
            `INSERT INTO moments (user_id, audio_url, description) 
             VALUES ($1, $2, $3) 
             RETURNING moment_id, user_id, audio_url, description, created_at, view_count`,
            [user_id, audio_url, description || '']
        );

        res.json({ status: 'success', moment: result.rows[0] });
    } catch (err) {
        console.error('Lỗi tạo moment:', err);
        res.status(500).json({ status: 'error', message: 'Không thể đăng khoảnh khắc' });
    }
});

// Get feed moments (public, không cần login)
router.get('/', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                m.*,
                u.username,
                u.full_name,
                u.avatar_url
            FROM moments m
            JOIN users u ON m.user_id = u.id
            ORDER BY m.created_at DESC
            LIMIT 50
        `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Like moment
router.post('/like', verifyToken, async (req, res) => {
    const user_id = req.user.user_id;
    const { moment_id } = req.body;

    if (!moment_id) {
        return res.status(400).json({ status: 'error', message: 'Thiếu moment_id' });
    }

    try {
        await pool.query(
            'INSERT INTO moment_likes (moment_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [moment_id, user_id]
        );
        res.json({ status: 'success', message: 'Đã thích khoảnh khắc' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Comment moment
router.post('/comment', verifyToken, async (req, res) => {
    const user_id = req.user.user_id;
    const { moment_id, content } = req.body;

    if (!moment_id || !content?.trim()) {
        return res.status(400).json({ status: 'error', message: 'Thiếu dữ liệu' });
    }

    try {
        const result = await pool.query(
            `INSERT INTO moment_comments (moment_id, user_id, content) 
             VALUES ($1, $2, $3) 
             RETURNING comment_id, moment_id, user_id, content, created_at`,
            [moment_id, user_id, content.trim()]
        );
        res.json({ status: 'success', comment: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;