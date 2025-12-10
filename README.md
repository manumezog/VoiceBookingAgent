# Ideudas Client Capture & Appointment Setter

This project is a responsive single-page web application, designed to capture client information and book free, no-commitment consultations with legal experts via an AI voice agent.

## Structure
- `frontend/` — React SPA (optimized for laptop and mobile)
- `functions/` — Firebase Functions (Node.js backend for calendar and Firestore)
- `INITIAL_PROMPT.md` — Project requirements and flow

## Setup
1. Install Node.js and Firebase CLI
2. Run `firebase init` in the project root (enable Hosting, Firestore, Functions)
3. Scaffold React app in `frontend/`
4. Deploy with `firebase deploy`

## Features
- Responsive UI for all devices
- Voice agent booking flow
- Google Calendar integration
- Firestore data storage

Refer to `INITIAL_PROMPT.md` for detailed requirements.