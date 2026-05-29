import { initializeApp }      from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword, signOut, onAuthStateChanged }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, getDocs, collection,
         query, orderBy, serverTimestamp, deleteDoc, where }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const fbApp = initializeApp(firebaseConfig);
const auth  = getAuth(fbApp);
const db    = getFirestore(fbApp);

// ── Helpers ────────────────────────────────────────────────────────────────
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
  if (d > 0) return d === 1 ? 'Ayer' : `Hace ${d}d`;
  if (h > 0) return `Hace ${h}h`;
  if (m > 0) return `Hace ${m}min`;
  return 'Ahora';
}
function fmtDate(ts) {
  if (!ts) return '—';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' });
}
function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2800);
}

const LEVELS = [
  { name: 'Aprendiz',   min: 0,    next: 200  },
  { name: 'Estudiante', min: 200,  next: 600  },
  { name: 'Músico',     min: 600,  next: 1200 },
  { name: 'Avanzado',   min: 1200, next: 2400 },
  { name: 'Maestro',    min: 2400, next: null },
];

const appEl = document.getElementById('app');

// ── Render principal ───────────────────────────────────────────────────────
async function renderAdmin(teacherData) {
  appEl.innerHTML = `<div class="loading-screen"><div class="spinner"></div></div>`;

  const usersSnap = await getDocs(collection(db, 'users'));
  const students  = [];
  const ranking   = [];

  for (const userDoc of usersSnap.docs) {
    const u = userDoc.data();
    if (u.role !== 'student') continue;
    const uid = userDoc.id;

    const [sessSnap, attSnap] = await Promise.all([
      getDocs(collection(db, 'users', uid, 'sessions')),
      getDocs(collection(db, 'users', uid, 'intervalAttempts')),
    ]);

    const sessions  = sessSnap.docs.map(d => d.data());
    const attempts  = attSnap.docs.map(d => d.data());
    const ivTotal   = attempts.length;
    const ivCorrect = attempts.filter(a => a.isCorrect).length;

    const lastSession = sessions
      .filter(s => s.startTime)
      .sort((a, b) => (b.startTime?.seconds || 0) - (a.startTime?.seconds || 0))[0];

    students.push({
      id:                uid,
      username:          u.username,
      full_name:         u.fullName,
      xp:                u.xp || 0,
      level:             u.level || 'Aprendiz',
      last_login:        lastSession?.startTime ?? null,
      total_sessions:    sessions.length,
      studio_seconds:    sessions.filter(s => s.tool === 'studio').reduce((a, s) => a + (s.durationSeconds || 0), 0),
      academia_seconds:  sessions.filter(s => s.tool === 'academia').reduce((a, s) => a + (s.durationSeconds || 0), 0),
      interval_seconds:  sessions.filter(s => s.tool === 'intervaltrainer').reduce((a, s) => a + (s.durationSeconds || 0), 0),
      total_seconds:     sessions.reduce((a, s) => a + (s.durationSeconds || 0), 0),
      interval_attempts: ivTotal,
      interval_correct:  ivCorrect,
    });

    ranking.push({ id: uid, username: u.username, full_name: u.fullName, total_xp: u.xp || 0, level: u.level || 'Aprendiz' });
  }

  ranking.sort((a, b) => b.total_xp - a.total_xp);
  students.sort((a, b) => (b.last_login?.seconds || 0) - (a.last_login?.seconds || 0));

  const totalSeconds = students.reduce((a, s) => a + s.total_seconds, 0);
  const ivTotal      = students.reduce((a, s) => a + s.interval_attempts, 0);
  const ivCorrect    = students.reduce((a, s) => a + s.interval_correct, 0);
  const ivAccPct     = ivTotal > 0 ? Math.round((ivCorrect / ivTotal) * 100) : '—';

  const teacherName = escHtml(teacherData?.fullName || 'Profesor');

  const statCards = [
    { ico: '👥', label: 'Alumnos',           value: students.length },
    { ico: '⏱',  label: 'Tiempo acumulado',  value: fmtDuration(totalSeconds) },
    { ico: '🎧', label: 'Intervalos (prec.)', value: ivTotal > 0 ? `${ivAccPct}%` : '—' },
    { ico: '🥁', label: 'Sesiones Ritmo',    value: students.reduce((a, s) => a + (s.studio_seconds > 0 ? 1 : 0), 0) },
    { ico: '🎼', label: 'Sesiones Notas',    value: students.reduce((a, s) => a + (s.academia_seconds > 0 ? 1 : 0), 0) },
  ];

  appEl.innerHTML = `
    <div>
      <div class="admin-hd">
        <div class="hd-inner">
          <div class="brand">
            <img src="logo.jpeg" class="ico" style="width:auto;height:1.5rem;object-fit:contain;filter:invert(1) brightness(2);" alt="" />
            <div>
              <div style="display:flex;align-items:center;gap:8px;">
                <span class="name">Sonitus Portal</span>
                <span class="admin-tag">Profesor</span>
              </div>
              <div class="sub">Panel de Actividad</div>
            </div>
          </div>
          <div class="hd-right">
            <span class="hd-name">${teacherName}</span>
            <button class="btn-out" id="logout-btn">Salir</button>
          </div>
        </div>
      </div>

      <div class="admin-body">

        <div class="stats">
          ${statCards.map(c => `
            <div class="stat">
              <div class="stat-ico">${c.ico}</div>
              <div class="stat-val">${c.value}</div>
              <div class="stat-lbl">${escHtml(String(c.label))}</div>
            </div>
          `).join('')}
        </div>

        ${ranking.length > 0 ? `
        <div class="card" style="margin-bottom:16px;">
          <div class="card-hd">
            <span class="card-title">🏆 Ranking XP</span>
            <span class="card-sub">${ranking.length} alumnos</span>
          </div>
          <div class="overflow-x">
            <table class="data-table">
              <thead><tr><th style="width:48px;">#</th><th>Alumno</th><th>Nivel</th><th style="min-width:180px;">XP</th></tr></thead>
              <tbody>
                ${ranking.map((r, i) => {
                  const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;
                  const lvl   = LEVELS.slice().reverse().find(l => r.total_xp >= l.min) || LEVELS[0];
                  const pct   = lvl.next ? Math.min(100, Math.round(((r.total_xp - lvl.min) / (lvl.next - lvl.min)) * 100)) : 100;
                  const color = i === 0 ? '#f59e0b' : i === 1 ? '#94a3b8' : i === 2 ? '#cd7c4f' : 'var(--green)';
                  return `
                    <tr>
                      <td style="font-size:1.25rem;text-align:center;">${medal}</td>
                      <td>
                        <div style="font-weight:600;">${escHtml(r.full_name)}</div>
                        <div style="font-size:.75rem;color:var(--g400);">@${escHtml(r.username)}</div>
                      </td>
                      <td style="font-weight:600;color:var(--g600);">${escHtml(r.level)}</td>
                      <td>
                        <div style="display:flex;align-items:center;gap:10px;">
                          <div style="flex:1;height:6px;background:var(--g200);border-radius:3px;min-width:80px;">
                            <div style="width:${pct}%;height:100%;background:${color};border-radius:3px;"></div>
                          </div>
                          <span style="font-weight:700;color:${color};min-width:54px;">${r.total_xp} XP</span>
                        </div>
                      </td>
                    </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
        ` : ''}

        <div class="card">
          <div class="card-hd">
            <div style="display:flex;align-items:center;gap:8px;">
              <span class="card-title">Alumnos</span>
              <span class="card-sub">(${students.length})</span>
            </div>
            <button id="add-btn" class="btn btn-blue btn-sm">+ Agregar alumno</button>
          </div>

          ${students.length === 0 ? `
            <div class="empty">
              <div class="ico">👋</div>
              <p>Aún no hay alumnos registrados.</p>
              <p class="sub">Los alumnos pueden registrarse desde la pantalla principal.</p>
            </div>
          ` : `
            <div class="overflow-x">
              <table class="data-table">
                <thead>
                  <tr><th>Alumno</th><th>Última sesión</th><th>🥁 Ritmo</th><th>🎼 Notas</th><th>🎧 Intervalos</th><th>Total</th><th></th></tr>
                </thead>
                <tbody>
                  ${students.map(s => `
                    <tr class="student-row" data-id="${s.id}">
                      <td>
                        <div style="font-weight:600;">${escHtml(s.full_name)}</div>
                        <div style="font-size:.75rem;color:var(--g400);">@${escHtml(s.username)}</div>
                      </td>
                      <td>${timeAgo(s.last_login)}</td>
                      <td style="font-weight:600;color:var(--green);">${fmtDuration(s.studio_seconds)}</td>
                      <td style="font-weight:600;color:#2563eb;">${fmtDuration(s.academia_seconds)}</td>
                      <td style="font-weight:600;color:#7c3aed;">${s.interval_attempts > 0 ? Math.round((s.interval_correct / s.interval_attempts) * 100) + '%' : '—'}</td>
                      <td style="font-weight:600;">${fmtDuration(s.total_seconds)}</td>
                      <td>
                        <button class="delete-btn" data-id="${s.id}" data-name="${escHtml(s.full_name)}"
                          style="background:none;border:none;cursor:pointer;font-size:1.25rem;color:var(--g300);transition:color .2s;"
                          onmouseover="this.style.color='var(--red)'" onmouseout="this.style.color='var(--g300)'"
                          title="Eliminar alumno">×</button>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>

      </div>
    </div>

    <div id="detail-modal" class="modal-bg">
      <div class="modal-box modal-box-wide">
        <div class="modal-hd">
          <h3 id="detail-title"></h3>
          <button class="modal-close" id="detail-close">×</button>
        </div>
        <div class="modal-body" id="detail-body"></div>
      </div>
    </div>

    <div id="add-modal" class="modal-bg">
      <div class="modal-box">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
          <h3 style="font-size:1rem;font-weight:700;">Agregar Alumno</h3>
          <button class="modal-close" id="add-close">×</button>
        </div>
        <form id="add-form">
          <div class="f-group">
            <label class="f-label">Nombre completo</label>
            <input id="a-name" type="text" class="f-input" placeholder="María González" />
          </div>
          <div class="f-group">
            <label class="f-label">Usuario</label>
            <input id="a-user" type="text" class="f-input" placeholder="maria123" />
          </div>
          <div class="f-group">
            <label class="f-label">Contraseña inicial</label>
            <input id="a-pass" type="text" class="f-input" placeholder="mínimo 6 caracteres" />
          </div>
          <div id="add-err" class="f-err"></div>
          <button type="submit" class="btn btn-admin btn-full" style="margin-top:4px;">Crear Alumno</button>
        </form>
      </div>
    </div>`;

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await signOut(auth);
    window.location.href = 'index.html';
  });

  document.getElementById('add-btn').addEventListener('click', () => {
    document.getElementById('add-modal').classList.add('open');
    document.getElementById('a-name').focus();
  });
  document.getElementById('add-close').addEventListener('click', () => {
    document.getElementById('add-modal').classList.remove('open');
  });

  document.getElementById('add-form').addEventListener('submit', async e => {
    e.preventDefault();
    const fullName = document.getElementById('a-name').value.trim();
    const username = document.getElementById('a-user').value.trim().toLowerCase();
    const password = document.getElementById('a-pass').value;
    const errEl    = document.getElementById('add-err');
    errEl.style.display = 'none';

    if (!fullName || !username || !password) {
      errEl.textContent = 'Por favor completa todos los campos.';
      errEl.style.display = 'block';
      return;
    }

    try {
      const cred = await createUserWithEmailAndPassword(auth, `${username}@sonitus.portal`, password);
      await setDoc(doc(db, 'users', cred.user.uid), {
        username, fullName, role: 'student',
        xp: 0, level: 'Aprendiz', streak: 0,
        createdAt: serverTimestamp(), lastActivity: serverTimestamp(),
      });
      document.getElementById('add-modal').classList.remove('open');
      document.getElementById('add-form').reset();
      toast('Alumno creado correctamente');
      renderAdmin(teacherData);
    } catch (err) {
      errEl.textContent = err.code === 'auth/email-already-in-use'
        ? 'Ese usuario ya existe.'
        : 'Error al crear la cuenta.';
      errEl.style.display = 'block';
    }
  });

  document.getElementById('detail-close').addEventListener('click', () => {
    document.getElementById('detail-modal').classList.remove('open');
  });

  document.querySelectorAll('.student-row').forEach(row => {
    row.addEventListener('click', async e => {
      if (e.target.classList.contains('delete-btn')) return;
      await showStudentDetail(row.dataset.id);
    });
  });

  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm(`¿Eliminar al alumno "${btn.dataset.name}"?\nSe borrarán todos sus datos.`)) return;
      const uid = btn.dataset.id;
      const subcols = ['sessions', 'intervalAttempts', 'achievements', 'challengeCompletions'];
      for (const col of subcols) {
        const snap = await getDocs(collection(db, 'users', uid, col));
        for (const d of snap.docs) await deleteDoc(d.ref);
      }
      await deleteDoc(doc(db, 'users', uid));
      toast('Alumno eliminado');
      renderAdmin(teacherData);
    });
  });

  document.getElementById('detail-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.classList.remove('open');
  });
  document.getElementById('add-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.classList.remove('open');
  });
}

// ── Modal detalle alumno ───────────────────────────────────────────────────
async function showStudentDetail(uid) {
  const titleEl = document.getElementById('detail-title');
  const bodyEl  = document.getElementById('detail-body');
  titleEl.textContent = 'Cargando...';
  bodyEl.innerHTML    = `<div style="display:flex;justify-content:center;padding:32px;"><div class="spinner"></div></div>`;
  document.getElementById('detail-modal').classList.add('open');

  const [userSnap, sessSnap, attSnap, achSnap] = await Promise.all([
    getDoc(doc(db, 'users', uid)),
    getDocs(query(collection(db, 'users', uid, 'sessions'), orderBy('startTime', 'desc'))),
    getDocs(collection(db, 'users', uid, 'intervalAttempts')),
    getDocs(collection(db, 'users', uid, 'achievements')),
  ]);

  const u        = userSnap.data();
  const sessions = sessSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const attempts = attSnap.docs.map(d => d.data());
  const badges   = achSnap.docs.map(d => d.data());

  const studioTotal   = sessions.filter(s => s.tool === 'studio').reduce((a, s) => a + (s.durationSeconds || 0), 0);
  const academiaTotal = sessions.filter(s => s.tool === 'academia').reduce((a, s) => a + (s.durationSeconds || 0), 0);
  const ivTotal       = attempts.length;
  const ivCorrect     = attempts.filter(a => a.isCorrect).length;
  const ivAccPct      = ivTotal > 0 ? Math.round((ivCorrect / ivTotal) * 100) + '%' : '—';

  const intervalByName = {};
  for (const a of attempts) {
    if (!intervalByName[a.intervalName]) intervalByName[a.intervalName] = { total: 0, correct: 0, times: [] };
    intervalByName[a.intervalName].total++;
    if (a.isCorrect) intervalByName[a.intervalName].correct++;
    if (a.responseMs) intervalByName[a.intervalName].times.push(a.responseMs);
  }
  const intervalData = Object.entries(intervalByName).map(([name, v]) => ({
    name, total: v.total, correct: v.correct,
    pct: Math.round((v.correct / v.total) * 100),
    avgSec: v.times.length ? (v.times.reduce((a, b) => a + b, 0) / v.times.length / 1000).toFixed(1) : null,
  }));

  const TOOL_LABEL = { studio: 'Lectura de Ritmo', academia: 'Lectura de Notas', intervaltrainer: 'Intervalos' };
  const TOOL_ICO   = { studio: '🥁', academia: '🎼', intervaltrainer: '🎧' };
  const TOOL_CLS   = { studio: 'rhythm', academia: 'notes', intervaltrainer: 'intervals' };

  titleEl.textContent = u?.fullName || 'Alumno';
  bodyEl.innerHTML = `
    <div>
      <div class="mini-stats" style="grid-template-columns:repeat(auto-fit,minmax(110px,1fr));">
        ${[
          { lbl: 'Sesiones', val: sessions.length },
          { lbl: '🥁 Ritmo',  val: fmtDuration(studioTotal) },
          { lbl: '🎼 Notas',  val: fmtDuration(academiaTotal) },
          { lbl: '🎧 Prec.',  val: ivAccPct },
          { lbl: '🎧 Intentos', val: ivTotal },
          { lbl: 'XP Total', val: (u?.xp || 0) + ' XP' },
          { lbl: 'Nivel',    val: escHtml(u?.level || 'Aprendiz') },
          { lbl: 'Racha',    val: (u?.streak || 0) + ' días' },
        ].map(c => `
          <div class="mini-stat">
            <div class="lbl">${c.lbl}</div>
            <div class="val">${c.val}</div>
          </div>
        `).join('')}
      </div>

      ${badges.length > 0 ? `
      <div style="margin-bottom:20px;">
        <p class="section-lbl">Logros</p>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">
          ${badges.map(b => `
            <span title="${escHtml(b.name)}: ${escHtml(b.description)}"
              style="font-size:1.5rem;cursor:default;">${escHtml(b.icon)}</span>
          `).join('')}
        </div>
      </div>` : ''}

      ${intervalData.length > 0 ? `
      <div style="margin-bottom:20px;">
        <p class="section-lbl">Precisión por Intervalo</p>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px;">
          ${intervalData.map(r => {
            const color = r.pct >= 90 ? 'var(--green)' : r.pct >= 70 ? '#0891b2' : r.pct >= 40 ? '#f59e0b' : 'var(--red)';
            return `
              <div style="background:var(--g50);border:1px solid var(--g200);border-radius:var(--r-sm);padding:10px 12px;">
                <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
                  <span style="font-size:.8125rem;font-weight:600;">${escHtml(r.name)}</span>
                  <span style="font-size:.8125rem;font-weight:700;color:${color};">${r.pct}%</span>
                </div>
                <div style="height:5px;background:var(--g200);border-radius:3px;">
                  <div style="width:${r.pct}%;height:100%;background:${color};border-radius:3px;"></div>
                </div>
                <div style="font-size:.75rem;color:var(--g400);margin-top:4px;">${r.correct}/${r.total}${r.avgSec ? ' · ' + r.avgSec + 's' : ''}</div>
              </div>`;
          }).join('')}
        </div>
      </div>` : ''}

      <div>
        <p class="section-lbl">Sesiones de Herramientas</p>
        ${sessions.length === 0
          ? `<p style="font-size:.875rem;color:var(--g400);">Sin actividad registrada aún.</p>`
          : sessions.slice(0, 30).map(s => `
              <div class="session-row">
                <div class="session-left">
                  <span class="session-ico">${TOOL_ICO[s.tool] ?? '🔧'}</span>
                  <div>
                    <div class="session-name">${escHtml(TOOL_LABEL[s.tool] ?? s.tool)}</div>
                    <div class="session-date">${fmtDate(s.startTime)}</div>
                  </div>
                </div>
                <div class="session-dur ${TOOL_CLS[s.tool] ?? ''}">${fmtDuration(s.durationSeconds)}</div>
              </div>`).join('')
        }
      </div>
    </div>`;
}

// ── Init ───────────────────────────────────────────────────────────────────
onAuthStateChanged(auth, async fbUser => {
  if (!fbUser) { window.location.href = 'index.html'; return; }
  const snap = await getDoc(doc(db, 'users', fbUser.uid));
  if (!snap.exists() || snap.data().role !== 'teacher') {
    await signOut(auth);
    window.location.href = 'index.html';
    return;
  }
  renderAdmin(snap.data());
});
