// routes/user.js
const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middlewares/auth');
const pool = require('../config/db');

// Get profile (của mình hoặc người khác)
router.get('/profile', verifyToken, async (req, res) => {
    const user_id = req.user.user_id;
    try {
        const result = await pool.query(
            'SELECT id, username, email, full_name, avatar_url, bio, role, created_at FROM users WHERE id = $1',
            [user_id]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get any user's public profile
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(
            'SELECT id, username, full_name, avatar_url, bio, created_at FROM users WHERE id = $1',
            [id]
        );
        if (result.rows.length === 0) return res.status(404).json({ message: 'Không tìm thấy người dùng' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update profile
router.put('/profile', verifyToken, async (req, res) => {
    const user_id = req.user.user_id;
    const { full_name, avatar_url, bio } = req.body;

    try {
        const result = await pool.query(
            `UPDATE users 
             SET full_name = COALESCE($1, full_name),
                 avatar_url = COALESCE($2, avatar_url),
                 bio = COALESCE($3, bio)
             WHERE id = $4
             RETURNING id, username, email, full_name, avatar_url, bio, role`,
            [full_name, avatar_url, bio, user_id]
        );

        res.json({ status: 'success', user: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Gửi lời mời kết bạn
router.post('/friends/request', verifyToken, async (req, res) => {
    const user_id = req.user.user_id;
    const { friend_id } = req.body;

    try {
        await pool.query(
            'INSERT INTO friendships (user_id1, user_id2, status) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
            [user_id, friend_id, 'pending']
        );
        res.json({ status: 'success', message: 'Đã gửi lời mời kết bạn' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Chấp nhận kết bạn
router.put('/friends/accept', verifyToken, async (req, res) => {
    const user_id = req.user.user_id;
    const { friend_id } = req.body;

    try {
        const result = await pool.query(
            `UPDATE friendships 
             SET status = 'accepted' 
             WHERE (user_id1 = $1 AND user_id2 = $2) OR (user_id1 = $2 AND user_id2 = $1)
             RETURNING *`,
            [user_id, friend_id]
        );

        if (result.rowCount === 0) {
            return res.status(400).json({ message: 'Không có lời mời nào' });
        }

        res.json({ status: 'success', message: 'Đã chấp nhận kết bạn' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Lấy danh sách bạn bè
router.get('/friends', verifyToken, async (req, res) => {
    const user_id = req.user.user_id;

    try {
        const result = await pool.query(
            `SELECT u.id, u.username, u.full_name, u.avatar_url
             FROM users u
             JOIN friendships f ON (f.user_id1 = u.id OR f.user_id2 = u.id)
             WHERE (f.user_id1 = $1 OR f.user_id2 = $1) 
               AND f.status = 'accepted' 
               AND u.id != $1`,
            [user_id]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;