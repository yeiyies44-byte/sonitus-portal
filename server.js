const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const { initDb } = require('./database');
const authRoutes = require('./routes/auth');
const activityRoutes = require('./routes/activity');
const adminRoutes = require('./routes/admin');
const { router: gamificationRoutes } = require('./routes/gamification');
const chatRoutes = require('./routes/chat');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/gamification', gamificationRoutes);
app.use('/api/chat', chatRoutes);

// Admin panel SPA
app.get('/admin', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Student SPA catch-all
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

initDb();

app.listen(PORT, () => {
  console.log(`\n🎵 Sonitus Portal → http://localhost:${PORT}`);
  console.log(`   Acceso profesor: usuario="profesor"  contraseña="Sonitus2024!"\n`);
});
