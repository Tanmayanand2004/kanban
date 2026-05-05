const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { signToken, requireAuth } = require('../auth');

const router = express.Router();

// POST /api/auth/register
router.post('/register', (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password)
    return res.status(400).json({ error: 'name, email and password are required' });

  if (password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing)
    return res.status(409).json({ error: 'Email already registered' });

  const hash = bcrypt.hashSync(password, 10);
  const id = uuid();
  const avatar = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  db.prepare('INSERT INTO users (id, name, email, password, avatar) VALUES (?, ?, ?, ?, ?)')
    .run(id, name, email, hash, avatar);

  const token = signToken({ id, email, name });
  res.status(201).json({ token, user: { id, name, email, avatar } });
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    return res.status(400).json({ error: 'email and password are required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: 'Invalid email or password' });

  const token = signToken({ id: user.id, email: user.email, name: user.name });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, avatar: user.avatar } });
});

// GET /api/users/me
router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, name, email, avatar FROM users WHERE id = ?')
    .get(req.user.id);
  res.json(user);
});

module.exports = router;