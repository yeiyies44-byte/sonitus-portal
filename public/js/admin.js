// ── API helpers ────────────────────────────────────────────────────────────
const api = {
  async get(path) {
    try {
      const r = await fetch('/api' + path, { credentials: 'include' });
      if (r.status === 401) { window.location.href = '/'; return {}; }
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
  async del(path) {
    try {
      const r = await fetch('/api' + path, { method: 'DELETE', credentials: 'include' });
      return r.json();
    } catch { return {}; }
  },
};

// ── Utilidades ─────────────────────────────────────────────────────────────
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
  if (d > 0) return d === 1 ? 'Ayer' : `Hace ${d}d`;
  if (h > 0) return h === 1 ? 'Hace 1h' : `Hace ${h}h`;
  if (m > 0) return m === 1 ? 'Hace 1min' : `Hace ${m}min`;
  return 'Ahora';
}

function fmtDate(dt) {
  if (!dt) return '—';
  return new Date(dt + 'Z').toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' });
}

function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2800);
}

const app = document.getElementById('app');

// ── Render principal ───────────────────────────────────────────────────────
async function renderAdmin() {
  app.innerHTML = `<div class="loading-screen"><div class="spinner"></div></div>`;

  const [meRes, statsRes, studentsRes, intervalRes] = await Promise.all([
    api.get('/auth/me'),
    api.get('/admin/stats'),
    api.get('/admin/students'),
    api.get('/admin/interval-accuracy'),
  ]);

  if (!meRes.user || meRes.user.role !== 'teacher') { window.location.href = '/'; return; }

  const stats = statsRes;
  const students = Array.isArray(studentsRes) ? studentsRes : [];
  const intervalData = Array.isArray(intervalRes) ? intervalRes : [];
  const ivTotal   = stats.interval_attempts_total ?? 0;
  const ivCorrect = stats.interval_attempts_correct ?? 0;
  const ivAccPct  = ivTotal > 0 ? Math.round((ivCorrect / ivTotal) * 100) : '—';
  const ptTotal   = stats.pitch_attempts_total ?? 0;
  const ptCorrect = stats.pitch_attempts_correct ?? 0;
  const ptAccPct  = ptTotal > 0 ? Math.round((ptCorrect / ptTotal) * 100) : '—';

  const statCards = [
    { ico: '👥', label: 'Alumnos',           value: stats.total_students    ?? 0 },
    { ico: '🔑', label: 'Sesiones totales',  value: stats.total_logins      ?? 0 },
    { ico: '⏱',  label: 'Tiempo acumulado',  value: fmtDuration(stats.total_seconds) },
    { ico: '🥁', label: 'Lectura de Ritmo',  value: stats.studio_sessions   ?? 0 },
    { ico: '🎼', label: 'Lectura de Notas',  value: stats.academia_sessions ?? 0 },
    { ico: '🎧', label: 'Intervalos (prec.)', value: ivTotal > 0 ? `${ivAccPct}%` : '—' },
    { ico: '🎵', label: 'Afinador (prec.)',   value: ptTotal > 0 ? `${ptAccPct}%` : '—' },
  ];

  app.innerHTML = `
    <div>
      <div class="admin-hd">
        <div class="hd-inner">
          <div class="brand">
            <img src="/logo.jpeg" class="ico" style="width:auto;height:1.5rem;object-fit:contain;filter:invert(1) brightness(2);" alt="" />
            <div>
              <div style="display:flex;align-items:center;gap:8px;">
                <span class="name">Sonitus Portal</span>
                <span class="admin-tag">Profesor</span>
              </div>
              <div class="sub">Panel de Actividad</div>
            </div>
          </div>
          <div class="hd-right">
            <span class="hd-name">${meRes.user.fullName}</span>
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
              <div class="stat-lbl">${c.label}</div>
            </div>
          `).join('')}
        </div>

        <!-- Precisión por Intervalo -->
        ${intervalData.length > 0 ? `
        <div class="card" style="margin-bottom:16px;">
          <div class="card-hd">
            <span class="card-title">🎧 Precisión por Intervalo</span>
            <span class="card-sub">${ivTotal} intentos totales</span>
          </div>
          <div class="overflow-x">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Intervalo</th>
                  <th>Intentos</th>
                  <th>Correctos</th>
                  <th>Precisión</th>
                  <th>Tiempo medio</th>
                </tr>
              </thead>
              <tbody>
                ${intervalData.map(r => {
                  const pct = r.accuracy_pct ?? 0;
                  const color = pct >= 90 ? 'var(--green)' : pct >= 70 ? '#0891b2' : pct >= 40 ? '#f59e0b' : 'var(--red)';
                  return `
                    <tr style="cursor:default;">
                      <td style="font-weight:600;">${r.interval_name}</td>
                      <td>${r.total}</td>
                      <td>${r.correct}</td>
                      <td>
                        <div style="display:flex;align-items:center;gap:8px;">
                          <div style="flex:1;height:6px;background:var(--g200);border-radius:3px;min-width:60px;">
                            <div style="width:${pct}%;height:100%;background:${color};border-radius:3px;transition:width .3s;"></div>
                          </div>
                          <span style="font-weight:700;color:${color};min-width:38px;">${pct}%</span>
                        </div>
                      </td>
                      <td style="color:var(--g500);">${r.avg_seconds != null ? r.avg_seconds + 's' : '—'}</td>
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
                  <tr>
                    <th>Alumno</th>
                    <th>Última sesión</th>
                    <th>Sesiones</th>
                    <th>🥁 Ritmo</th>
                    <th>🎼 Notas</th>
                    <th>🎧 Intervalos</th>
                    <th>🎵 Afinación</th>
                    <th>Total</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  ${students.map(s => `
                    <tr class="student-row" data-id="${s.id}">
                      <td>
                        <div style="font-weight:600;color:var(--g900);">${s.full_name}</div>
                        <div style="font-size:.75rem;color:var(--g400);margin-top:2px;">@${s.username}</div>
                      </td>
                      <td>${timeAgo(s.last_login)}</td>
                      <td>${s.total_logins}</td>
                      <td style="font-weight:600;color:var(--green);">${fmtDuration(s.studio_seconds)}</td>
                      <td style="font-weight:600;color:#2563eb;">${fmtDuration(s.academia_seconds)}</td>
                      <td style="font-weight:600;color:#7c3aed;">${s.interval_attempts > 0 ? `${Math.round((s.interval_correct/s.interval_attempts)*100)}%` : '—'}</td>
                      <td style="font-weight:600;color:#d97706;">${s.pitch_attempts > 0 ? `${Math.round((s.pitch_correct/s.pitch_attempts)*100)}%` : '—'}</td>
                      <td style="font-weight:600;">${fmtDuration(s.total_seconds)}</td>
                      <td>
                        <button class="delete-btn" data-id="${s.id}" data-name="${s.full_name}"
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

    <!-- Modal: Detalle alumno -->
    <div id="detail-modal" class="modal-bg">
      <div class="modal-box modal-box-wide">
        <div class="modal-hd">
          <h3 id="detail-title"></h3>
          <button class="modal-close" id="detail-close">×</button>
        </div>
        <div class="modal-body" id="detail-body"></div>
      </div>
    </div>

    <!-- Modal: Agregar alumno -->
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

  // ── Event Listeners ─────────────────────────────────────────────────────
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await api.post('/auth/logout', {});
    window.location.href = '/';
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
    const username = document.getElementById('a-user').value.trim();
    const password = document.getElementById('a-pass').value;
    const errEl = document.getElementById('add-err');
    errEl.style.display = 'none';

    if (!fullName || !username || !password) {
      errEl.textContent = 'Por favor completa todos los campos.';
      errEl.style.display = 'block';
      return;
    }
    const res = await api.post('/admin/students', { username, fullName, password });
    if (res.error) {
      errEl.textContent = res.error;
      errEl.style.display = 'block';
      return;
    }
    document.getElementById('add-modal').classList.remove('open');
    document.getElementById('add-form').reset();
    toast('Alumno creado correctamente');
    renderAdmin();
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
      if (!confirm(`¿Eliminar al alumno "${btn.dataset.name}"?\nSe borrarán todos sus datos de actividad.`)) return;
      await api.del(`/admin/students/${btn.dataset.id}`);
      toast('Alumno eliminado');
      renderAdmin();
    });
  });

  document.getElementById('detail-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.classList.remove('open');
  });
  document.getElementById('add-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.classList.remove('open');
  });
}

// ── Modal de detalle del alumno ────────────────────────────────────────────
async function showStudentDetail(id) {
  document.getElementById('detail-title').textContent = 'Cargando...';
  document.getElementById('detail-body').innerHTML = `
    <div style="display:flex;justify-content:center;padding:32px;">
      <div class="spinner"></div>
    </div>`;
  document.getElementById('detail-modal').classList.add('open');

  const res = await api.get(`/admin/students/${id}`);
  if (res.error) {
    document.getElementById('detail-body').innerHTML = `<p style="color:var(--red);">${res.error}</p>`;
    return;
  }

  const { student, sessions, logins, intervalAccuracy, tapResults, tapStats } = res;
  const studioTotal   = sessions.filter(s => s.tool === 'studio').reduce((a, s) => a + (s.duration_seconds || 0), 0);
  const academiaTotal = sessions.filter(s => s.tool === 'academia').reduce((a, s) => a + (s.duration_seconds || 0), 0);
  const ivTotal   = intervalAccuracy?.reduce((a, r) => a + r.total, 0) ?? 0;
  const ivCorrect = intervalAccuracy?.reduce((a, r) => a + r.correct, 0) ?? 0;
  const ivAccPct  = ivTotal > 0 ? Math.round((ivCorrect / ivTotal) * 100) + '%' : '—';

  const TOOL_LABEL = { studio: 'Lectura de Ritmo', academia: 'Lectura de Notas', intervaltrainer: 'Intervalos' };
  const TOOL_ICO   = { studio: '🥁', academia: '🎼', intervaltrainer: '🎧' };
  const TOOL_CLS   = { studio: 'rhythm', academia: 'notes', intervaltrainer: 'intervals' };

  document.getElementById('detail-title').textContent = student.full_name;
  document.getElementById('detail-body').innerHTML = `
    <style>
      .session-dur.intervals { color: #7c3aed; }
    </style>
    <div>
      <div class="mini-stats" style="grid-template-columns:repeat(auto-fit,minmax(110px,1fr));">
        ${[
          { lbl: 'Miembro desde', val: new Date(student.created_at + 'Z').toLocaleDateString('es', { year: 'numeric', month: 'short', day: 'numeric' }) },
          { lbl: 'Conexiones', val: logins.length },
          { lbl: '🥁 Ritmo', val: fmtDuration(studioTotal) },
          { lbl: '🎼 Notas', val: fmtDuration(academiaTotal) },
          { lbl: '🎧 Prec. Intervalos', val: ivAccPct },
          { lbl: '🎧 Intentos', val: ivTotal },
          { lbl: '🥁 Prec. Tap', val: tapStats?.total > 0 ? (tapStats.avg_accuracy + '%') : '—' },
          { lbl: '🥁 Sesiones Tap', val: tapStats?.total ?? 0 },
        ].map(c => `
          <div class="mini-stat">
            <div class="lbl">${c.lbl}</div>
            <div class="val">${c.val}</div>
          </div>
        `).join('')}
      </div>

      ${intervalAccuracy && intervalAccuracy.length > 0 ? `
      <div style="margin-bottom:20px;">
        <p class="section-lbl">Precisión por Intervalo</p>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px;">
          ${intervalAccuracy.map(r => {
            const pct = r.accuracy_pct ?? 0;
            const color = pct >= 90 ? 'var(--green)' : pct >= 70 ? '#0891b2' : pct >= 40 ? '#f59e0b' : 'var(--red)';
            return `
              <div style="background:var(--g50);border:1px solid var(--g200);border-radius:var(--r-sm);padding:10px 12px;">
                <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
                  <span style="font-size:.8125rem;font-weight:600;">${r.interval_name}</span>
                  <span style="font-size:.8125rem;font-weight:700;color:${color};">${pct}%</span>
                </div>
                <div style="height:5px;background:var(--g200);border-radius:3px;">
                  <div style="width:${pct}%;height:100%;background:${color};border-radius:3px;"></div>
                </div>
                <div style="font-size:.75rem;color:var(--g400);margin-top:4px;">${r.correct}/${r.total} • ${r.avg_seconds != null ? r.avg_seconds + 's' : '—'} media</div>
              </div>`;
          }).join('')}
        </div>
      </div>
      ` : ''}

      ${tapResults && tapResults.length > 0 ? `
      <div style="margin-bottom:20px;">
        <p class="section-lbl">🥁 Historial Modo Tap</p>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:8px;">
          ${tapResults.slice(0, 12).map(r => {
            const pct = r.accuracy_pct;
            const color = pct >= 80 ? 'var(--green)' : pct >= 50 ? '#d97706' : 'var(--red)';
            return `
              <div style="background:var(--g50);border:1px solid var(--g200);border-radius:var(--r-sm);padding:10px 12px;">
                <div style="display:flex;justify-content:space-between;margin-bottom:5px;">
                  <span style="font-size:.8125rem;font-weight:600;">Nv.${r.level} · ${r.time_sig} · ${r.bpm}bpm</span>
                  <span style="font-size:.875rem;font-weight:700;color:${color};">${pct}%</span>
                </div>
                <div style="height:4px;background:var(--g200);border-radius:2px;">
                  <div style="width:${pct}%;height:100%;background:${color};border-radius:2px;"></div>
                </div>
                <div style="font-size:.75rem;color:var(--g400);margin-top:5px;">${r.notes_correct}/${r.notes_total} notas · ${fmtDate(r.created_at)}</div>
              </div>`;
          }).join('')}
        </div>
      </div>
      ` : ''}

      <div style="margin-bottom:20px;">
        <p class="section-lbl">Sesiones de Herramientas</p>
        ${sessions.length === 0
          ? `<p style="font-size:.875rem;color:var(--g400);">Sin actividad registrada aún.</p>`
          : sessions.map(s => `
              <div class="session-row">
                <div class="session-left">
                  <span class="session-ico">${TOOL_ICO[s.tool] ?? '🔧'}</span>
                  <div>
                    <div class="session-name">${TOOL_LABEL[s.tool] ?? s.tool}</div>
                    <div class="session-date">${fmtDate(s.start_time)}</div>
                  </div>
                </div>
                <div style="text-align:right;">
                  <div class="session-dur ${TOOL_CLS[s.tool] ?? ''}">${fmtDuration(s.duration_seconds)}</div>
                  <div class="session-events">${s.events} interac.</div>
                </div>
              </div>
            `).join('')
        }
      </div>

      <div>
        <p class="section-lbl">Historial de Conexiones</p>
        ${logins.length === 0
          ? `<p style="font-size:.875rem;color:var(--g400);">Sin conexiones registradas.</p>`
          : logins.slice(0, 15).map(l => `
              <div class="login-row">
                <span class="login-time">${fmtDate(l.login_at)}</span>
                <span class="login-status">${l.logout_at ? 'Sesión cerrada' : 'Sesión activa'}</span>
              </div>
            `).join('')
        }
      </div>
    </div>`;
}

// ── Init ───────────────────────────────────────────────────────────────────
renderAdmin();
