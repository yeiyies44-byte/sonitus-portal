const express = require('express');
const { db } = require('../database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// ── Level thresholds ───────────────────────────────────────────────────────
const LEVELS = [
  { name: 'Aprendiz',   icon: '🌱', min: 0,    nextMin: 200  },
  { name: 'Estudiante', icon: '🎵', min: 200,  nextMin: 600  },
  { name: 'Músico',     icon: '🎸', min: 600,  nextMin: 1200 },
  { name: 'Avanzado',   icon: '🎼', min: 1200, nextMin: 2400 },
  { name: 'Maestro',    icon: '🏆', min: 2400, nextMin: null },
];

function getLevelInfo(xp) {
  const levelIdx = LEVELS.reduce((best, l, i) => (xp >= l.min ? i : best), 0);
  const level = LEVELS[levelIdx];
  const progress = level.nextMin
    ? Math.min(100, Math.round(((xp - level.min) / (level.nextMin - level.min)) * 100))
    : 100;
  return { name: level.name, icon: level.icon, xp, nextLevelXp: level.nextMin, progress };
}

// ── Shared XP helpers (exported for use in other routes) ──────────────────

function ensureXpRow(userId) {
  db.prepare('INSERT OR IGNORE INTO user_xp (user_id,total_xp,level) VALUES (?,0,?)').run(userId, 'Aprendiz');
}

function addXpRaw(userId, amount) {
  ensureXpRow(userId);
  const { total_xp } = db.prepare('SELECT total_xp FROM user_xp WHERE user_id=?').get(userId);
  const newXp = total_xp + amount;
  const li = getLevelInfo(newXp);
  db.prepare("UPDATE user_xp SET total_xp=?,level=?,updated_at=datetime('now') WHERE user_id=?")
    .run(newXp, li.name, userId);
  return { xp: newXp, levelInfo: li };
}

function grantAchievement(userId, key) {
  const already = db.prepare('SELECT 1 FROM user_achievements WHERE user_id=? AND achievement_key=?').get(userId, key);
  if (already) return false;
  db.prepare('INSERT OR IGNORE INTO user_achievements (user_id,achievement_key) VALUES (?,?)').run(userId, key);
  const ach = db.prepare('SELECT xp_reward FROM achievements WHERE key=?').get(key);
  if (ach?.xp_reward > 0) addXpRaw(userId, ach.xp_reward);
  return true;
}

function awardXpWithChecks(userId, amount, reason) {
  const result = addXpRaw(userId, amount);

  // Maestro achievement
  if (result.levelInfo.name === 'Maestro') grantAchievement(userId, 'maestro_nivel');

  if (reason === 'session_complete') {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    // Count completed sessions today (end_time set means tool-end was called)
    const todayCount = db.prepare(
      "SELECT COUNT(*) c FROM tool_sessions WHERE user_id=? AND date(end_time)=? AND end_time IS NOT NULL"
    ).get(userId, today).c;

    if (todayCount === 1) {
      // First session today — check yesterday for streak
      const hadYesterday = db.prepare(
        "SELECT 1 FROM tool_sessions WHERE user_id=? AND date(end_time)=? AND end_time IS NOT NULL LIMIT 1"
      ).get(userId, yesterday);
      if (hadYesterday) addXpRaw(userId, 5);
    }

    // primera_sesion
    const totalSessions = db.prepare(
      'SELECT COUNT(*) c FROM tool_sessions WHERE user_id=? AND end_time IS NOT NULL'
    ).get(userId).c;
    if (totalSessions >= 1) grantAchievement(userId, 'primera_sesion');

    // madrugador
    if (new Date().getHours() < 9) grantAchievement(userId, 'madrugador');

    // racha_7
    if (getStreak(userId) >= 7) grantAchievement(userId, 'racha_7');
  }

  if (reason === 'interval_correct') {
    const ia = db.prepare(
      'SELECT COUNT(*) total, SUM(is_correct) correct FROM interval_attempts WHERE user_id=?'
    ).get(userId);
    if (ia.correct >= 100) grantAchievement(userId, 'intervalos_100');
    if (ia.total >= 20 && (ia.correct / ia.total) >= 0.9) grantAchievement(userId, 'precision_90');
  }

  // Re-read final XP after possible achievement bonuses
  const finalXp = db.prepare('SELECT total_xp FROM user_xp WHERE user_id=?').get(userId).total_xp;
  return { xp: finalXp, levelInfo: getLevelInfo(finalXp) };
}

function getStreak(userId) {
  const dates = db.prepare(`
    SELECT DISTINCT date(end_time) d
    FROM tool_sessions
    WHERE user_id=? AND end_time IS NOT NULL
    ORDER BY d DESC LIMIT 30
  `).all(userId).map(r => r.d);

  if (dates.length === 0) return 0;
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (dates[0] !== today && dates[0] !== yesterday) return 0;

  let streak = 1;
  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(dates[i - 1] + 'T12:00:00Z');
    const curr = new Date(dates[i] + 'T12:00:00Z');
    const diff = Math.round((prev - curr) / 86400000);
    if (diff === 1) streak++;
    else break;
  }
  return streak;
}

function getTodayChallenge() {
  const today = new Date().toISOString().slice(0, 10);
  let ch = db.prepare('SELECT * FROM daily_challenge WHERE date=?').get(today);
  if (!ch) {
    const config = JSON.stringify({
      description: 'Identifica correctamente 5 intervalos en el Entrenador',
      target: 5,
    });
    db.prepare('INSERT OR IGNORE INTO daily_challenge (date,tool,config_json,xp_reward) VALUES (?,?,?,?)').run(today, 'intervaltrainer', config, 12);
    ch = db.prepare('SELECT * FROM daily_challenge WHERE date=?').get(today);
  }
  return ch;
}

// ── Routes ─────────────────────────────────────────────────────────────────

router.get('/status', (req, res) => {
  const userId = req.user.id;
  ensureXpRow(userId);

  const { total_xp } = db.prepare('SELECT total_xp FROM user_xp WHERE user_id=?').get(userId);
  const levelInfo = getLevelInfo(total_xp);

  const badges = db.prepare(`
    SELECT a.key, a.name, a.icon, a.description, ua.earned_at
    FROM user_achievements ua
    JOIN achievements a ON a.key = ua.achievement_key
    WHERE ua.user_id=?
    ORDER BY ua.earned_at ASC
  `).all(userId);

  const streak = getStreak(userId);
  const challenge = getTodayChallenge();
  const completion = db.prepare(
    'SELECT * FROM daily_challenge_completion WHERE user_id=? AND challenge_id=?'
  ).get(userId, challenge.id);

  res.json({
    xp: total_xp,
    level: levelInfo,
    streak,
    badges,
    dailyChallenge: {
      id: challenge.id,
      tool: challenge.tool,
      xp_reward: challenge.xp_reward,
      config: JSON.parse(challenge.config_json),
      completed: !!completion,
    },
  });
});

router.post('/award-xp', (req, res) => {
  const { reason, amount } = req.body ?? {};
  if (!reason || typeof amount !== 'number' || amount <= 0)
    return res.status(400).json({ error: 'reason y amount (número positivo) requeridos' });

  const result = awardXpWithChecks(req.user.id, amount, reason);
  res.json({ ok: true, xp: result.xp, level: result.levelInfo });
});

router.get('/daily-challenge', (req, res) => {
  const challenge = getTodayChallenge();
  const completion = db.prepare(
    'SELECT * FROM daily_challenge_completion WHERE user_id=? AND challenge_id=?'
  ).get(req.user.id, challenge.id);

  res.json({
    id: challenge.id,
    tool: challenge.tool,
    xp_reward: challenge.xp_reward,
    config: JSON.parse(challenge.config_json),
    completed: !!completion,
  });
});

router.post('/complete-challenge', (req, res) => {
  const { score } = req.body ?? {};
  const challenge = getTodayChallenge();
  const userId = req.user.id;

  const already = db.prepare(
    'SELECT 1 FROM daily_challenge_completion WHERE user_id=? AND challenge_id=?'
  ).get(userId, challenge.id);
  if (already) return res.json({ ok: true, alreadyCompleted: true });

  db.prepare(
    'INSERT OR IGNORE INTO daily_challenge_completion (user_id,challenge_id,score) VALUES (?,?,?)'
  ).run(userId, challenge.id, score ?? 0);

  const result = addXpRaw(userId, challenge.xp_reward);
  if (result.levelInfo.name === 'Maestro') grantAchievement(userId, 'maestro_nivel');

  res.json({ ok: true, xpAwarded: challenge.xp_reward, xp: result.xp, level: result.levelInfo });
});

module.exports = { router, awardXpWithChecks, addXpRaw, grantAchievement };
