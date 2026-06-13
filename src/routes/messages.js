const express = require('express');
const db = require('../db/connection');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// GET /api/messages/conversations
router.get('/conversations', authMiddleware, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        other_user_id,
        u.name AS other_user_name,
        last_message,
        last_message_at,
        unread_count
      FROM (
        SELECT
          CASE WHEN m.sender_id = ? THEN m.receiver_id ELSE m.sender_id END AS other_user_id,
          MAX(m.content) AS last_message,
          MAX(m.created_at) AS last_message_at,
          SUM(CASE WHEN m.receiver_id = ? AND m.is_read = FALSE THEN 1 ELSE 0 END) AS unread_count
        FROM messages m
        WHERE m.sender_id = ? OR m.receiver_id = ?
        GROUP BY CASE WHEN m.sender_id = ? THEN m.receiver_id ELSE m.sender_id END
      ) AS conv
      JOIN users u ON u.id = conv.other_user_id
      ORDER BY last_message_at DESC
    `, [req.user.id, req.user.id, req.user.id, req.user.id, req.user.id]);
    res.json(rows);
  } catch (err) {
    console.error('Conversations error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/messages/unread/count — MUST be before /:userId
router.get('/unread/count', authMiddleware, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT COUNT(*) AS count FROM messages WHERE receiver_id = ? AND is_read = FALSE',
      [req.user.id]
    );
    res.json({ count: rows[0].count });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/messages/:userId
router.get('/:userId', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const myId = req.user.id;

    const [messages] = await db.query(`
      SELECT m.*, u.name AS sender_name
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      WHERE (m.sender_id = ? AND m.receiver_id = ?)
         OR (m.sender_id = ? AND m.receiver_id = ?)
      ORDER BY m.created_at ASC
    `, [myId, userId, userId, myId]);

    await db.query(
      'UPDATE messages SET is_read = TRUE WHERE receiver_id = ? AND sender_id = ?',
      [myId, userId]
    );

    const [users] = await db.query(
      'SELECT id, name, phone, user_type, city FROM users WHERE id = ?',
      [userId]
    );

    res.json({ messages, other_user: users[0] || null });
  } catch (err) {
    console.error('Get messages error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/messages
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { receiver_id, content, post_id } = req.body;

    if (!receiver_id || !content) {
      return res.status(400).json({ error: 'receiver_id and content are required.' });
    }
    if (receiver_id === req.user.id) {
      return res.status(400).json({ error: 'Cannot send message to yourself.' });
    }

    const [users] = await db.query('SELECT id FROM users WHERE id = ?', [receiver_id]);
    if (users.length === 0) return res.status(404).json({ error: 'Receiver not found.' });

    const [result] = await db.query(
      'INSERT INTO messages (sender_id, receiver_id, content, post_id) VALUES (?, ?, ?, ?)',
      [req.user.id, receiver_id, content.trim(), post_id || null]
    );

    res.status(201).json({ message: 'Message sent.', id: result.insertId });
  } catch (err) {
    console.error('Send message error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
