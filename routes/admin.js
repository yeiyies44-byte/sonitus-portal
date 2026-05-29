const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../database');
const { requireTeacher } = require('../middleware/auth');

const router = express.Router();
router.use(requireTeacher);

router.get('/stats', (_req, res) => {
  res.json(db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM users WHERE role='student')                         total_students,
      (SELECT COUNT(*) FROM login_sessions)                                     total_logins,
      (SELECT COALESCE(SUM(duration_seconds),0) FROM tool_sessions)            total_seconds,
      (SELECT COUNT(*) FROM tool_sessions WHERE tool='studio')                  studio_sessions,
      (SELECT COUNT(*) FROM tool_sessions WHERE tool='academia')                academia_sessions,
      (SELECT COUNT(*) FROM tool_sessions WHERE tool='intervaltrainer')         interval_sessions,
      (SELECT COUNT(*) FROM tool_sessions WHERE tool='pitchtrainer')            pitch_sessions,
      (SELECT COUNT(*) FROM interval_attempts)                                  interval_attempts_total,
      (SELECT COALESCE(SUM(is_correct),0) FROM interval_attempts)              interval_attempts_correct,
      (SELECT COUNT(*) FROM pitch_attempts WHERE mode='reto')                   pitch_attempts_total,
      (SELECT COUNT(*) FROM pitch_attempts WHERE mode='reto' AND stability_secs>=3) pitch_attempts_correct
  `).get());
});

router.get('/students', (_req, res) => {
  res.json(db.prepare(`
    SELECT
      u.id, u.username, u.full_name, u.created_at,
      MAX(ls.login_at)                                                    last_login,
      COUNT(DISTINCT ls.id)                                               total_logins,
      COALESCE(SUM(ts.duration_seconds),0)                                total_seconds,
      COALESCE(SUM(CASE WHEN ts.tool='studio'          THEN ts.duration_seconds END),0) studio_seconds,
      COALESCE(SUM(CASE WHEN ts.tool='academia'        THEN ts.duration_seconds END),0) academia_seconds,
      COALESCE(SUM(CASE WHEN ts.tool='intervaltrainer' THEN ts.duration_seconds END),0) interval_seconds,
      COALESCE(SUM(CASE WHEN ts.tool='pitchtrainer'   THEN ts.duration_seconds END),0) pitch_seconds,
      (SELECT COUNT(*)              FROM interval_attempts ia WHERE ia.user_id=u.id) interval_attempts,
      (SELECT COALESCE(SUM(is_correct),0) FROM interval_attempts ia WHERE ia.user_id=u.id) interval_correct,
      (SELECT COUNT(*) FROM pitch_attempts pa WHERE pa.user_id=u.id AND pa.mode='reto') pitch_attempts,
      (SELECT COUNT(*) FROM pitch_attempts pa WHERE pa.user_id=u.id AND pa.mode='reto' AND pa.stability_secs>=3) pitch_correct,
      (SELECT ROUND(AVG(deviation_cents),1) FROM pitch_attempts pa WHERE pa.user_id=u.id AND pa.deviation_cents IS NOT NULL) pitch_avg_dev
    FROM users u
    LEFT JOIN login_sessions ls ON ls.user_id=u.id
    LEFT JOIN tool_sessions  ts ON ts.user_id=u.id
    WHERE u.role='student'
    GROUP BY u.id
    ORDER BY CASE WHEN MAX(ls.login_at) IS NULL THEN 1 ELSE 0 END, MAX(ls.login_at) DESC
  `).all());
});

router.get('/students/:id', (req, res) => {
  const student = db.prepare(
    'SELECT id,username,full_name,created_at FROM users WHERE id=? AND role=?'
  ).get(req.params.id, 'student');
  if (!student) return res.status(404).json({ error: 'Alumno no encontrado' });

  const sessions = db.prepare(`
    SELECT ts.id, ts.tool, ts.start_time, ts.end_time, ts.duration_seconds,
           (SELECT COUNT(*) FROM tool_events te WHERE te.tool_session_id=ts.id) events
    FROM tool_sessions ts
    WHERE ts.user_id=?
    ORDER BY ts.start_time DESC
    LIMIT 100
  `).all(req.params.id);

  const logins = db.prepare(
    'SELECT * FROM login_sessions WHERE user_id=? ORDER BY login_at DESC LIMIT 30'
  ).all(req.params.id);

  const intervalAccuracy = db.prepare(`
    SELECT interval_name,
      COUNT(*) total,
      COALESCE(SUM(is_correct),0) correct,
      ROUND(100.0 * COALESCE(SUM(is_correct),0) / COUNT(*), 1) accuracy_pct,
      ROUND(AVG(response_ms) / 1000.0, 1) avg_seconds
    FROM interval_attempts WHERE user_id=?
    GROUP BY interval_name
    ORDER BY CASE interval_name
      WHEN 'Unísono'   THEN 0  WHEN '2ª menor' THEN 1  WHEN '2ª mayor' THEN 2
      WHEN '3ª menor'  THEN 3  WHEN '3ª mayor' THEN 4  WHEN '4ª justa' THEN 5
      WHEN 'Tritono'   THEN 6  WHEN '5ª justa' THEN 7  WHEN '6ª menor' THEN 8
      WHEN '6ª mayor'  THEN 9  WHEN '7ª menor' THEN 10 WHEN '7ª mayor' THEN 11
      WHEN 'Octava'    THEN 12 ELSE 99 END
  `).all(req.params.id);

  const tapResults = db.prepare(`
    SELECT id, bpm, level, time_sig, notes_total, notes_correct, accuracy_pct, created_at
    FROM tap_results WHERE user_id=?
    ORDER BY created_at DESC LIMIT 30
  `).all(req.params.id);

  const tapStats = db.prepare(`
    SELECT COUNT(*) total, CAST(ROUND(AVG(accuracy_pct)) AS INTEGER) avg_accuracy
    FROM tap_results WHERE user_id=?
  `).get(req.params.id);

  res.json({ student, sessions, logins, intervalAccuracy, tapResults, tapStats });
});

router.post('/students', (req, res) => {
  const { username, fullName, password } = req.body ?? {};
  if (!username?.trim() || !fullName?.trim() || !password)
    return res.status(400).json({ error: 'Faltan campos' });
  if (db.prepare('SELECT id FROM users WHERE username=?').get(username.trim()))
    return res.status(409).json({ error: 'Ese usuario ya existe' });

  const hash = bcrypt.hashSync(password, 10);
  const { lastInsertRowid } = db.prepare(
    'INSERT INTO users (username,full_name,password_hash,role) VALUES (?,?,?,?)'
  ).run(username.trim(), fullName.trim(), hash, 'student');

  res.json({ id: lastInsertRowid, username: username.trim(), fullName: fullName.trim() });
});

router.get('/interval-accuracy', (_req, res) => {
  res.json(db.prepare(`
    SELECT interval_name,
      COUNT(*) total,
      COALESCE(SUM(is_correct),0) correct,
      ROUND(100.0 * COALESCE(SUM(is_correct),0) / COUNT(*), 1) accuracy_pct,
      ROUND(AVG(response_ms) / 1000.0, 1) avg_seconds
    FROM interval_attempts
    GROUP BY interval_name
    ORDER BY CASE interval_name
      WHEN 'Unísono'   THEN 0  WHEN '2ª menor' THEN 1  WHEN '2ª mayor' THEN 2
      WHEN '3ª menor'  THEN 3  WHEN '3ª mayor' THEN 4  WHEN '4ª justa' THEN 5
      WHEN 'Tritono'   THEN 6  WHEN '5ª justa' THEN 7  WHEN '6ª menor' THEN 8
      WHEN '6ª mayor'  THEN 9  WHEN '7ª menor' THEN 10 WHEN '7ª mayor' THEN 11
      WHEN 'Octava'    THEN 12 ELSE 99 END
  `).all());
});

router.delete('/students/:id', (req, res) => {
  db.prepare("DELETE FROM users WHERE id=? AND role='student'").run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
