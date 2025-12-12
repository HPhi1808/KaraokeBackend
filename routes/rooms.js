// routes/rooms.js
const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middlewares/auth');
const pool = require('../config/db');

// Create room
router.post('/create', verifyToken, async (req, res) => {
    const host_id = req.user.user_id;
    const { name, password } = req.body;

    if (!name?.trim()) {
        return res.status(400).json({ status: 'error', message: 'Tên phòng không được để trống' });
    }

    try {
        const result = await pool.query(
            `INSERT INTO live_rooms (name, host_id, password) 
             VALUES ($1, $2, $3) 
             RETURNING room_id, name, host_id, created_at, is_active`,
            [name.trim(), host_id, password || null]
        );

        // Tự động join phòng khi tạo
        await pool.query(
            'INSERT INTO room_participants (room_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [result.rows[0].room_id, host_id]
        );

        res.json({ status: 'success', room: result.rows[0] });
    } catch (err) {
        console.error('Lỗi tạo phòng:', err);
        res.status(500).json({ status: 'error', message: 'Không thể tạo phòng' });
    }
});

// Join room
router.post('/join', verifyToken, async (req, res) => {
    const user_id = req.user.user_id;
    const { room_id, password } = req.body;

    try {
        const room = await pool.query('SELECT * FROM live_rooms WHERE room_id = $1 AND is_active = TRUE', [room_id]);
        if (room.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Phòng không tồn tại hoặc đã đóng' });

        if (room.rows[0].password && room.rows[0].password !== password) {
            return res.status(403).json({ status: 'error', message: 'Sai mật khẩu phòng' });
        }

        await pool.query(
            'INSERT INTO room_participants (room_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [room_id, user_id]
        );

        res.json({ status: 'success', message: 'Đã vào phòng thành công' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Leave room
router.post('/leave', verifyToken, async (req, res) => {
    const user_id = req.user.user_id;
    const { room_id } = req.body;

    try {
        await pool.query(
            'DELETE FROM room_participants WHERE room_id = $1 AND user_id = $2',
            [room_id, user_id]
        );
        res.json({ status: 'success', message: 'Đã rời phòng' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get active rooms (public)
router.get('/active', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                r.room_id, r.name, r.created_at, r.is_active,
                u.username as host_name,
                COUNT(p.user_id) as participant_count
            FROM live_rooms r
            LEFT JOIN users u ON r.host_id = u.id
            LEFT JOIN room_participants p ON r.room_id = p.room_id
            WHERE r.is_active = TRUE
            GROUP BY r.room_id, u.username
            ORDER BY r.created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;