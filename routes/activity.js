const express = require('express');
const { db } = require('../database');
const { requireAuth } = require('../middleware/auth');
const { awardXpWithChecks } = require('./gamification');

const router = express.Router();
router.use(requireAuth);

router.get('/stats', (req, res) => {
  const rows = db.prepare(`
    SELECT tool,
      COUNT(*)                          sessions,
      COALESCE(SUM(duration_seconds),0) total_seconds,
      MAX(start_time)                   last_used
    FROM tool_sessions WHERE user_id=?
    GROUP BY tool
  `).all(req.user.id);

  const attempts = db.prepare(`
    SELECT COUNT(*) total, COALESCE(SUM(is_correct),0) correct
    FROM interval_attempts WHERE user_id=?
  `).get(req.user.id);

  const pitchStats = db.prepare(`
    SELECT COUNT(*) total,
      COALESCE(AVG(CASE WHEN mode='reto' THEN (CASE WHEN stability_secs>=3 THEN 100 ELSE 0 END) END),null) avg_accuracy,
      COALESCE(AVG(CASE WHEN deviation_cents IS NOT NULL THEN deviation_cents END),null) avg_deviation
    FROM pitch_attempts WHERE user_id=?
  `).get(req.user.id);

  const out = { studio: null, academia: null, intervaltrainer: null,
                intervalAttempts: attempts, pitchStats };
  rows.forEach(r => { out[r.tool] = r; });
  res.json(out);
});

router.post('/tool-start', (req, res) => {
  const { tool } = req.body ?? {};
  if (!['studio', 'academia', 'intervaltrainer'].includes(tool))
    return res.status(400).json({ error: 'Herramienta inválida' });

  const { lastInsertRowid } = db.prepare(
    'INSERT INTO tool_sessions (user_id,login_session_id,tool) VALUES (?,?,?)'
  ).run(req.user.id, req.user.sid ?? null, tool);

  res.json({ toolSessionId: lastInsertRowid });
});

router.post('/tool-end', (req, res) => {
  const { toolSessionId, durationSeconds } = req.body ?? {};
  if (!toolSessionId) return res.status(400).json({ error: 'toolSessionId requerido' });

  db.prepare(
    "UPDATE tool_sessions SET end_time=datetime('now'),duration_seconds=? WHERE id=? AND user_id=?"
  ).run(Math.max(0, Math.round(durationSeconds || 0)), toolSessionId, req.user.id);

  res.json({ ok: true });
});

router.post('/event', (req, res) => {
  const { toolSessionId, eventType, eventData } = req.body ?? {};
  if (!toolSessionId || !eventType) return res.status(400).json({ error: 'Faltan campos' });

  db.prepare(
    'INSERT INTO tool_events (tool_session_id,user_id,event_type,event_data) VALUES (?,?,?,?)'
  ).run(toolSessionId, req.user.id, eventType, JSON.stringify(eventData ?? {}));

  res.json({ ok: true });
});

router.post('/interval-attempt', (req, res) => {
  const { toolSessionId, intervalName, userAnswer, isCorrect, responseMs } = req.body ?? {};
  if (!intervalName || !userAnswer)
    return res.status(400).json({ error: 'Faltan campos: intervalName, userAnswer' });

  db.prepare(
    'INSERT INTO interval_attempts (user_id,tool_session_id,interval_name,user_answer,is_correct,response_ms) VALUES (?,?,?,?,?,?)'
  ).run(req.user.id, toolSessionId ?? null, intervalName, userAnswer, isCorrect ? 1 : 0, responseMs ?? null);

  if (isCorrect) awardXpWithChecks(req.user.id, 1, 'interval_correct');

  res.json({ ok: true });
});

router.post('/tap-result', (req, res) => {
  const { toolSessionId, bpm, level, timeSig, notesTotal, notesCorrect } = req.body ?? {};
  if (notesTotal == null || notesCorrect == null)
    return res.status(400).json({ error: 'Faltan campos: notesTotal, notesCorrect' });

  const accuracy = Math.round((notesCorrect / notesTotal) * 100);
  db.prepare(
    `INSERT INTO tap_results (user_id, tool_session_id, bpm, level, time_sig, notes_total, notes_correct, accuracy_pct)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(req.user.id, toolSessionId ?? null, bpm ?? 80, level ?? 1, timeSig ?? '4/4', notesTotal, notesCorrect, accuracy);

  if (accuracy >= 80) awardXpWithChecks(req.user.id, 1, 'tap_accurate');

  res.json({ ok: true });
});

router.post('/pitch-attempt', (req, res) => {
  const { tsid, mode, noteTarget, noteDetected, deviationCents, stabilitySecs } = req.body ?? {};
  if (!mode || !['libre', 'reto'].includes(mode))
    return res.status(400).json({ error: 'Parámetro mode inválido' });

  db.prepare(
    `INSERT INTO pitch_attempts
       (user_id, tool_session_id, mode, note_target, note_detected, deviation_cents, stability_secs)
     VALUES (?,?,?,?,?,?,?)`
  ).run(
    req.user.id, tsid ?? null, mode,
    noteTarget ?? null, noteDetected ?? null,
    deviationCents != null ? deviationCents : null,
    stabilitySecs  != null ? stabilitySecs  : 0
  );

  res.json({ ok: true });
});

module.exports = router;
