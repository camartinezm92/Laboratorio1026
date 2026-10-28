<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />

# Sistema Clínico UCI Honda - Versión 1.0.0
**Gestión Integral de Hemoderivados, Transcripción IA de Laboratorios y Kardex Clínico**
</div>

---

## 📌 Novedades en esta versión (v1.0.0)

- **Transcripción Inteligente de Laboratorios por Lotes con IA:**
  - Soporte para extracción automática de PDF y escaneos de laboratorio.
  - Balanceo de carga y rotación automática de hasta 3 API Keys de Gemini (`GEMINI_API_KEY_1`, `GEMINI_API_KEY_2`, `GEMINI_API_KEY_3`).
  - Fallback dinámico de modelos (`gemini-2.5-flash`, `gemini-2.5-flash-lite`, `gemini-1.5-flash`) en caso de saturación o límite de cuota (HTTP 429).
  - Manejo de documentos múltiples del mismo paciente agrupados de manera cronológica sin sobreescritura accidental.
  - Modales propios de confirmación integrados en UI (sin alertas nativas de navegador).
- **Módulo de Pruebas Cruzadas y Hemoderivados:**
  - Solicitudes, recepción, transfusión y reacciones adversas.
- **Kardex de Medicamentos:**
  - Control de horarios, aplicaciones y trazabilidad de enfermería.

---

## 🚀 Cómo ejecutar localmente

### 1. Requisitos previos
- Node.js (versión 18 o superior)
- npm o yarn

### 2. Instalación de dependencias
```bash
npm install
```

### 3. Configuración de Variables de Entorno
Crea o edita tu archivo `.env.local` (o `.env`) en la raíz del proyecto basándote en `.env.example`:

```env
# Claves de Gemini para rotación automática y alta disponibilidad:
GEMINI_API_KEY_1=tu_clave_gemini_1
GEMINI_API_KEY_2=tu_clave_gemini_2
GEMINI_API_KEY_3=tu_clave_gemini_3
GEMINI_API_KEY_4=tu_clave_gemini_4
GEMINI_API_KEY_5=tu_clave_gemini_5

# Clave fallback opcional:
GEMINI_API_KEY=tu_clave_gemini_principal
```

> **Nota de seguridad:** El archivo `.gitignore` protege automáticamente los archivos `.env` y `.env.local` para que tus claves privadas nunca se suban públicamente a GitHub.

### 4. Iniciar el Servidor de Desarrollo
```bash
npm run dev
```
La aplicación estará disponible en `http://localhost:3000`.

---

## 🛠️ Comandos de Git para subir cambios

Si estás sincronizando este proyecto con tu repositorio remoto de Git / GitHub, ejecuta en tu terminal:

```bash
# 1. Ver los archivos modificados
git status

# 2. Agregar todos los cambios al área de preparación (stage)
git add .

# 3. Crear el commit con un mensaje descriptivo
git commit -m "feat(uci-honda): version 1.0.0 - actualizacion completa con transcripcion IA y rotacion de keys"

# 4. Enviar los cambios a tu rama principal (main o master)
git push origin main
```

---
*Desarrollado para la Unidad de Cuidados Intensivos (UCI) Honda.*
