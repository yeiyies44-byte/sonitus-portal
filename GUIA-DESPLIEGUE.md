# Guía de Despliegue — Sonitus Portal en GitHub Pages + Firebase

Esta guía tiene 3 partes: Firebase (base de datos), GitHub (código), y GitHub Pages (URL pública).
Tiempo estimado: 20 minutos.

---

## Parte 1 — Crear proyecto Firebase (base de datos en la nube)

Firebase es el servicio gratuito de Google que reemplaza al servidor Node.js.
Guarda los usuarios, sesiones, XP y logros en la nube.

### 1.1 Crear el proyecto

1. Ve a **https://console.firebase.google.com**
2. Clic en **Crear un proyecto** → pon el nombre `sonitus-portal`
3. Desactiva Google Analytics (no es necesario) → **Crear proyecto**

### 1.2 Activar Authentication

1. En el menú izquierdo → **Authentication** → **Comenzar**
2. Pestaña **Sign-in method** → habilitar **Correo electrónico/Contraseña**
3. Guardar

### 1.3 Crear la base de datos Firestore

1. En el menú izquierdo → **Firestore Database** → **Crear base de datos**
2. Elige **Comenzar en modo de producción**
3. Ubicación: `us-central` (o la más cercana a ti) → **Habilitar**

### 1.4 Copiar las reglas de seguridad

1. En Firestore → pestaña **Reglas**
2. Borra el contenido actual y pega el contenido del archivo `firestore.rules` de este proyecto
3. Clic en **Publicar**

### 1.5 Obtener la configuración de la app

1. En la pantalla principal del proyecto → clic en el ícono **`</>`** (Web)
2. Nombre de la app: `sonitus-web` → **Registrar app**
3. Copia el bloque `firebaseConfig` que aparece. Ejemplo:
   ```js
   const firebaseConfig = {
     apiKey: "AIzaSy...",
     authDomain: "sonitus-portal.firebaseapp.com",
     ...
   };
   ```
4. Abre el archivo **`js/firebase-config.js`** de este proyecto
5. Reemplaza cada valor `"PEGA-TU-...-AQUI"` con los valores reales
6. Guarda el archivo

---

## Parte 2 — Subir el código a GitHub

### 2.1 Inicializar el repositorio

Abre la terminal, navega a la carpeta del proyecto y ejecuta:

```bash
cd ~/Desktop/Sonitus\ Portal
git init
git add .
git commit -m "first commit: Sonitus Portal con Firebase"
```

### 2.2 Crear el repositorio en GitHub

1. Ve a **https://github.com/new**
2. Nombre: `sonitus-portal` → **Public**
3. **NO** marques README ni .gitignore (ya los tienes)
4. Clic en **Create repository**

### 2.3 Conectar y subir (reemplaza `TU-USUARIO`)

```bash
git remote add origin https://github.com/TU-USUARIO/sonitus-portal.git
git branch -M main
git push -u origin main
```

> Si pide contraseña, usa un **Personal Access Token**:
> GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
> → Generate new token → marca `repo` → copia el token y úsalo como contraseña.

---

## Parte 3 — Activar GitHub Pages

### 3.1 Habilitar Pages en GitHub

1. Abre tu repositorio en GitHub
2. Clic en **Settings** (pestaña superior) → sección **Pages** en el menú izquierdo
3. En **Source** elige **GitHub Actions**
4. Listo — el workflow `.github/workflows/deploy.yml` se ejecuta automáticamente

### 3.2 Obtener la URL pública

Después de que el workflow termine (1-2 minutos):
1. Ve a la pestaña **Actions** de tu repositorio
2. Cuando el workflow aparezca con ✅ verde, clic en él
3. Al final verás la URL: `https://TU-USUARIO.github.io/sonitus-portal/`

Esa es tu URL pública. Cópiala en el `README.md`.

---

## Parte 4 — Crear la cuenta del profesor (una sola vez)

1. Abre en tu navegador: `https://TU-USUARIO.github.io/sonitus-portal/setup.html`
2. Clic en **Crear cuenta de Profesor**
3. Cuando aparezca el mensaje de éxito, ya está

Credenciales del profesor:
- **Usuario:** `profesor`
- **Contraseña:** `Sonitus2024!`

> Esta página puede quedar ahí — si alguien intenta crearla de nuevo, simplemente muestra
> que ya existe. No hay peligro de duplicados.

---

## Parte 5 — Actualizaciones futuras

Cada vez que cambies código:

```bash
git add .
git commit -m "descripción del cambio"
git push
```

GitHub Actions redespliega automáticamente en ~1 minuto.

---

## Resumen

```
firebase-config.js  →  Firebase (auth + base de datos)
        ↓
   git push  →  GitHub (código fuente)
        ↓
 GitHub Actions  →  GitHub Pages (URL pública)
        ↓
https://TU-USUARIO.github.io/sonitus-portal/
```

## Diferencias con la versión local

| Función                  | Versión local (Node.js) | Esta versión (GitHub Pages) |
|--------------------------|-------------------------|-----------------------------|
| Login / Registro         | ✅ Funciona              | ✅ Funciona (Firebase Auth)  |
| Estadísticas personales  | ✅ Funciona              | ✅ Funciona (Firestore)      |
| XP y logros              | ✅ Funciona              | ✅ Funciona (Firestore)      |
| Panel de profesor        | ✅ Funciona              | ✅ Funciona (Firestore)      |
| Herramientas musicales   | ✅ Funciona              | ✅ Funciona (archivos estáticos) |
| Chat Maestro Búho        | ✅ Funciona (Ollama)     | ❌ No disponible (requiere servidor local) |
