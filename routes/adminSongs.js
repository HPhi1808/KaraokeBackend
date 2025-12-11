const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// 1. Thêm bài hát (POST)
router.post('/', async (req, res) => {
    // Nhận dữ liệu từ Frontend gửi lên
    const { title, artist, genre, video_url, image_url } = req.body;
    
    // Log ra để debug xem server nhận được gì
    console.log("Adding song:", { title, artist, video_url });

    try {
        // SỬA CÂU LỆNH SQL Ở ĐÂY CHO KHỚP CỘT DB
        const query = `
            INSERT INTO songs (title, artist_name, genre, beat_url, image_url) 
            VALUES ($1, $2, $3, $4, $5)
        `;
        
        await pool.query(query, [title, artist, genre, video_url, image_url]);
        
        res.json({ status: 'success', message: 'Thêm bài hát thành công' });
    } catch (err) {
        console.error("Lỗi SQL:", err.message); // In lỗi ra terminal để bạn thấy
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// 2. Xóa bài hát (DELETE)
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        // SQL đã sửa: id -> song_id
        await pool.query('DELETE FROM songs WHERE song_id = $1', [id]);
        res.json({ status: 'success', message: 'Đã xóa bài hát' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;