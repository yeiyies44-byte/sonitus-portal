# 🎵 Sonitus Portal

Portal educativo centralizado con herramientas interactivas para el aprendizaje musical.

## Demo en vivo

🔗 **[Ver aplicación →](https://TU-APP.railway.app)**  
*(Reemplaza este enlace después de desplegar en Railway)*

---

## ¿Qué es Sonitus Portal?

Sonitus Portal es una plataforma web para estudiantes y profesores de música. Incluye:

- **Autenticación** — Login y registro de alumnos con sesiones seguras
- **Herramientas musicales** — Academia, Interval Trainer, Studio y Vocal
- **Panel de profesor** — Seguimiento de actividad, gamificación y chat
- **Retos diarios** — Sistema de puntos y progresión para alumnos

## Acceso por defecto

| Rol      | Usuario    | Contraseña     |
|----------|------------|----------------|
| Profesor | `profesor` | `Sonitus2024!` |

> Los alumnos se registran directamente desde la página de inicio.

## Tecnologías

- **Backend** — Node.js + Express
- **Base de datos** — SQLite (via `better-sqlite3`)
- **Frontend** — HTML, CSS, JavaScript vanilla
- **Auth** — JWT + cookies

## Correr localmente

```bash
npm install
npm start
# → http://localhost:3000
```

## Despliegue

Ver [`GUIA-DESPLIEGUE.md`](./GUIA-DESPLIEGUE.md) para instrucciones completas de GitHub + Railway.

---

*Proyecto desarrollado para el método de enseñanza musical del Prof. Tomas Higuera.*
