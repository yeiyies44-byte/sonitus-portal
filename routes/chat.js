const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const SYSTEM = `Eres el Maestro Búho, un experto en historia de la música con conocimiento enciclopédico.
Respondes preguntas sobre compositores, períodos musicales, instrumentos, teoría musical histórica, géneros y su evolución.
Eres amigable, entusiasta y usas emojis musicales ocasionalmente 🎵.
Respuestas concisas (máximo 3 párrafos). Si la pregunta no es sobre música, redirige amablemente.
Hablas en español siempre.`;

router.post('/music', async (req, res) => {
  const { message, history = [] } = req.body ?? {};
  if (!message?.trim()) return res.status(400).json({ error: 'Mensaje vacío' });

  const messages = [
    { role: 'system', content: SYSTEM },
    ...history.slice(-6).map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: message.trim() },
  ];

  try {
    const ollamaRes = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'qwen3.5:9b', messages, stream: false }),
    });

    if (!ollamaRes.ok) throw new Error(`Ollama ${ollamaRes.status}`);
    const data = await ollamaRes.json();
    const reply = data.message?.content ?? 'No pude generar una respuesta.';
    res.json({ reply });
  } catch (err) {
    console.error('[chat] Ollama error:', err.message);
    res.status(503).json({ error: 'El Maestro Búho está descansando. Verifica que Ollama esté activo.' });
  }
});

module.exports = router;
