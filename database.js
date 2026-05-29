const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, 'sonitus.db'));

db.exec('PRAGMA journal_mode=WAL');
db.exec('PRAGMA foreign_keys=ON');

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT    UNIQUE NOT NULL COLLATE NOCASE,
      full_name     TEXT    NOT NULL,
      password_hash TEXT    NOT NULL,
      role          TEXT    NOT NULL DEFAULT 'student' CHECK(role IN ('student','teacher')),
      created_at    TEXT    DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS login_sessions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      login_at   TEXT    DEFAULT (datetime('now')),
      logout_at  TEXT
    );

    CREATE TABLE IF NOT EXISTS tool_sessions (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      login_session_id INTEGER REFERENCES login_sessions(id),
      tool             TEXT    NOT NULL CHECK(tool IN ('studio','academia')),
      start_time       TEXT    DEFAULT (datetime('now')),
      end_time         TEXT,
      duration_seconds INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS tool_events (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      tool_session_id INTEGER NOT NULL REFERENCES tool_sessions(id) ON DELETE CASCADE,
      user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      event_type      TEXT    NOT NULL,
      event_data      TEXT,
      ts              TEXT    DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS interval_attempts (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tool_session_id INTEGER REFERENCES tool_sessions(id),
      interval_name   TEXT    NOT NULL,
      user_answer     TEXT    NOT NULL,
      is_correct      INTEGER NOT NULL DEFAULT 0,
      response_ms     INTEGER,
      ts              TEXT    DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_ts_user ON tool_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_ls_user ON login_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_te_sess ON tool_events(tool_session_id);
    CREATE INDEX IF NOT EXISTS idx_ia_user ON interval_attempts(user_id);
  `);

  // Migration: expand tool_sessions CHECK to include 'intervaltrainer'
  const schema = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='tool_sessions'"
  ).get();
  if (schema && !schema.sql.includes('intervaltrainer')) {
    db.exec(`
      PRAGMA foreign_keys=OFF;
      CREATE TABLE tool_sessions_v2 (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        login_session_id INTEGER REFERENCES login_sessions(id),
        tool             TEXT    NOT NULL CHECK(tool IN ('studio','academia','intervaltrainer','pitchtrainer')),
        start_time       TEXT    DEFAULT (datetime('now')),
        end_time         TEXT,
        duration_seconds INTEGER DEFAULT 0
      );
      INSERT INTO tool_sessions_v2 SELECT * FROM tool_sessions;
      DROP TABLE tool_sessions;
      ALTER TABLE tool_sessions_v2 RENAME TO tool_sessions;
      CREATE INDEX IF NOT EXISTS idx_ts_user ON tool_sessions(user_id);
      PRAGMA foreign_keys=ON;
    `);
    console.log('✓ Schema migrado: tool_sessions incluye intervaltrainer + pitchtrainer');
  } else if (schema && !schema.sql.includes('pitchtrainer')) {
    db.exec(`
      PRAGMA foreign_keys=OFF;
      CREATE TABLE tool_sessions_v3 (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        login_session_id INTEGER REFERENCES login_sessions(id),
        tool             TEXT    NOT NULL CHECK(tool IN ('studio','academia','intervaltrainer','pitchtrainer')),
        start_time       TEXT    DEFAULT (datetime('now')),
        end_time         TEXT,
        duration_seconds INTEGER DEFAULT 0
      );
      INSERT INTO tool_sessions_v3 SELECT * FROM tool_sessions;
      DROP TABLE tool_sessions;
      ALTER TABLE tool_sessions_v3 RENAME TO tool_sessions;
      CREATE INDEX IF NOT EXISTS idx_ts_user ON tool_sessions(user_id);
      PRAGMA foreign_keys=ON;
    `);
    console.log('✓ Schema migrado: tool_sessions incluye pitchtrainer');
  }

  // tap_results table
  db.exec(`
    CREATE TABLE IF NOT EXISTS tap_results (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tool_session_id INTEGER REFERENCES tool_sessions(id),
      bpm             INTEGER NOT NULL DEFAULT 80,
      level           INTEGER NOT NULL DEFAULT 1,
      time_sig        TEXT    NOT NULL DEFAULT '4/4',
      notes_total     INTEGER NOT NULL,
      notes_correct   INTEGER NOT NULL,
      accuracy_pct    INTEGER NOT NULL,
      created_at      TEXT    DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_tr_user ON tap_results(user_id);
  `);

  // pitch_attempts table
  db.exec(`
    CREATE TABLE IF NOT EXISTS pitch_attempts (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tool_session_id INTEGER REFERENCES tool_sessions(id),
      mode            TEXT    NOT NULL CHECK(mode IN ('libre','reto')),
      note_target     TEXT,
      note_detected   TEXT,
      deviation_cents REAL,
      stability_secs  REAL    DEFAULT 0,
      ts              TEXT    DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_pa_user ON pitch_attempts(user_id);
  `);

  // Gamification tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_xp (
      user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      total_xp   INTEGER NOT NULL DEFAULT 0,
      level      TEXT    NOT NULL DEFAULT 'Aprendiz',
      updated_at TEXT    DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS achievements (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      key         TEXT    UNIQUE NOT NULL,
      name        TEXT    NOT NULL,
      description TEXT    NOT NULL,
      icon        TEXT    NOT NULL,
      xp_reward   INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS user_achievements (
      user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      achievement_key TEXT    NOT NULL,
      earned_at       TEXT    DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, achievement_key)
    );

    CREATE TABLE IF NOT EXISTS daily_challenge (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      date        TEXT    UNIQUE NOT NULL,
      tool        TEXT    NOT NULL,
      config_json TEXT    NOT NULL,
      xp_reward   INTEGER NOT NULL DEFAULT 50
    );

    CREATE TABLE IF NOT EXISTS daily_challenge_completion (
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      challenge_id INTEGER NOT NULL REFERENCES daily_challenge(id) ON DELETE CASCADE,
      score        INTEGER NOT NULL DEFAULT 0,
      completed_at TEXT    DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, challenge_id)
    );
  `);

  const seedAchievements = [
    { key: 'primera_sesion', name: 'Primera Práctica',  description: 'Completaste tu primera sesión de práctica', icon: '🎵', xp: 10 },
    { key: 'racha_7',        name: 'Racha de 7 Días',   description: 'Practicaste 7 días consecutivos',           icon: '🔥', xp: 50 },
    { key: 'intervalos_100', name: '100 Intervalos',    description: 'Respondiste 100 preguntas de intervalos',   icon: '🎧', xp: 30 },
    { key: 'precision_90',   name: 'Oído Fino',         description: 'Alcanzaste 90%+ de precisión en intervalos', icon: '👂', xp: 40 },
    { key: 'madrugador',     name: 'Madrugador',        description: 'Practicaste antes de las 9am',              icon: '🌅', xp: 20 },
    { key: 'maestro_nivel',  name: 'Nivel Maestro',     description: 'Alcanzaste el nivel Maestro',               icon: '🏆', xp: 100 },
  ];
  const insertAch = db.prepare(
    'INSERT OR IGNORE INTO achievements (key,name,description,icon,xp_reward) VALUES (?,?,?,?,?)'
  );
  for (const a of seedAchievements) insertAch.run(a.key, a.name, a.description, a.icon, a.xp);

  const hasTeacher = db.prepare("SELECT id FROM users WHERE role='teacher'").get();
  if (!hasTeacher) {
    const pwd = process.env.TEACHER_PASSWORD || 'Sonitus2024!';
    const hash = bcrypt.hashSync(pwd, 10);
    db.prepare('INSERT INTO users (username,full_name,password_hash,role) VALUES (?,?,?,?)').run(
      'profesor', 'Profesor Sonitus', hash, 'teacher'
    );
    console.log(`✓ Cuenta de profesor creada  (usuario: "profesor", contraseña: "${pwd}")`);
  }
}

module.exports = { db, initDb };
