# Voice Booking Agent

A conversational AI-powered appointment booking system for legal consultations. Users interact with **Sofia**, an intelligent voice agent, to book free 30-minute consultations via their browser. The system automatically searches available calendar slots, creates calendar events with Google Meet links, and sends calendar invitations to users.

**Live Demo:** https://voicebookingagent.web.app

---

## 🌟 Features

### Core Functionality
- **AI Voice Agent (Sofia)** – Natural language conversation using OpenRouter LLM (GPT-3.5-turbo)
- **Speech-to-Text** – Browser-native speech recognition (Web Speech API) for English
- **Text-to-Speech** – Automatic voice synthesis with auto-listening between exchanges
- **Google Calendar Integration** – Real-time slot search, automatic booking, unique Google Meet links per appointment
- **Responsive Design** – Works seamlessly on desktop, tablet, and mobile devices
- **Automatic Expert Assignment** – Deterministic assignment of legal experts to consultations
- **Firestore Storage** – Complete booking history with transcripts

### Booking Flow
1. **User Registration** – Enter name, email, and phone number
2. **Voice Conversation** – Sofia greets the user and facilitates a natural dialogue
3. **Automatic Slot Search** – System finds available 30-minute slots within next 48 hours (9 AM – 6 PM EST)
4. **Instant Booking** – Sofia confirms slot selection and creates calendar event
5. **Calendar Invite** – User receives email with calendar invite and Google Meet link

---

## 📁 Project Structure

```
VoiceBookingAgent/
├── frontend/                    # React SPA
│   ├── public/
│   │   ├── logo.png            # Company logo
│   │   └── index.html
│   ├── src/
│   │   ├── App.js              # Main component (3-step booking flow)
│   │   ├── App.css             # Responsive styling
│   │   ├── firebase.js         # Firebase config & callable functions
│   │   └── index.js
│   ├── package.json
│   └── .gitignore
├── functions/                   # Firebase Cloud Functions
│   ├── index.js                # All backend functions
│   ├── service-account.json    # Google service account credentials
│   ├── package.json
│   └── .env                    # (Local dev only, not committed)
├── public/                      # Firebase Hosting root
├── firebase.json               # Firebase configuration
├── firestore.rules             # Firestore security rules
├── INITIAL_PROMPT.md           # Project requirements document
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** (v16+)
- **Firebase Account** (free tier works)
- **Google Cloud Project** with Calendar API enabled
- **OpenRouter API Key** (for GPT-3.5-turbo access)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/VoiceBookingAgent.git
   cd VoiceBookingAgent
   ```

2. **Install Firebase CLI**
   ```bash
   npm install -g firebase-tools
   ```

3. **Install dependencies**
   ```bash
   npm install
   cd frontend && npm install && cd ..
   cd functions && npm install && cd ..
   ```

4. **Set up Firebase project**
   ```bash
   firebase login
   firebase init
   ```
   Select: Hosting, Firestore, Functions

5. **Configure environment variables**
   - Set `OPENROUTER_API_KEY` as a Firebase secret:
     ```bash
     firebase functions:secrets:set OPENROUTER_API_KEY
     ```

6. **Add Google service account**
   - Create a service account in Google Cloud Console
   - Download JSON credentials → `functions/service-account.json`
   - Ensure service account has Calendar API access

7. **Update Firebase configuration**
   - Edit `frontend/src/firebase.js` with your Firebase project ID
   - Update `CALENDAR_ID` in `functions/index.js` to your Google Calendar

8. **Deploy**
   ```bash
   npm run build       # Build React frontend
   firebase deploy     # Deploy all (Hosting + Functions + Firestore)
   ```

---

## 🛠️ Technology Stack

### Frontend
- **React 18.2.0** – UI framework
- **Firebase SDK** – Client library for Cloud Functions and Firestore
- **Web Speech API** – Browser-native STT and TTS

### Backend
- **Firebase Cloud Functions** (Node.js 20) – Serverless backend
- **Firebase Admin SDK** – Database and service operations
- **Google APIs (googleapis)** – Calendar API integration
- **OpenRouter API** – GPT-3.5-turbo LLM access

### Infrastructure
- **Firebase Hosting** – Static site deployment
- **Firestore** – Real-time NoSQL database
- **Firebase Secrets Manager** – Secure credential storage

---

## 📋 API Endpoints (Cloud Functions)

### `llm_agent(data)`
Sends user message to LLM and returns agent response
```javascript
{
  messages: [{ role: 'user', content: 'Can I book a consultation?' }],
  model: 'openai/gpt-3.5-turbo'
}
```

### `calendar_search(data)`
Returns available 30-minute slots in next 48 hours
```javascript
// Returns:
{
  slots: [
    { start: ISO8601, end: ISO8601, time: 'Dec 10, 2025 10:00 AM' },
    ...
  ]
}
```

### `calendar_create(data)`
Books appointment and sends calendar invite
```javascript
{
  slot: { start: ISO8601, end: ISO8601, ... },
  name: 'John Doe',
  email: 'john@example.com'
}
// Returns:
{ success: true, expert: { name, email }, meetLink: 'https://...' }
```

### `store_booking(data)`
Saves booking and conversation transcript to Firestore
```javascript
{
  name, email, phone,
  appointment: { time, expert, meetLink },
  transcript: 'Full conversation log'
}
```

---

## 🔐 Security

### Firestore Rules
- Public read access to booking collection (minimal exposure)
- Authenticated write access for new bookings
- Service account access for calendar operations

### API Keys
- OpenRouter API key stored in Firebase Secrets (never in code)
- Google service account credentials not committed to repo
- Environment variables excluded via `.gitignore`

---

## 🧪 Testing

### Manual Testing Flow
1. Navigate to https://voicebookingagent.web.app
2. Fill form (name, email, phone)
3. Click "Start My Free Consultation Booking"
4. Speak naturally to Sofia (e.g., "I'd like to book a consultation")
5. Verify:
   - Sofia responds contextually
   - Auto-listening works after her response
   - Calendar invite arrives at your email

### Browser Console Logs
- LLM calls logged with full request/response
- Calendar operations logged with event IDs
- Speech recognition and synthesis events tracked

---

## 📊 Database Schema (Firestore)

### `bookings` Collection
```javascript
{
  name: string,
  email: string,
  phone: string,
  appointment: {
    start: ISO8601,
    end: ISO8601,
    time: string,
    expert: string,
    meetLink: string
  },
  transcript: string,  // Full conversation log
  created: timestamp
}
```

---

## 🐛 Known Limitations

- Speech recognition works best in quiet environments
- Web Speech API availability varies by browser (Chrome/Edge recommended)
- Google Meet links require Google account login
- Calendar invites depend on Google service account email verification

---

## 🚧 Future Enhancements

- [ ] Support multiple languages (Spanish, Portuguese)
- [ ] Advanced slot preferences (preferred time, expert selection)
- [ ] Appointment rescheduling/cancellation
- [ ] SMS reminders before consultation
- [ ] Video confirmation call with expert
- [ ] Integration with external booking systems (Calendly, Acuity Scheduling)
- [ ] Advanced NLP for better intent extraction

---

## 📝 License

This project is proprietary software. All rights reserved.

---

## 👤 Author

Built by [Your Name/Organization] using Google Cloud, Firebase, and OpenRouter

---

## 📞 Support

For issues or questions:
- Check `INITIAL_PROMPT.md` for project requirements
- Review Firebase Cloud Function logs in Console
- Check browser console for Speech API errors
- Verify Google Calendar API and service account permissions
