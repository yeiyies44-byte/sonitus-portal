const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../database');
const { requireAuth, SECRET } = require('../middleware/auth');

const router = express.Router();
const COOKIE = { httpOnly: true, maxAge: 24 * 3600 * 1000, sameSite: 'strict' };

router.post('/login', (req, res) => {
  const { username, password } = req.body ?? {};
  if (!username?.trim() || !password)
    return res.status(400).json({ error: 'Usuario y contraseña requeridos' });

  const user = db.prepare('SELECT * FROM users WHERE username=?').get(username.trim());
  if (!user || !bcrypt.compareSync(password, user.password_hash))
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });

  const { lastInsertRowid: sid } = db.prepare('INSERT INTO login_sessions (user_id) VALUES (?)').run(user.id);

  const token = jwt.sign(
    { id: user.id, username: user.username, fullName: user.full_name, role: user.role, sid },
    SECRET,
    { expiresIn: '24h' }
  );
  res.cookie('stoken', token, COOKIE);
  res.json({ user: { id: user.id, username: user.username, fullName: user.full_name, role: user.role } });
});

router.post('/register', (req, res) => {
  const { username, fullName, password } = req.body ?? {};
  if (!username?.trim() || !fullName?.trim() || !password)
    return res.status(400).json({ error: 'Todos los campos son requeridos' });
  if (password.length < 6)
    return res.status(400).json({ error: 'La contraseña debe tener mínimo 6 caracteres' });

  if (db.prepare('SELECT id FROM users WHERE username=?').get(username.trim()))
    return res.status(409).json({ error: 'Ese nombre de usuario ya está en uso' });

  const hash = bcrypt.hashSync(password, 10);
  try {
    db.prepare('INSERT INTO users (username,full_name,password_hash,role) VALUES (?,?,?,?)').run(
      username.trim(), fullName.trim(), hash, 'student'
    );
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Error al crear la cuenta' });
  }
});

router.post('/logout', requireAuth, (req, res) => {
  if (req.user.sid)
    db.prepare("UPDATE login_sessions SET logout_at=datetime('now') WHERE id=?").run(req.user.sid);
  res.clearCookie('stoken');
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  const { id, username, fullName, role } = req.user;
  res.json({ user: { id, username, fullName, role } });
});

module.exports = router;
