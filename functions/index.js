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
  const events = await calendar.events.list({
    calendarId: IDEUDAS_CALENDAR_ID,
    timeMin: now.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  });
  const slots = [];
  let current = new Date(now);
  current.setHours(9, 0, 0, 0);
  while (current < end) {
    const slotEnd = new Date(current.getTime() + 30 * 60 * 1000);
    if (slotEnd.getHours() > 18) {
      current.setDate(current.getDate() + 1);
      current.setHours(9, 0, 0, 0);
      continue;
    }
    const conflict = events.data.items.some(event => {
      const eventStart = new Date(event.start.dateTime || event.start.date);
      const eventEnd = new Date(event.end.dateTime || event.end.date);
      return current < eventEnd && slotEnd > eventStart;
    });
    if (!conflict) {
      slots.push({
        start: current.toISOString(),
        end: slotEnd.toISOString(),
        time: current.toLocaleString(),
      });
      if (slots.length >= 3) break;
    }
    current = slotEnd;
  }
  return { slots };
});

exports.calendar_create = functions.https.onCall(async (data, context) => {
  const { slot, name, email } = data;
  const calendar = getCalendarClient();
  const expert = assignExpert(slot);
  try {
    const eventRes = await calendar.events.insert({
      calendarId: IDEUDAS_CALENDAR_ID,
      sendUpdates: 'all',
      conferenceDataVersion: 1,
      requestBody: {
        summary: 'Free, No-Commitment Consultation - Ideudas',
        description: `Thank you for booking! This is your free consultation with ${expert.name}, an Ideudas legal expert. The Google Meet link is below.`,
        start: { dateTime: slot.start, timeZone: 'America/New_York' },
        end: { dateTime: slot.end, timeZone: 'America/New_York' },
        attendees: [
          { email: email, displayName: name, responseStatus: 'needsAction' },
          { email: expert.email, displayName: expert.name, responseStatus: 'needsAction' }
        ],
        conferenceData: {
          createRequest: {
            requestId: `${Date.now()}-${Math.floor(Math.random() * 10000)}`,
            conferenceSolutionKey: { type: 'hangoutsMeet' }
          }
        },
        guestCanModify: false,
        guestCanInviteOthers: false,
        guestCanSeeOtherGuests: true
      },
    });
    const meetLink = eventRes.data.conferenceData?.entryPoints?.find(e => e.entryPointType === 'video')?.uri || '';
    console.log('Calendar event created:', eventRes.data.id, 'with attendees:', eventRes.data.attendees);
    return { success: true, expert, meetLink, eventId: eventRes.data.id };
  } catch (err) {
    console.error('Calendar create error:', err.message);
    throw new functions.https.HttpsError('internal', 'Failed to create calendar event: ' + err.message);
  }
});

exports.store_booking = functions.https.onCall(async (data, context) => {
  const { name, email, phone, appointment, transcript } = data;
  await db.collection('bookings').add({
    name,
    email,
    phone,
    appointment,
    transcript,
    created: admin.firestore.FieldValue.serverTimestamp()
  });
  return { success: true };
});
