import { initializeApp }           from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
         signOut, onAuthStateChanged }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, updateDoc, addDoc, collection,
         query, where, getDocs, orderBy, limit, serverTimestamp, increment }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

// ── Init Firebase ──────────────────────────────────────────────────────────
const fbApp  = initializeApp(firebaseConfig);
const auth   = getAuth(fbApp);
const db     = getFirestore(fbApp);

// ── Estado global ──────────────────────────────────────────────────────────
const S = {
  user:          null,
  firestoreUser: null,
  view:          'loading',
  toolSessionId: null,
  toolStart:     null,
  heartbeat:     null,
  timerInterval: null,
  currentTool:   null,
  dailyChallenge: null,
};

// ── Gamificación (client-side) ─────────────────────────────────────────────
const LEVELS = [
  { name: 'Aprendiz',   icon: '🌱', min: 0,    nextMin: 200  },
  { name: 'Estudiante', icon: '🎵', min: 200,  nextMin: 600  },
  { name: 'Músico',     icon: '🎸', min: 600,  nextMin: 1200 },
  { name: 'Avanzado',   icon: '🎼', min: 1200, nextMin: 2400 },
  { name: 'Maestro',    icon: '🏆', min: 2400, nextMin: null },
];

const ACHIEVEMENTS = [
  { key: 'primera_sesion', name: 'Primera Sesión', icon: '🎯', description: 'Completa tu primera sesión', xp: 20 },
  { key: 'madrugador',     name: 'Madrugador',     icon: '🌅', description: 'Practica antes de las 9am',  xp: 30 },
  { key: 'racha_7',        name: 'Racha de 7 días', icon: '🔥', description: '7 días seguidos practicando', xp: 70 },
  { key: 'intervalos_100', name: 'Centenario',      icon: '💯', description: '100 intervalos correctos',  xp: 50 },
  { key: 'precision_90',   name: 'Precisión 90%',   icon: '🎯', description: '90% de precisión en intervalos', xp: 40 },
  { key: 'maestro_nivel',  name: 'Maestro',         icon: '🏆', description: 'Alcanzar el nivel Maestro', xp: 0  },
];

const CHALLENGE_POOL = [
  { tool: 'intervaltrainer', description: 'Identifica correctamente 5 intervalos en el Entrenador', target: 5,  xp: 50 },
  { tool: 'intervaltrainer', description: 'Acierta 8 intervalos seguidos en el Entrenador',          target: 8,  xp: 70 },
  { tool: 'intervaltrainer', description: 'Responde correctamente 10 intervalos hoy',                target: 10, xp: 80 },
  { tool: 'studio',          description: 'Completa una sesión de Lectura de Ritmo hoy',             target: 1,  xp: 40 },
  { tool: 'studio',          description: 'Practica Lectura de Ritmo por al menos 5 minutos',        target: 1,  xp: 45 },
  { tool: 'academia',        description: 'Practica Lectura de Notas hoy',                           target: 1,  xp: 40 },
  { tool: 'academia',        description: 'Completa una sesión de Lectura de Notas de 10 minutos',   target: 1,  xp: 55 },
];

function getLevelInfo(xp) {
  const idx = LEVELS.reduce((best, l, i) => (xp >= l.min ? i : best), 0);
  const level = LEVELS[idx];
  const progress = level.nextMin
    ? Math.min(100, Math.round(((xp - level.min) / (level.nextMin - level.min)) * 100))
    : 100;
  return { name: level.name, icon: level.icon, xp, nextLevelXp: level.nextMin, progress };
}

function getLocalDate() {
  const now = new Date();
  if (now.getHours() < 8) now.setDate(now.getDate() - 1);
  return now.toISOString().slice(0, 10);
}

function getTodayChallenge() {
  const today = getLocalDate();
  const seed  = parseInt(today.replace(/-/g, ''), 10);
  const pick  = CHALLENGE_POOL[seed % CHALLENGE_POOL.length];
  return { date: today, tool: pick.tool, xp_reward: pick.xp, config: { description: pick.description, target: pick.target } };
}

// ── Firestore helpers ──────────────────────────────────────────────────────
function userRef(uid)    { return doc(db, 'users', uid); }
function sessionsCol(uid){ return collection(db, 'users', uid, 'sessions'); }
function attemptsCol(uid){ return collection(db, 'users', uid, 'intervalAttempts'); }
function achievCol(uid)  { return collection(db, 'users', uid, 'achievements'); }
function chalCol(uid)    { return collection(db, 'users', uid, 'challengeCompletions'); }

async function getUserData(uid) {
  const snap = await getDoc(userRef(uid));
  return snap.exists() ? snap.data() : null;
}

async function awardXp(uid, amount, reason) {
  const userData = await getUserData(uid);
  if (!userData) return;
  const newXp    = (userData.xp || 0) + amount;
  const levelInfo = getLevelInfo(newXp);
  await updateDoc(userRef(uid), { xp: newXp, level: levelInfo.name });
  if (levelInfo.name === 'Maestro') await grantAchievement(uid, 'maestro_nivel');

  if (reason === 'session_complete') {
    const today = new Date().toISOString().slice(0, 10);
    const q = query(sessionsCol(uid), where('endTime', '!=', null), orderBy('endTime', 'desc'), limit(30));
    const snap = await getDocs(q);
    const dates = [...new Set(snap.docs.map(d => d.data().endTime?.toDate?.().toISOString().slice(0, 10)).filter(Boolean))];
    const streak = calcStreak(dates);
    await updateDoc(userRef(uid), { streak });
    if (streak >= 7) await grantAchievement(uid, 'racha_7');
    const totalSessions = snap.docs.filter(d => d.data().endTime).length;
    if (totalSessions >= 1) await grantAchievement(uid, 'primera_sesion');
    if (new Date().getHours() < 9) await grantAchievement(uid, 'madrugador');
  }
  if (reason === 'interval_correct') {
    const snap = await getDocs(attemptsCol(uid));
    const total   = snap.size;
    const correct = snap.docs.filter(d => d.data().isCorrect).length;
    if (correct >= 100) await grantAchievement(uid, 'intervalos_100');
    if (total >= 20 && (correct / total) >= 0.9) await grantAchievement(uid, 'precision_90');
  }
}

function calcStreak(sortedDates) {
  if (!sortedDates.length) return 0;
  const today     = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (sortedDates[0] !== today && sortedDates[0] !== yesterday) return 0;
  let streak = 1;
  for (let i = 1; i < sortedDates.length; i++) {
    const prev = new Date(sortedDates[i - 1] + 'T12:00:00Z');
    const curr = new Date(sortedDates[i]     + 'T12:00:00Z');
    if (Math.round((prev - curr) / 86400000) === 1) streak++;
    else break;
  }
  return streak;
}

async function grantAchievement(uid, key) {
  const ref  = doc(achievCol(uid), key);
  const snap = await getDoc(ref);
  if (snap.exists()) return;
  const ach = ACHIEVEMENTS.find(a => a.key === key);
  if (!ach) return;
  await setDoc(ref, { key, name: ach.name, icon: ach.icon, description: ach.description, earnedAt: serverTimestamp() });
  if (ach.xp > 0) {
    const userData = await getUserData(uid);
    const newXp = (userData?.xp || 0) + ach.xp;
    await updateDoc(userRef(uid), { xp: newXp, level: getLevelInfo(newXp).name });
  }
}

// ── Utilidades ─────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function fmtDuration(s) {
  if (!s || s < 1) return '—';
  if (s < 60) return `${s}s`;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}
function timeAgo(ts) {
  if (!ts) return 'Nunca';
  const date = ts?.toDate ? ts.toDate() : new Date(ts);
  const diff = Date.now() - date.getTime();
  const m = Math.floor(diff / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (d > 0) return d === 1 ? 'Ayer' : `Hace ${d} días`;
  if (h > 0) return h === 1 ? 'Hace 1 hora' : `Hace ${h}h`;
  if (m > 0) return m === 1 ? 'Hace 1 min' : `Hace ${m} min`;
  return 'Hace un momento';
}
function fmtTimer(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
}

const appEl = document.getElementById('app');

// ── Vista: Loading ─────────────────────────────────────────────────────────
function showLoading() {
  appEl.innerHTML = `
    <div id="view-loading">
      <div class="spinner"></div>
      <p style="color:var(--g400);font-size:.875rem;">Cargando...</p>
    </div>`;
}

// ── Vista: Login ───────────────────────────────────────────────────────────
function showLogin(msg = '', isSuccess = false) {
  S.view = 'login';
  appEl.innerHTML = `
    <div id="view-login">
      <div class="login-box">
        <div class="login-logo"><img src="logo.jpeg" style="width:42px;height:42px;object-fit:contain;filter:invert(1) brightness(2);" alt="Sonitus" /></div>
        <h1 class="login-title">Sonitus Portal</h1>
        <p class="login-subtitle">Herramientas Educativas de Música</p>

        ${msg ? `<div class="alert ${isSuccess ? 'alert-ok' : 'alert-err'}">${msg}</div>` : ''}

        <form id="login-form" style="display:flex;flex-direction:column;gap:14px;">
          <div class="f-group">
            <label class="f-label">Usuario</label>
            <input id="f-user" type="text" class="f-input" placeholder="tu nombre de usuario" autocomplete="username" />
          </div>
          <div class="f-group">
            <label class="f-label">Contraseña</label>
            <input id="f-pass" type="password" class="f-input" placeholder="••••••" autocomplete="current-password" />
          </div>
          <button type="submit" class="btn btn-blue btn-full" style="margin-top:4px;">Iniciar Sesión</button>
        </form>

        <p style="text-align:center;color:var(--g400);font-size:.875rem;margin-top:20px;">
          ¿Sin cuenta?
          <a href="#" id="go-reg" style="color:var(--blue);font-weight:600;text-decoration:none;">Regístrate aquí</a>
        </p>
      </div>
    </div>`;

  document.getElementById('f-user').focus();
  document.getElementById('login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const username = document.getElementById('f-user').value.trim().toLowerCase();
    const password = document.getElementById('f-pass').value;
    if (!username || !password) return showLogin('Por favor completa todos los campos.');
    try {
      const cred = await signInWithEmailAndPassword(auth, `${username}@sonitus.portal`, password);
      const userData = await getUserData(cred.user.uid);
      S.user = { id: cred.user.uid, username: userData.username, fullName: userData.fullName, role: userData.role };
      S.firestoreUser = userData;
      if (userData.role === 'teacher') { window.location.href = 'admin.html'; return; }
      loadDashboard();
    } catch (err) {
      const msg = err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found'
        ? 'Usuario o contraseña incorrectos'
        : 'Error al iniciar sesión. Intenta de nuevo.';
      showLogin(msg);
    }
  });
  document.getElementById('go-reg').addEventListener('click', e => { e.preventDefault(); showRegister(); });
}

// ── Vista: Registro ────────────────────────────────────────────────────────
function showRegister(msg = '') {
  S.view = 'register';
  appEl.innerHTML = `
    <div id="view-register">
      <div class="login-box">
        <div class="login-logo"><img src="logo.jpeg" style="width:42px;height:42px;object-fit:contain;filter:invert(1) brightness(2);" alt="Sonitus" /></div>
        <h1 class="login-title">Sonitus Portal</h1>
        <p class="login-subtitle">Crear cuenta de alumno</p>

        ${msg ? `<div class="alert alert-err">${msg}</div>` : ''}

        <form id="reg-form" style="display:flex;flex-direction:column;gap:14px;">
          <div class="f-group">
            <label class="f-label">Nombre completo</label>
            <input id="r-name" type="text" class="f-input" placeholder="Tu nombre" autocomplete="name" />
          </div>
          <div class="f-group">
            <label class="f-label">Usuario</label>
            <input id="r-user" type="text" class="f-input" placeholder="sin espacios, ej: juan123" autocomplete="username" />
          </div>
          <div class="f-group">
            <label class="f-label">Contraseña</label>
            <input id="r-pass" type="password" class="f-input" placeholder="Mínimo 6 caracteres" autocomplete="new-password" />
          </div>
          <button type="submit" class="btn btn-blue btn-full" style="margin-top:4px;">Crear Cuenta</button>
        </form>

        <p style="text-align:center;color:var(--g400);font-size:.875rem;margin-top:20px;">
          ¿Ya tienes cuenta?
          <a href="#" id="go-login" style="color:var(--blue);font-weight:600;text-decoration:none;">Inicia sesión</a>
        </p>
      </div>
    </div>`;

  document.getElementById('r-name').focus();
  document.getElementById('reg-form').addEventListener('submit', async e => {
    e.preventDefault();
    const fullName = document.getElementById('r-name').value.trim();
    const username = document.getElementById('r-user').value.trim().toLowerCase();
    const password = document.getElementById('r-pass').value;
    if (!fullName || !username || !password) return showRegister('Por favor completa todos los campos.');
    if (password.length < 6) return showRegister('La contraseña debe tener mínimo 6 caracteres.');
    if (username === 'profesor') return showRegister('Ese nombre de usuario está reservado.');

    try {
      const cred = await createUserWithEmailAndPassword(auth, `${username}@sonitus.portal`, password);
      await setDoc(userRef(cred.user.uid), {
        username, fullName, role: 'student',
        xp: 0, level: 'Aprendiz', streak: 0,
        createdAt: serverTimestamp(), lastActivity: serverTimestamp(),
      });
      await signOut(auth);
      showLogin('¡Cuenta creada! Ahora puedes iniciar sesión.', true);
    } catch (err) {
      const msg = err.code === 'auth/email-already-in-use'
        ? 'Ese nombre de usuario ya está en uso.'
        : 'Error al crear la cuenta. Intenta de nuevo.';
      showRegister(msg);
    }
  });
  document.getElementById('go-login').addEventListener('click', e => { e.preventDefault(); showLogin(); });
}

// ── Dashboard ──────────────────────────────────────────────────────────────
async function loadDashboard() {
  showLoading();
  const uid = S.user.id;

  const [sessSnap, attSnap, achSnap] = await Promise.all([
    getDocs(query(sessionsCol(uid), orderBy('startTime', 'desc'), limit(100))),
    getDocs(attemptsCol(uid)),
    getDocs(achievCol(uid)),
  ]);

  const sessions  = sessSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const attempts  = attSnap.docs.map(d => d.data());
  const badges    = achSnap.docs.map(d => d.data()).sort((a, b) => a.earnedAt?.seconds - b.earnedAt?.seconds);

  const toolStats = {};
  for (const tool of ['studio', 'academia', 'intervaltrainer']) {
    const ts = sessions.filter(s => s.tool === tool && s.durationSeconds > 0);
    toolStats[tool] = ts.length
      ? { sessions: ts.length, total_seconds: ts.reduce((a, s) => a + (s.durationSeconds || 0), 0), last_used: ts[0]?.startTime }
      : null;
  }

  const userData = await getUserData(uid);
  S.firestoreUser = userData;
  const xp       = userData?.xp || 0;
  const levelInfo = getLevelInfo(xp);
  const streak    = userData?.streak || 0;

  const challenge    = getTodayChallenge();
  const chalRef      = doc(chalCol(uid), challenge.date);
  const chalSnap     = await getDoc(chalRef);
  challenge.completed = chalSnap.exists();
  S.dailyChallenge   = challenge;

  const ivTotal   = attempts.length;
  const ivCorrect = attempts.filter(a => a.isCorrect).length;

  const stats = {
    studio: toolStats.studio, academia: toolStats.academia,
    intervaltrainer: toolStats.intervaltrainer,
    intervalAttempts: { total: ivTotal, correct: ivCorrect },
  };
  const gami = { level: levelInfo, badges, streak, dailyChallenge: challenge };
  showDashboard(stats, gami);
}

function renderXpPanel(gami) {
  if (!gami?.level) return '';
  const { level, badges = [], streak } = gami;
  const xpText = level.nextLevelXp
    ? `${level.xp} / ${level.nextLevelXp} XP`
    : `${level.xp} XP`;
  const badgesHtml = badges.length > 0
    ? `<div class="badges-row">${badges.map(b =>
        `<span class="badge-icon" data-tip="${escHtml(b.name)}: ${escHtml(b.description)}">${escHtml(b.icon)}</span>`
      ).join('')}</div>`
    : '';
  const streakHtml = streak >= 2 ? `<span class="streak-tag">😊 ${streak} días</span>` : '';
  return `
    <div class="xp-panel">
      <div class="xp-level">
        <span class="xp-level-icon">${level.icon}</span>
        <span class="xp-level-name">${level.name}</span>
        <span class="xp-points">${xpText}</span>
        ${streakHtml}
      </div>
      <div class="xp-bar-bg"><div class="xp-bar-fill" style="width:${level.progress}%"></div></div>
      ${badgesHtml}
    </div>`;
}

function renderDailyCard(gami) {
  if (!gami?.dailyChallenge) return '';
  const { dailyChallenge: ch } = gami;
  const action = ch.completed
    ? `<div class="dc-done">✅ ¡Completado hoy!</div>`
    : `<button class="btn-open rhythm open-tool" data-tool="${ch.tool}">Abrir →</button>`;
  return `
    <div class="daily-card">
      <div class="dc-header">
        <span>🎯 Desafío del Día</span>
        <span class="dc-xp">+${ch.xp_reward} XP</span>
      </div>
      <p class="dc-desc">${escHtml(ch.config.description)}</p>
      ${action}
    </div>`;
}

function showDashboard(stats, gami) {
  S.view = 'dashboard';
  const st  = stats.studio;
  const ac  = stats.academia;
  const iv  = stats.intervaltrainer;
  const ia  = stats.intervalAttempts ?? { total: 0, correct: 0 };
  const ivAcc = ia.total > 0 ? Math.round((ia.correct / ia.total) * 100) : null;
  const firstName = escHtml(S.user.fullName.split(' ')[0]);
  const initials  = escHtml(S.user.fullName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase());
  const fullName  = escHtml(S.user.fullName);

  appEl.innerHTML = `
    <div id="view-dashboard">
      <div class="dash-hd">
        <div class="hd-inner">
          <div class="brand">
            <img src="logo.jpeg" class="ico" style="width:auto;height:1.5rem;object-fit:contain;filter:invert(1) brightness(2);" alt="" />
            <div>
              <div class="name">Sonitus Portal</div>
              <div class="sub">Herramientas Educativas</div>
            </div>
          </div>
          <div class="hd-user">
            <div class="avatar">${initials}</div>
            <span class="hd-uname">${fullName}</span>
            <button class="btn-out" id="logout-btn">Salir</button>
          </div>
        </div>
      </div>

      <div class="dash-body">
        <div class="dash-greeting">
          <h2>¡Hola, ${firstName}!</h2>
          <p>Elige tu herramienta para comenzar a practicar</p>
        </div>

        ${renderXpPanel(gami)}
        ${renderDailyCard(gami)}

        <div class="tool-grid">
          <div class="tool-card">
            <div class="tool-icon rhythm">🥁</div>
            <span class="tool-badge rhythm">Práctica</span>
            <div class="tool-name">Lectura de Ritmo</div>
            <div class="tool-desc">Genera ejercicios de lectura rítmica a primera vista con retroalimentación de audio instantánea.</div>
            <div class="tool-meta">
              <span>⏱ ${st ? fmtDuration(st.total_seconds) : '—'}</span>
              <span>📅 ${st ? timeAgo(st.last_used) : 'Nunca'}</span>
              <span>🎯 ${st ? st.sessions : 0} ses.</span>
            </div>
            <button class="btn-open rhythm open-tool" data-tool="studio">Abrir →</button>
          </div>

          <div class="tool-card">
            <div class="tool-icon notes">🎼</div>
            <span class="tool-badge notes">Teoría</span>
            <div class="tool-name">Lectura de Notas</div>
            <div class="tool-desc">Lectura musical a primera vista con teoría, entrenamiento auditivo y ejercicios progresivos.</div>
            <div class="tool-meta">
              <span>⏱ ${ac ? fmtDuration(ac.total_seconds) : '—'}</span>
              <span>📅 ${ac ? timeAgo(ac.last_used) : 'Nunca'}</span>
              <span>🎯 ${ac ? ac.sessions : 0} ses.</span>
            </div>
            <button class="btn-open notes open-tool" data-tool="academia">Abrir →</button>
          </div>

          <div class="tool-card">
            <div class="tool-icon intervals">🎧</div>
            <span class="tool-badge intervals">Oído</span>
            <div class="tool-name">Intervalos</div>
            <div class="tool-desc">Entrena tu oído identificando intervalos musicales: desde el unísono hasta la octava.</div>
            <div class="tool-meta">
              <span>⏱ ${iv ? fmtDuration(iv.total_seconds) : '—'}</span>
              <span>🎯 ${ia.total > 0 ? `${ivAcc}% prec.` : 'Sin datos'}</span>
              <span>📝 ${ia.total} intentos</span>
            </div>
            <button class="btn-open intervals open-tool" data-tool="intervaltrainer">Abrir →</button>
          </div>
        </div>
      </div>
    </div>`;

  document.getElementById('logout-btn').addEventListener('click', doLogout);
  document.querySelectorAll('.open-tool').forEach(btn => {
    btn.addEventListener('click', () => openTool(btn.dataset.tool));
  });
}

// ── Abrir herramienta ──────────────────────────────────────────────────────
async function openTool(tool) {
  showLoading();
  const ref = await addDoc(sessionsCol(S.user.id), {
    tool, startTime: serverTimestamp(), endTime: null, durationSeconds: 0,
  });
  S.toolSessionId = ref.id;
  S.toolStart     = Date.now();
  S.currentTool   = tool;
  showToolView(tool);
}

function showToolView(tool) {
  S.view = 'tool';
  const labels = {
    studio: '🥁 Lectura de Ritmo', academia: '🎼 Lectura de Notas',
    intervaltrainer: '🎧 Entrenador de Intervalos',
  };
  const label = labels[tool] ?? tool;
  const src   = `tools/sonitus-${tool}.html?tsid=${S.toolSessionId}`;

  appEl.innerHTML = `
    <div id="view-tool">
      <div class="tool-hd">
        <div class="tool-hd-left">
          <button class="btn-back" id="back-btn">← Volver</button>
          <span class="tool-hd-name">${label}</span>
        </div>
        <div class="tool-hd-right">
          <span style="font-size:.75rem;opacity:.7;">Tiempo:</span>
          <span class="tool-timer" id="tool-timer">00:00:00</span>
        </div>
      </div>
      <iframe id="tool-frame"
        src="${src}"
        allow="autoplay; microphone; midi; web-midi-api; camera"></iframe>
    </div>`;

  let elapsed = 0;
  S.timerInterval = setInterval(() => {
    elapsed = Math.round((Date.now() - S.toolStart) / 1000);
    const el = document.getElementById('tool-timer');
    if (el) el.textContent = fmtTimer(elapsed);
  }, 1000);

  S.heartbeat = setInterval(() => saveSessionDuration(), 60000);
  document.getElementById('back-btn').addEventListener('click', closeTool);
}

async function saveSessionDuration() {
  if (!S.toolSessionId) return;
  const dur = Math.round((Date.now() - S.toolStart) / 1000);
  await updateDoc(doc(sessionsCol(S.user.id), S.toolSessionId), {
    endTime: serverTimestamp(), durationSeconds: dur,
  });
}

async function closeTool() {
  clearInterval(S.timerInterval);
  clearInterval(S.heartbeat);
  await saveSessionDuration();

  const uid = S.user.id;
  await awardXp(uid, 3, 'session_complete');

  const dc = S.dailyChallenge;
  if (dc && !dc.completed && dc.tool === S.currentTool) {
    const chalRef = doc(chalCol(uid), dc.date);
    const already = await getDoc(chalRef);
    if (!already.exists()) {
      await setDoc(chalRef, { challengeDate: dc.date, completedAt: serverTimestamp(), score: 0 });
      await awardXp(uid, dc.xp_reward, 'challenge_complete');
    }
  }

  S.toolSessionId = null;
  S.toolStart     = null;
  S.currentTool   = null;
  await loadDashboard();
}

// ── Logout ─────────────────────────────────────────────────────────────────
async function doLogout() {
  clearInterval(S.timerInterval);
  clearInterval(S.heartbeat);
  await signOut(auth);
  S.user = null;
  showLogin();
}

// ── Eventos desde iframe (interval attempts) ───────────────────────────────
window.addEventListener('message', async e => {
  if (!S.user || !e.data?.type) return;
  const { type, data } = e.data;
  if (type === 'INTERVAL_ATTEMPT' && data) {
    await addDoc(attemptsCol(S.user.id), {
      intervalName: data.intervalName,
      userAnswer:   data.userAnswer,
      isCorrect:    !!data.isCorrect,
      responseMs:   data.responseMs ?? null,
      createdAt:    serverTimestamp(),
    });
    if (data.isCorrect) await awardXp(S.user.id, 1, 'interval_correct');
  }
  if (type === 'TOOL_EVENT') {
    // events logged to the session doc
  }
});

// ── Init ───────────────────────────────────────────────────────────────────
onAuthStateChanged(auth, async fbUser => {
  if (fbUser) {
    const userData = await getUserData(fbUser.uid);
    if (!userData) { await signOut(auth); showLogin(); return; }
    S.user = { id: fbUser.uid, username: userData.username, fullName: userData.fullName, role: userData.role };
    S.firestoreUser = userData;
    if (userData.role === 'teacher') { window.location.href = 'admin.html'; return; }
    loadDashboard();
  } else {
    showLogin();
  }
  window.hideSplash?.();
});
