const express = require('express');
const db = require('../db/connection');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

const VALID_SECTORS = ['restaurants', 'warehouses', 'construction', 'cleaning', 'security', 'drivers', 'it', 'retail'];

// GET /api/posts — get all posts (with filters)
router.get('/', async (req, res) => {
  try {
    const { sector, type, city, search, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT p.*, u.name AS user_name, u.phone AS user_phone
      FROM posts p
      JOIN users u ON p.user_id = u.id
      WHERE p.is_active = TRUE AND p.expires_at > NOW()
    `;
    const params = [];

    if (sector) { query += ' AND p.sector = ?'; params.push(sector); }
    if (type) { query += ' AND p.type = ?'; params.push(type); }
    if (city) { query += ' AND p.city = ?'; params.push(city); }
    if (search) {
      query += ' AND (p.role LIKE ? OR p.description LIKE ? OR u.name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY p.urgent DESC, p.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const [posts] = await db.query(query, params);
    res.json(posts);
  } catch (err) {
    console.error('Get posts error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/posts/stats — get counts per sector
router.get('/stats', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT sector,
        COUNT(*) AS total,
        SUM(type = 'employer') AS employers,
        SUM(type = 'jobseeker') AS jobseekers
      FROM posts
      WHERE is_active = TRUE AND expires_at > NOW()
      GROUP BY sector
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/posts/:id — get single post
router.get('/:id', async (req, res) => {
  try {
    const [posts] = await db.query(`
      SELECT p.*, u.name AS user_name, u.phone AS user_phone, u.email AS user_email
      FROM posts p
      JOIN users u ON p.user_id = u.id
      WHERE p.id = ? AND p.is_active = TRUE
    `, [req.params.id]);

    if (posts.length === 0) return res.status(404).json({ error: 'Post not found.' });
    res.json(posts[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/posts — create post (auth required)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { sector, role, description, city, phone, urgent } = req.body;

    if (!sector || !role || !city) {
      return res.status(400).json({ error: 'sector, role, and city are required.' });
    }

    if (!VALID_SECTORS.includes(sector)) {
      return res.status(400).json({ error: 'Invalid sector.' });
    }

    const [result] = await db.query(
      `INSERT INTO posts (user_id, type, sector, role, description, city, phone, urgent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        req.body.type || 'employer',
        sector,
        role.trim(),
        description || null,
        city,
        phone || null,
        urgent ? 1 : 0
      ]
    );

    res.status(201).json({ message: 'Post created successfully.', id: result.insertId });
  } catch (err) {
    console.error('Create post error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/posts/:id — update post (owner only)
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const [posts] = await db.query('SELECT * FROM posts WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (posts.length === 0) return res.status(404).json({ error: 'Post not found or not authorized.' });

    const { role, description, city, phone, urgent } = req.body;
    await db.query(
      'UPDATE posts SET role = ?, description = ?, city = ?, phone = ?, urgent = ? WHERE id = ?',
      [role, description, city, phone, urgent ? 1 : 0, req.params.id]
    );

    res.json({ message: 'Post updated successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/posts/:id — delete post (owner only)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const [result] = await db.query(
      'UPDATE posts SET is_active = FALSE WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Post not found or not authorized.' });
    res.json({ message: 'Post deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/posts/user/my — get my posts
router.get('/user/my', authMiddleware, async (req, res) => {
  try {
    const [posts] = await db.query(
      'SELECT * FROM posts WHERE user_id = ? ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
