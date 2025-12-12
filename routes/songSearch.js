// routes/songSearch.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
const pool = require('../config/db');

const GENIUS_TOKEN = process.env.GENIUS_ACCESS_TOKEN;
const YOUTUBE_KEY = process.env.YOUTUBE_API_KEY;

// API tìm bài hát thông minh (dùng cho cả Admin + App Android)
router.post('/search', async (req, res) => {
    const { q } = req.body; // q = "Em của ngày hôm qua" hoặc "Sơn Tùng Dynamite"
    if (!q) return res.status(400).json({ message: 'Thiếu từ khóa tìm kiếm' });

    try {
        // 1. Tìm trên Genius trước (lời + ảnh đẹp nhất)
        const geniusRes = await axios.get(
            `https://api.genius.com/search?q=${encodeURIComponent(q)}`,
            { headers: { Authorization: `Bearer ${GENIUS_TOKEN}` } }
        );

        const hits = geniusRes.data.response.hits.slice(0, 10); // lấy tối đa 10 kết quả
        const results = [];

        for (const hit of hits) {
            const song = hit.result;
            const title = song.title;
            const artist = song.primary_artist.name;

            // 2. Tự động tìm video karaoke trên YouTube
            let beatUrl = '';
            if (YOUTUBE_KEY) {
                try {
                    const ytRes = await axios.get('https://www.googleapis.com/youtube/v3/search', {
                        params: {
                            part: 'snippet',
                            q: `${title} ${artist} karaoke`,
                            type: 'video',
                            videoCategoryId: '10', // Music
                            maxResults: 1,
                            key: YOUTUBE_KEY
                        }
                    });
                    if (ytRes.data.items.length > 0) {
                        const videoId = ytRes.data.items[0].id.videoId;
                        beatUrl = `https://www.youtube.com/watch?v=${videoId}`;
                    }
                } catch (ytErr) {
                    console.log('YouTube lỗi, bỏ qua:', ytErr.message);
                }
            }

            results.push({
                title,
                artist_name: artist,
                genre: 'Pop', // tạm để Pop, sau này có thể lấy từ tags
                beat_url: beatUrl || `https://www.youtube.com/results?search_query=${encodeURIComponent(title + ' ' + artist + ' karaoke')}`,
                lyric_url: song.url,                    // link Genius có lời đầy đủ
                image_url: song.song_art_image_url || song.header_image_url,
                genius_id: song.id
            });
        }

        res.json({ status: 'success', songs: results });
    } catch (err) {
        console.error('Lỗi tìm kiếm:', err.message);
        res.status(500).json({ status: 'error', message: 'Không tìm thấy hoặc lỗi API' });
    }
});

// API lưu nhanh 1 bài hát vào DB (dùng trong Admin)
router.post('/save', async (req, res) => {
    const { title, artist_name, genre, beat_url, lyric_url, image_url } = req.body;

    try {
        // Kiểm tra trùng
        const exist = await pool.query(
            'SELECT * FROM songs WHERE title ILIKE $1 AND artist_name ILIKE $2',
            [title, artist_name]
        );
        if (exist.rows.length > 0) {
            return res.json({ status: 'exists', song: exist.rows[0] });
        }

        const newSong = await pool.query(
            `INSERT INTO songs 
             (title, artist_name, genre, beat_url, lyric_url, image_url, vocal_url, view_count) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, 0) 
             RETURNING *`,
            [title, artist_name || '', genre || 'Pop', beat_url || '', lyric_url || '', image_url || '', '', 0]
        );

        res.json({ status: 'success', song: newSong.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;