# 💡 Vibecoding Prompt: Ideudas Client Capture and Appointment Setter

## 🎯 Project Goal
To create a simple, integrated web page that captures client contact information and automatically books a **free, no-commitment 30-minute consultation** with an Ideudas legal expert via an empathetic AI Voice Agent, sending an instant calendar invite upon confirmation.

## 1. 🏢 Company & Context

| Detail | Description |
| :--- | :--- |
| **Company Name** | Ideudas (advises on debt relief/bankruptcy) |
| **Service** | Free, no-commitment initial consultation with a human legal expert. |
| **Client Source** | A link sent via WhatsApp after the client clicked an ad and filled a form. |
| **Goal Timeline** | Book the consultation within the **next 48 hours**. |
| **Tone of Voice** | **Professional, empathetic, assuring, and efficient.** The agent must be non-judgmental and focus on helpful next steps. |

---

## 2. 🛠️ Technical Stack & Constraints

The solution must prioritize a low-cost/free implementation, utilizing Firebase for hosting and leveraging open-source/low-cost LLM/Voice solutions.

| Component | Technology/Solution | Constraint/Note |
| :--- | :--- | :--- |
| **Frontend/Hosting** | Firebase Hosting | Single-page application (SPA). Must be responsive. |
| **Voice Agent Backend** | Vocode (or similar open-source solution) | Focus on low-latency, high-quality voice using a cost-effective LLM. |
| **LLM Interface** | OpenRouter (or direct LLM API) | Connect the voice agent to a cost-effective model (e.g., GPT-3.5-turbo, specific low-cost open model). |
| **Database** | Firebase Firestore (or simple JSON object storage) | Store user details and the final appointment data. |
| **Calendar Integration** | **Google Calendar API** (via Firebase Function/Node Backend) | **Mandatory Read Access:** Check availability in the company's booking calendar. **Mandatory Write Access:** Create the new event. |
| **Ideudas Calendar ID** | `[PLACEHOLDER: Specific Google Calendar ID]` | Calendar to check for availability and create events. |

---

## 3. 🖥️ Application Flow & User Interface (UI/UX)

The flow is linear and designed for maximum conversion from the WhatsApp link.

### 3.1. Initial Screen & Data Capture (Step 1)

* **Layout:** Simple, branded SPA with the Ideudas logo.
* **Required Fields:**
    * **Full Name** (Recommended for personalization)
    * **Email Address** (Must be validated for invite sending)
    * **Phone Number** (Confirmable/Editable)
* **Call to Action (CTA):** A prominent button: **"Start My Free Consultation Booking"**.
* **Crucial Text:** "You are about to connect with an AI Voice Agent to book your free, no-commitment consultation."

### 3.2. Voice Agent Activation (Step 2)

* The form hides upon CTA click.
* A status indicator appears: **"Connecting with Ideudas Booking Agent..."**
* The page must display a **real-time transcription** of the conversation for accessibility and record-keeping.
* A clear **"End Call"** button must be present.

### 3.3. Confirmation & Success (Step 3)

* The voice chat automatically terminates upon confirmed booking.
* Success screen appears: **"Success! Your Appointment is Booked."**
* Displays **Appointment Details:** Date, Time, and Expert Name (if known).
* **Confirmation Message:** "A calendar invitation with your video call link has been sent to **[User's Email]**."

---

## 4. 🗣️ AI Voice Agent Core Logic & Personality

**Agent Name:** "Sofia."
**Agent Goal:** Secure a confirmed 30-minute booking within the next 48 hours in an available slot.

### 4.1. Initial Script

1.  **Greeting:** "Hello! Thank you for your interest in Ideudas. I'm Sofia, your AI booking assistant. Before we start, can you please confirm the email address we have for you is **[User's Email from Step 1]**?"
2.  **Next Prompt:** "Great. The next step is to schedule your **free, no-commitment 30-minute consultation** with one of our legal experts. Are you available for a quick chat sometime in the next 48 hours?"

### 4.2. **Mandatory Booking Logic (LLM + API Tooling)**

The LLM must be integrated with a backend function (exposed as a tool/API) to check calendar availability *before* suggesting any time. 

| Step | Agent Action (LLM Instruction) | Internal Logic (Backend/API) |
| :--- | :--- | :--- |
| **1. Define Search Range** | Agent confirms the 48-hour range. | Backend calculates `start_datetime` to `end_datetime` (48 hours later). |
| **2. Search Availability** | Agent invokes the calendar search function to find open 30-minute slots (e.g., between 9:00 AM and 6:00 PM EST). | **API Call:** `calendar_search` on the `Ideudas Calendar ID` within the 48-hour range. |
| **3. Propose Options** | Agent presents the top 2-3 available slots to the client. | **Agent Response Template:** "I have openings at **[Option 1 Time]**, **[Option 2 Time]**, or **[Option 3 Time]** today and tomorrow. Which one works best for you?" |
| **4. Handle Conflict** | If the user suggests a time, the agent must confirm it is still available via a quick check. | **IF unavailable:** Agent apologizes and redirects to the pre-analyzed available options. |
| **5. Final Booking** | Once the client agrees on a slot, the agent must lock the time. | **API Call:** `calendar_create` to immediately book the 30-minute event on the `Ideudas Calendar ID`. |
| **6. Final Confirmation** | Agent confirms the booking and receipt of the email invite. | **Agent Script:** "Perfect. I am confirming your free consultation for **[Day]** at **[Time]**. You will receive a calendar invite from Ideudas shortly with the video call link. Thank you!" |

### 4.3. Error Handling

* **No Availability:** If the 48-hour window is completely full, the agent must offer times in the next available 24-hour period and escalate the urgency (e.g., "The next available slot is on **[Date/Time]**. Shall I book that for you?")
* **No Commitment Emphasis:** The agent must be instructed to reiterate that the meeting is **FREE** and involves **NO OBLIGATION** if the client expresses hesitancy.

---

## 5. 📧 Post-Conversation Automation

This occurs immediately after the `calendar_create` API call succeeds.

1.  **Event Details:** The new event must be created on the Ideudas Google Calendar, which simultaneously sends the iCal invitation email to the client's confirmed email address.
    * **Title:** Free, No-Commitment Consultation - Ideudas
    * **Duration:** 30 minutes
    * **Description:** "Thank you for booking! This is your free consultation with an Ideudas legal expert to discuss your debt situation. This meeting is completely without commitment. **Join the meeting here:** [Static Video Conferencing Link (e.g., Google Meet/Zoom)]"
2.  **Internal Record:** The client's details and booking time must be permanently stored in Firestore for tracking and handover.

---