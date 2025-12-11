const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// Lấy danh sách User
router.get('/', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, email, username, full_name, role, created_at FROM users ORDER BY id ASC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Xóa User
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM users WHERE id = $1', [id]);
        res.json({ status: 'success', message: 'Đã xóa người dùng' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
