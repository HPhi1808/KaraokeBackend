require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const { verifyToken, requireAdmin } = require('./middlewares/auth');

const app = express();
const port = process.env.PORT || 3000;

const noCache = (req, res, next) => {
    res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.header('Expires', '-1');
    res.header('Pragma', 'no-cache');
    next();
};

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(express.static(path.join(__dirname, 'public'), {
    setHeaders: function (res, path) {
        if (path.endsWith('.html')) {
            res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
            res.header('Expires', '-1');
            res.header('Pragma', 'no-cache');
        }
    }
}));

// Phục vụ các trang admin riêng
app.use('/admin', express.static(path.join(__dirname, 'public/admin')));
app.use('/assets', express.static(path.join(__dirname, 'public/assets')));

// Trang login
app.get('/', noCache, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Vào thẳng base khi gõ /admin
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/admin/base.html'));
});

// Import routers
const authRouter = require('./routes/auth');
const adminUsersRouter = require('./routes/adminUsers');
const adminSongsRouter = require('./routes/adminSongs');
const userRouter = require('./routes/user');
const roomsRouter = require('./routes/rooms');
const momentsRouter = require('./routes/moments');
const chatRouter = require('./routes/chat');
const songSearchRouter = require('./routes/songSearch');

// Use routers
app.use('/api/auth', authRouter);
app.use('/api/admin/users', verifyToken, requireAdmin, adminUsersRouter);
app.use('/api/admin/songs', verifyToken, requireAdmin, adminSongsRouter);
app.use('/api/user', verifyToken, userRouter);
app.use('/api/rooms', roomsRouter);
app.use('/api/moments', momentsRouter);
app.use('/api/chat', verifyToken, chatRouter);
app.use('/api/songs/search', songSearchRouter);

// Public songs
app.get('/api/songs', async (req, res) => {
  const pool = require('./config/db');
  try {
    const result = await pool.query('SELECT * FROM songs ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`Server đang chạy tại: http://localhost:${port}`);
});