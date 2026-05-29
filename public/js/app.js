// ── Estado global ──────────────────────────────────────────────────────────
const S = {
  user: null,
  view: 'loading',
  toolSessionId: null,
  toolStart: null,
  heartbeat: null,
  timerInterval: null,
  currentTool: null,
  dailyChallenge: null,
};

// ── API helpers ────────────────────────────────────────────────────────────
const api = {
  async get(path) {
    try {
      const r = await fetch('/api' + path, { credentials: 'include' });
      return r.json();
    } catch { return {}; }
  },
  async post(path, body) {
    try {
      const r = await fetch('/api' + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include',
      });
      return r.json();
    } catch { return {}; }
  },
};

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

function timeAgo(dt) {
  if (!dt) return 'Nunca';
  const diff = Date.now() - new Date(dt + 'Z').getTime();
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

const app = document.getElementById('app');

// ── Vista: Loading ─────────────────────────────────────────────────────────
function showLoading() {
  app.innerHTML = `
    <div id="view-loading">
      <div class="spinner"></div>
      <p style="color:var(--g400);font-size:.875rem;">Cargando...</p>
    </div>`;
}

// ── Vista: Login ───────────────────────────────────────────────────────────
function showLogin(msg = '', isSuccess = false) {
  S.view = 'login';
  app.innerHTML = `
    <div id="view-login">
      <div class="login-box">
        <div class="login-logo"><img src="/logo.jpeg" style="width:42px;height:42px;object-fit:contain;filter:invert(1) brightness(2);" alt="Sonitus" /></div>
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
    const username = document.getElementById('f-user').value.trim();
    const password = document.getElementById('f-pass').value;
    if (!username || !password) return showLogin('Por favor completa todos los campos.');
    const res = await api.post('/auth/login', { username, password });
    if (res.error) return showLogin(res.error);
    S.user = res.user;
    if (res.user.role === 'teacher') { window.location.href = '/admin'; return; }
    loadDashboard();
  });

  document.getElementById('go-reg').addEventListener('click', e => { e.preventDefault(); showRegister(); });
}

// ── Vista: Registro ────────────────────────────────────────────────────────
function showRegister(msg = '') {
  S.view = 'register';
  app.innerHTML = `
    <div id="view-register">
      <div class="login-box">
        <div class="login-logo"><img src="/logo.jpeg" style="width:42px;height:42px;object-fit:contain;filter:invert(1) brightness(2);" alt="Sonitus" /></div>
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
    const username = document.getElementById('r-user').value.trim();
    const password = document.getElementById('r-pass').value;
    if (!fullName || !username || !password) return showRegister('Por favor completa todos los campos.');
    const res = await api.post('/auth/register', { username, fullName, password });
    if (res.error) return showRegister(res.error);
    showLogin('¡Cuenta creada! Ahora puedes iniciar sesión.', true);
  });

  document.getElementById('go-login').addEventListener('click', e => { e.preventDefault(); showLogin(); });
}

// ── Dashboard ──────────────────────────────────────────────────────────────
async function loadDashboard() {
  showLoading();
  const [stats, gami] = await Promise.all([
    api.get('/activity/stats'),
    api.get('/gamification/status'),
  ]);
  if (gami.dailyChallenge) S.dailyChallenge = gami.dailyChallenge;
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
  const streakHtml = streak >= 2
    ? `<span class="streak-tag">😊 ${streak} días</span>`
    : '';
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
  const st = stats.studio;
  const ac = stats.academia;
  const iv = stats.intervaltrainer;
  const ia = stats.intervalAttempts ?? { total: 0, correct: 0 };
  const ivAcc = ia.total > 0 ? Math.round((ia.correct / ia.total) * 100) : null;
  const firstName = escHtml(S.user.fullName.split(' ')[0]);
  const initials  = escHtml(S.user.fullName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase());
  const fullName  = escHtml(S.user.fullName);

  app.innerHTML = `
    <div id="view-dashboard">

      <div class="dash-hd">
        <div class="hd-inner">
          <div class="brand">
            <img src="/logo.jpeg" class="ico" style="width:auto;height:1.5rem;object-fit:contain;filter:invert(1) brightness(2);" alt="" />
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

          <!-- Lectura de Ritmo -->
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

          <!-- Lectura de Notas -->
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

          <!-- Entrenador de Intervalos -->
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
  const res = await api.post('/activity/tool-start', { tool });
  if (!res.toolSessionId) {
    showDashboard({ studio: null, academia: null, intervaltrainer: null });
    return;
  }
  S.toolSessionId = res.toolSessionId;
  S.toolStart = Date.now();
  S.currentTool = tool;
  showToolView(tool);
}

function showToolView(tool) {
  S.view = 'tool';
  const wm = document.getElementById('wm');
  if (wm) wm.style.display = 'none';
  const labels = {
    studio: '🥁 Lectura de Ritmo', academia: '🎼 Lectura de Notas',
    intervaltrainer: '🎧 Entrenador de Intervalos',
  };
  const label = labels[tool] ?? tool;
  const src = `/tools/sonitus-${tool}.html?tsid=${S.toolSessionId}`;

  app.innerHTML = `
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

  S.heartbeat = setInterval(async () => {
    const dur = Math.round((Date.now() - S.toolStart) / 1000);
    await api.post('/activity/tool-end', { toolSessionId: S.toolSessionId, durationSeconds: dur });
  }, 60000);

  document.getElementById('back-btn').addEventListener('click', closeTool);
}

async function closeTool() {
  clearInterval(S.timerInterval);
  clearInterval(S.heartbeat);
  const wm = document.getElementById('wm');
  if (wm) wm.style.display = '';
  const dur = Math.round((Date.now() - S.toolStart) / 1000);
  await api.post('/activity/tool-end', { toolSessionId: S.toolSessionId, durationSeconds: dur });

  // Award session XP and check daily challenge completion in parallel
  const xpCall = api.post('/gamification/award-xp', { reason: 'session_complete', amount: 3 });
  const dc = S.dailyChallenge;
  const challengeCall = (dc && !dc.completed && dc.tool === S.currentTool)
    ? api.post('/gamification/complete-challenge', { score: 0 })
    : Promise.resolve(null);
  await Promise.all([xpCall, challengeCall]);

  S.toolSessionId = null;
  S.toolStart = null;
  S.currentTool = null;
  await loadDashboard();
}

// ── Logout ─────────────────────────────────────────────────────────────────
async function doLogout() {
  clearInterval(S.timerInterval);
  clearInterval(S.heartbeat);
  await api.post('/auth/logout', {});
  S.user = null;
  showLogin();
}

// ── Eventos desde iframe ───────────────────────────────────────────────────
window.addEventListener('message', async e => {
  if (!S.toolSessionId || !e.data?.type) return;
  const { type, data } = e.data;
  if (type === 'TOOL_EVENT' && data) {
    await api.post('/activity/event', {
      toolSessionId: S.toolSessionId,
      eventType: data.type,
      eventData: data,
    });
  }
});

// ── Init ───────────────────────────────────────────────────────────────────
(async function init() {
  showLoading();
  const res = await api.get('/auth/me');
  if (res.user) {
    S.user = res.user;
    if (res.user.role === 'teacher') { window.location.href = '/admin'; return; }
    loadDashboard();
  } else {
    showLogin();
  }
  window.hideSplash?.();
})();
