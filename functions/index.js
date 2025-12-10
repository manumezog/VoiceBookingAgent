const functions = require('firebase-functions');
const fetch = require('node-fetch');
const admin = require('firebase-admin');
const { google } = require('googleapis');
const path = require('path');
const { GoogleAuth } = require('google-auth-library');
const { defineSecret } = require('firebase-functions/params');

admin.initializeApp();
const db = admin.firestore();

const IDEUDAS_CALENDAR_ID = 'manumezog@gmail.com';
const OPENROUTER_API_KEY = defineSecret('OPENROUTER_API_KEY');

const EXPERTS = [
  { name: 'Maria Lopez', email: 'maria.lopez@ideudas.com' },
  { name: 'Juan Perez', email: 'juan.perez@ideudas.com' },
  { name: 'Ana Torres', email: 'ana.torres@ideudas.com' }
];

function getCalendarClient() {
  const keyPath = path.join(__dirname, 'service-account.json');
  const auth = new GoogleAuth({
    keyFile: keyPath,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });
  return google.calendar({ version: 'v3', auth });
}

function assignExpert(slot) {
  const idx = Math.abs(slot.start.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % EXPERTS.length;
  return EXPERTS[idx];
}

exports.llm_agent = functions.https.onCall(async (data, context) => {
  const apiKey = OPENROUTER_API_KEY.value();
  if (!apiKey) {
    throw new functions.https.HttpsError('failed-precondition', 'OpenRouter API key not set.');
  }
  const { messages, model } = data;
  const chosenModel = model || 'openai/gpt-3.5-turbo';
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://voicebookingagent.web.app',
        'X-Title': 'Ideudas Voice Booking Agent',
      },
      body: JSON.stringify({
        model: chosenModel,
        messages,
      }),
    });
    if (!response.ok) {
      throw new Error('OpenRouter API error');
    }
    const result = await response.json();
    const reply = result.choices?.[0]?.message?.content || '';
    return { reply };
  } catch (err) {
    throw new functions.https.HttpsError('internal', 'LLM call failed: ' + err.message);
  }
});

exports.calendar_search = functions.https.onCall(async (data, context) => {
  const calendar = getCalendarClient();
  const now = new Date();
  const end = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  
  // Get events and check transparency (free/busy)
  const events = await calendar.events.list({
    calendarId: IDEUDAS_CALENDAR_ID,
    timeMin: now.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  });
  
  // Filter only BUSY events (ignore events marked as "free"/transparent)
  const busyEvents = (events.data.items || []).filter(event => {
    // transparency: 'transparent' means "free", 'opaque' or undefined means "busy"
    return event.transparency !== 'transparent';
  });
  
  const slots = [];
  let current = new Date(now);
  
  // If current time is past 6pm, start from 9am next day
  if (current.getHours() >= 18) {
    current.setDate(current.getDate() + 1);
    current.setHours(9, 0, 0, 0);
  } else if (current.getHours() < 9) {
    current.setHours(9, 0, 0, 0);
  } else {
    // Round up to next 30-min slot
    const minutes = current.getMinutes();
    if (minutes > 0 && minutes <= 30) {
      current.setMinutes(30, 0, 0);
    } else if (minutes > 30) {
      current.setHours(current.getHours() + 1, 0, 0, 0);
    }
  }
  
  while (current < end && slots.length < 5) {
    const slotEnd = new Date(current.getTime() + 30 * 60 * 1000);
    
    // Skip if outside business hours (9am-6pm)
    if (current.getHours() < 9 || slotEnd.getHours() > 18 || (slotEnd.getHours() === 18 && slotEnd.getMinutes() > 0)) {
      current.setDate(current.getDate() + 1);
      current.setHours(9, 0, 0, 0);
      continue;
    }
    
    // Check for conflicts only with BUSY events
    const conflict = busyEvents.some(event => {
      const eventStart = new Date(event.start.dateTime || event.start.date);
      const eventEnd = new Date(event.end.dateTime || event.end.date);
      return current < eventEnd && slotEnd > eventStart;
    });
    
    if (!conflict) {
      // Format time nicely in Spanish with AM/PM
      const hour = current.getHours();
      const minute = current.getMinutes();
      const ampm = hour >= 12 ? 'de la tarde' : 'de la mañana';
      const hour12 = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
      const minuteStr = minute === 0 ? '' : `:${minute.toString().padStart(2, '0')}`;
      
      const dayNames = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
      const monthNames = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
      
      const timeStr = `${dayNames[current.getDay()]}, ${current.getDate()} de ${monthNames[current.getMonth()]}, ${hour12}${minuteStr} ${ampm}`;
      
      slots.push({
        start: current.toISOString(),
        end: slotEnd.toISOString(),
        time: timeStr,
      });
    }
    current = slotEnd;
  }
  
  return { slots };
});

exports.calendar_create = functions.https.onCall(async (data, context) => {
  const { slot, name, email, phone } = data;
  const calendar = getCalendarClient();
  const expert = assignExpert(slot);
  try {
    // Create event WITHOUT attendees to avoid Domain-Wide Delegation requirement
    // Client info is stored in description instead
    const eventRes = await calendar.events.insert({
      calendarId: IDEUDAS_CALENDAR_ID,
      conferenceDataVersion: 1,
      requestBody: {
        summary: `Consulta Gratuita - ${name} - Ideudas`,
        description: `CONSULTA GRATUITA SIN COMPROMISO - IDEUDAS

📋 DATOS DEL CLIENTE:
• Nombre: ${name}
• Email: ${email}
• Teléfono: ${phone || 'No proporcionado'}
• Experto asignado: ${expert.name}

📞 Esta es una consulta gratuita de 30 minutos sobre alivio de deudas.

⚠️ IMPORTANTE: Contactar al cliente en ${email} o ${phone || 'N/A'} para confirmar la cita y enviar el enlace de Google Meet.`,
        start: { dateTime: slot.start, timeZone: 'America/New_York' },
        end: { dateTime: slot.end, timeZone: 'America/New_York' },
        conferenceData: {
          createRequest: {
            requestId: `${Date.now()}-${Math.floor(Math.random() * 10000)}`,
            conferenceSolutionKey: { type: 'hangoutsMeet' }
          }
        },
        colorId: '10', // Green color for consultation events
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'popup', minutes: 30 },
            { method: 'popup', minutes: 10 }
          ]
        }
      },
    });
    const meetLink = eventRes.data.conferenceData?.entryPoints?.find(e => e.entryPointType === 'video')?.uri || '';
    console.log('Calendar event created:', eventRes.data.id, 'Meet link:', meetLink);
    return { success: true, expert, meetLink, eventId: eventRes.data.id };
  } catch (err) {
    console.error('Calendar create error:', err.message);
    throw new functions.https.HttpsError('internal', 'Failed to create calendar event: ' + err.message);
  }
});

exports.store_booking = functions.https.onCall(async (data, context) => {
  const { name, email, phone, appointment, transcript } = data;
  const bookingData = {
    name: name || '',
    email: email || '',
    phone: phone || '',
    transcript: transcript || '',
    created: admin.firestore.FieldValue.serverTimestamp()
  };
  // Only add appointment if it's defined
  if (appointment) {
    bookingData.appointment = appointment;
  }
  await db.collection('bookings').add(bookingData);
  return { success: true };
});
