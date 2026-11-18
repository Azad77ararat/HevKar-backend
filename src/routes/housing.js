const express = require('express');
const db = require('../db/connection');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

const VALID_TYPES = ['miete', 'kauf', 'suche'];

// يُنشئ الجدول تلقائياً إن لم يكن موجوداً
db.query(`
  CREATE TABLE IF NOT EXISTS housing (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    type VARCHAR(10) NOT NULL DEFAULT 'miete',
    title VARCHAR(200) NOT NULL,
    description TEXT,
    city VARCHAR(100) NOT NULL,
    price VARCHAR(50),
    rooms VARCHAR(20),
    size VARCHAR(20),
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_housing_type (type),
    INDEX idx_housing_city (city),
    INDEX idx_housing_user (user_id)
  ) CHARACTER SET utf8mb4
`).then(() => console.log('✅ housing table ready'))
  .catch(err => console.error('❌ housing table error:', err.message));

// GET /api/housing
router.get('/', async (req, res) => {
  try {
    const { type, city, search, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT h.*, u.name AS user_name, u.phone AS user_phone
      FROM housing h
      JOIN users u ON h.user_id = u.id
      WHERE h.is_active = 1
    `;
    const params = [];

    if (type && VALID_TYPES.includes(type)) { query += ' AND h.type = ?'; params.push(type); }
    if (city) { query += ' AND h.city = ?'; params.push(city); }
    if (search) {
      query += ' AND (h.title LIKE ? OR h.description LIKE ? OR h.city LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY h.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit) || 50, parseInt(offset) || 0);

    const [rows] = await db.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('Get housing error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/housing/user/my
router.get('/user/my', authMiddleware, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM housing WHERE user_id = ? AND is_active = 1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/housing
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { title, description, city, price, type, rooms, size } = req.body;

    if (!title || !title.trim() || !city || !city.trim()) {
      return res.status(400).json({ error: 'title and city are required.' });
    }
    const t = VALID_TYPES.includes(type) ? type : 'miete';

    const [result] = await db.query(
      `INSERT INTO housing (user_id, type, title, description, city, price, rooms, size)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        t,
        title.trim(),
        description ? String(description).trim() || null : null,
        city.trim(),
        price ? String(price).trim() || null : null,
        rooms ? String(rooms).trim() || null : null,
        size ? String(size).trim() || null : null,
      ]
    );

    res.status(201).json({ message: 'Housing created successfully.', id: result.insertId });
  } catch (err) {
    console.error('Create housing error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/housing/:id
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const [result] = await db.query(
      'UPDATE housing SET is_active = 0 WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Not found or not authorized.' });
    res.json({ message: 'Housing deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
