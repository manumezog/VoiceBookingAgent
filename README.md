# 🎤 Voice Booking Agent - Ideudas

**Agente de voz inteligente para agendar consultas gratuitas de alivio de deudas en tiempo real.**

![Status](https://img.shields.io/badge/Status-Production%20Ready-green) ![Version](https://img.shields.io/badge/Version-1.0.0-blue) ![Language](https://img.shields.io/badge/Language-Spanish-yellow)

**🔗 Live Demo:** https://voicebookingagent.web.app

---

## 📋 Descripción

**Voice Booking Agent** es una aplicación web que permite a clientes de Ideudas agendar consultas gratuitas mediante una conversación de voz natural con un asistente IA llamado **Manuel**.

### ✨ Características Principales

✅ **Conversación de Voz en Español** - Web Speech API con reconocimiento continuo  
✅ **LLM Inteligente** - OpenRouter API con GPT-3.5-turbo  
✅ **Integración Google Calendar** - Crea eventos automáticamente  
✅ **Detección de Confirmación** - Auto-booking sin intervención humana  
✅ **Botones de Horarios** - Selección rápida de franjas disponibles  
✅ **Sistema Híbrido de Booking** - Click directo O confirmación por voz  
✅ **Resumen de Conversación** - Transcript completo y log de acciones  
✅ **Responsive Design** - Funciona en desktop y mobile  
✅ **Editable Prompt** - Modo prototipo para A/B testing de instrucciones  

### 🔄 Flujo de Reserva

```
1. Usuario rellena formulario (nombre, email, teléfono)
                    ↓
2. Manuel saluda y muestra 2 franjas disponibles
                    ↓
3. Usuario confirma: habla O hace clic en horario
                    ↓
4. Auto-booking: Manuel confirma y crea evento
                    ↓
5. Resumen: Detalles de cita + transcript + log
```

---

## 🛠️ Stack Tecnológico

### Frontend
- **React 18.2.0** - UI framework
- **Web Speech API** - Reconocimiento y síntesis de voz (español)
- **Firebase SDK** - Cloud Functions y Firestore
- **CSS3** - Responsive design

### Backend
- **Firebase Cloud Functions** - Node.js 20 runtime
- **Google Calendar API** - Búsqueda y creación de eventos
- **OpenRouter API** - LLM (GPT-3.5-turbo)
- **Firestore** - Base de datos NoSQL

### DevOps
- **Firebase Hosting** - Alojamiento de la aplicación
- **Firebase Functions** - Backend serverless
- **GitHub** - Control de versiones

---

## 📁 Estructura del Proyecto

```
VoiceBookingAgent/
├── frontend/
│   ├── public/                 # Archivos estáticos
│   ├── src/
│   │   ├── App.js             # Componente principal (flujo 3 pasos)
│   │   ├── App.css            # Estilos responsive
│   │   ├── firebase.js        # Config Firebase + callable functions
│   │   └── realtimeAgent.js   # Integración Realtime API (beta)
│   └── package.json
├── functions/
│   ├── index.js               # Todas las Cloud Functions
│   ├── service-account.json   # Credenciales Google (NO commitear)
│   ├── package.json
│   └── .env                   # Variables de entorno (NO commitear)
├── public/                     # Output del build (Firebase Hosting)
├── firebase.json              # Configuración Firebase
└── README.md
```

---

## 🚀 Instalación y Despliegue

### Requisitos Previos

- Node.js 16+
- Firebase CLI (`npm install -g firebase-tools`)
- Cuenta de Firebase
- Google Service Account (Calendar API)
- API Key de OpenRouter

### Instalación Local

```bash
# Clonar repositorio
git clone <repo-url>
cd VoiceBookingAgent

# Instalar dependencias
npm install
cd frontend && npm install && cd ..
cd functions && npm install && cd ..
```

### Configuración de Variables de Entorno

#### `frontend/.env.local` (opcional, para Realtime API)
```
REACT_APP_FIREBASE_API_KEY=<tu-firebase-api-key>
REACT_APP_OPENAI_API_KEY=<tu-openai-key>
```

#### `functions/.env`
```
OPENROUTER_API_KEY=sk-or-v1-xxxxx
OPENAI_API_KEY=sk-xxxxx (opcional)
```

### Configurar Firebase

```bash
# Login
firebase login

# Seleccionar proyecto
firebase use voicebookingagent

# Configurar OpenRouter API key
firebase functions:config:set openrouter.key="tu-key-aqui"

# Desplegar
npm run build
firebase deploy --only "functions,hosting"
```

---

## ⚙️ Cloud Functions

### `llm_agent`
Procesa mensajes y obtiene respuesta del LLM
- **Input:** `{ messages: Array, model?: string }`
- **Output:** `{ reply: string }`
- **API:** OpenRouter GPT-3.5-turbo

### `calendar_search`
Busca franjas disponibles en Google Calendar
- **Input:** `{}`
- **Output:** `{ slots: Array<{start, end, time}> }`
- **Parámetros:** 5 slots, 30min, 9am-6pm EST, próximas 48 horas

### `calendar_create`
Crea evento en Google Calendar
- **Input:** `{ slot, name, email, phone }`
- **Output:** `{ success, expert, eventId }`

### `store_booking`
Guarda reserva en Firestore
- **Input:** `{ name, email, phone, appointment?, transcript }`
- **Output:** `{ success: true }`
- **Colección:** `bookings`

### `get_realtime_token` (Beta)
Ephemeral token para OpenAI Realtime API
- **Status:** En desarrollo

---

## 🔧 Configuración de Google Calendar

1. **Crear Service Account**
   - Google Cloud Console → Proyecto
   - IAM & Admin → Service Accounts
   - Crear nueva cuenta de servicio
   - Descargar JSON → guardar en `functions/service-account.json`

2. **Habilitar Google Calendar API**
   - APIs & Services → Library
   - Buscar "Google Calendar API"
   - Enable

3. **Compartir Calendario**
   - Agregar email del service account al calendario
   - Permisos: Editor

4. **Actualizar ID del Calendario**
   - En `functions/index.js`, actualizar `IDEUDAS_CALENDAR_ID`
   - Usar el email del calendario (ej: `calendars@google.com`)

---

## 🔑 Configuración de OpenRouter API

1. **Obtener API Key**
   - https://openrouter.ai/keys
   - Crear nueva clave

2. **Configurar en Firebase**
   ```bash
   firebase functions:config:set openrouter.key="sk-or-v1-xxxxx"
   ```

3. **⚠️ Revocar claves expuestas**
   - Después de compartir una clave, revocarla en https://openrouter.ai/keys

---

## 📊 Estructura de Datos (Firestore)

### Colección `bookings`
```javascript
{
  name: "Juan Pérez",
  email: "juan@example.com",
  phone: "+34 600 123 456",
  appointment: {
    start: "2025-12-11T10:00:00Z",
    end: "2025-12-11T10:30:00Z",
    time: "jueves, 11 de diciembre, 10 de la mañana",
    expert: "Maria Lopez"
  },
  transcript: "Manuel: Hola Juan! Soy Manuel de Ideudas...",
  created: Timestamp
}
```

---

## 💬 Sistema de Prompt (Manuel)

El agente Manuel está configurado con estas instrucciones:

✅ **Rapidez** - Agendar en menos de 3 intercambios  
✅ **Claridad** - Siempre "de la mañana" o "de la tarde"  
✅ **Contexto** - Nunca pedir datos que ya tiene  
✅ **Flexibilidad** - Aceptar voz O click  
✅ **Profesionalidad** - Representar a Ideudas correctamente  

**Puedes editar las instrucciones en vivo** en el landing page (modo prototipo).

---

## 🐛 Troubleshooting

### "OpenRouter API key not configured"
```bash
firebase functions:config:set openrouter.key="tu-key"
firebase deploy --only functions
```

### "No hay franjas disponibles"
- Verificar que haya espacios libres en Google Calendar
- Horario: 9am-6pm EST, próximas 48 horas
- Slots de 30 minutos

### "Speech Recognition not working"
- Solo funciona en HTTPS (o localhost en desarrollo)
- Navegadores soportados: Chrome, Edge, Safari
- Verificar micrófono permitido en navegador

### El evento se creó pero falta en el calendar invite
- Verificar email del service account
- Confirmar que el service account tiene permisos Editor en el calendario
- Revisar los logs en Firebase Console

---

## 📈 Logs y Monitoreo

### Frontend Console (F12)
```
[TTS] Iniciando síntesis de voz...
[Audio] Micrófono iniciado
[LLM] Procesando solicitud...
[Calendario] Evento creado exitosamente
[Reserva] Usuario confirmó horario
```

### Backend Logs
```bash
firebase functions:log
```

---

## 🔐 Seguridad

✅ **API Keys:**
- OpenRouter key guardada en Firebase (no en frontend)
- Google service account NO commiteado a Git
- `.env` y `service-account.json` en `.gitignore`

✅ **Firestore Rules:**
- Lectura pública a colección `bookings` (datos anónimos)
- Escritura autenticada para nuevas reservas

✅ **Recomendaciones:**
1. Revocar claves expuestas en OpenRouter/OpenAI
2. Usar `.env` solo en desarrollo local
3. Limitar permisos del service account a Calendar API

---

## 📝 Historial de Cambios

### v1.0.0 (10 Diciembre 2025)
- ✅ Release inicial
- ✅ Conversación con Manuel en español
- ✅ Web Speech API (STT/TTS)
- ✅ Google Calendar integration
- ✅ Auto-booking con detección de confirmación
- ✅ Botones de horarios clickables
- ✅ Resumen de conversación y log de acciones
- ✅ Editable system prompt (modo prototipo)
- ✅ Responsive design

### Roadmap
- 🚧 OpenAI Realtime API (conversación en vivo sin delays)
- 🚧 Notificaciones por email
- 🚧 Integración con Zoom
- 🚧 Soporte multi-idioma
- 🚧 Dashboard de admin
- 🚧 Grabación y transcripción de llamadas

---

## 👥 Contribución

Para contribuir:
1. Fork el repositorio
2. Crea rama: `git checkout -b feature/nueva-feature`
3. Commit: `git commit -am 'Agregar feature'`
4. Push: `git push origin feature/nueva-feature`
5. Open Pull Request

---

## 📞 Soporte

**Contacto:** manumezog@gmail.com

Para reportar bugs:
- Crear issue en GitHub
- Revisar logs en Firebase Console
- Verificar configuración en `.env` y `firebase.json`

---

## 📄 Licencia

Proyecto propietario de Ideudas - Todos los derechos reservados.

---

## 🙏 Tecnologías Usadas

- **Google Calendar API** - Integración de calendario
- **OpenRouter** - Acceso a modelos LLM
- **Firebase** - Backend y hosting
- **Web Speech API** - Reconocimiento y síntesis de voz
- **React** - UI framework

---

**Última actualización:** 10 de Diciembre de 2025  
**Status:** ✅ Production Ready  
**Deploy:** https://voicebookingagent.web.app
