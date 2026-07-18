const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/connection');
const authMiddleware = require('../middleware/auth');
require('dotenv').config();

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { email, password, name, phone, city } = req.body;
    if (!email || !password || !name) return res.status(400).json({ error: 'Email, password and name are required.' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) return res.status(409).json({ error: 'Email already registered.' });
    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      'INSERT INTO users (email, password, name, phone, city) VALUES (?, ?, ?, ?, ?)',
      [email.toLowerCase().trim(), hashedPassword, name.trim(), phone || null, city || null]
    );
    const token = jwt.sign({ id: result.insertId, email, name }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.status(201).json({ message: 'Registered successfully', token, user: { id: result.insertId, email, name, city, phone } });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error during registration.' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
    const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email.toLowerCase().trim()]);
    if (users.length === 0) return res.status(401).json({ error: 'Invalid email or password.' });
    const user = users[0];
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(401).json({ error: 'Invalid email or password.' });
    if (user.is_banned) return res.status(403).json({ error: 'Your account has been banned.' });
    const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({ message: 'Login successful', token, user: { id: user.id, email: user.email, name: user.name, city: user.city, phone: user.phone } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during login.' });
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const [users] = await db.query('SELECT id, email, name, phone, city, created_at, is_banned FROM users WHERE id = ?', [req.user.id]);
    if (users.length === 0) return res.status(404).json({ error: 'User not found.' });
    if (users[0].is_banned) return res.status(403).json({ error: 'Your account has been banned.' });
    res.json(users[0]);
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { name, phone, city } = req.body;
    await db.query('UPDATE users SET name = ?, phone = ?, city = ? WHERE id = ?', [name, phone, city, req.user.id]);
    res.json({ message: 'Profile updated successfully.' });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

router.put('/profile-image', authMiddleware, async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) return res.status(400).json({ error: 'Image data is required.' });
    await db.query('UPDATE users SET profile_image = ? WHERE id = ?', [image, req.user.id]);
    res.json({ message: 'Profile image updated successfully.' });
  } catch (err) {
    console.error('Profile image update error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// Ban/Unban user (admin only - protected by secret key)
router.post('/ban/:userId', async (req, res) => {
  try {
    const adminKey = req.headers['x-admin-key'];
    if (adminKey !== process.env.ADMIN_SECRET_KEY) {
      return res.status(403).json({ error: 'Unauthorized.' });
    }
    const { userId } = req.params;
    const { ban } = req.body; // true = ban, false = unban
    await db.query('UPDATE users SET is_banned = ? WHERE id = ?', [ban ? 1 : 0, userId]);
    res.json({ message: ban ? 'User banned successfully.' : 'User unbanned successfully.' });
  } catch (err) {
    console.error('Ban error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// Get all users (admin only)
router.get('/users', async (req, res) => {
  try {
    const adminKey = req.headers['x-admin-key'];
    if (adminKey !== process.env.ADMIN_SECRET_KEY) {
      return res.status(403).json({ error: 'Unauthorized.' });
    }
    const [users] = await db.query('SELECT id, email, name, phone, city, is_banned, created_at FROM users ORDER BY created_at DESC');
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;