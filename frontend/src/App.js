import React, { useState, useRef } from "react";
import './App.css';
import { calendarSearch, calendarCreate, storeBooking, llmAgent } from "./firebase";

function App() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [transcript, setTranscript] = useState("");
  const [appointment, setAppointment] = useState(null);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);
  const [conversation, setConversation] = useState([
    { role: 'system', content: 'You are Sofia, an empathetic, professional AI booking agent for Ideudas. Your job is to help the user book a free, no-commitment 30-minute consultation in the next 48 hours. Always check available slots before suggesting times. Be friendly, non-judgmental, and efficient.' }
  ]);

  // Responsive form handler
  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  // Voice agent: browser speech-to-text
  // On speech end, send to LLM
  // Helper: Try to extract a date/time from LLM reply (simple regex, can be improved)
  function extractDateTime(text) {
    // Looks for e.g. "Dec 12, 2025 10:00 AM" or "2025-12-12 10:00"
    const dateRegex = /(\w{3,9} \d{1,2}, \d{4} \d{1,2}:\d{2} ?[APMapm]{0,2})|((\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}))/;
    const match = text.match(dateRegex);
    return match ? match[0] : null;
  }

  // Try to automate booking if LLM confirms a time
  const handleSpeechEnd = async (finalTranscript) => {
    if (!finalTranscript.trim()) return;
    const updated = [
      ...conversation,
      { role: 'user', content: finalTranscript }
    ];
    setConversation(updated);
    setTranscript(t => t + '\nUser: ' + finalTranscript);
    // Call LLM agent
    try {
      console.log('Calling LLM with messages:', updated);
      const res = await llmAgent({ messages: updated });
      console.log('LLM response:', res);
      const reply = res.data?.reply || '';
      if (!reply) {
        setTranscript(t => t + '\nSofia: (No response from LLM)');
        return;
      }
      setConversation(c => [...c, { role: 'assistant', content: reply }]);
      setTranscript(t => t + '\nSofia: ' + reply);
      
      // Speak the response using Web Speech API (English)
      if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(reply);
        utterance.lang = 'en-US';
        utterance.rate = 1;
        utterance.pitch = 1;
        utterance.volume = 1;
        window.speechSynthesis.cancel(); // Cancel any previous speech
        
        // Auto-start listening after Sofia finishes speaking
        utterance.onend = () => {
          setTimeout(() => {
            startListening();
          }, 1000); // 1 second delay before listening again
        };
        
        window.speechSynthesis.speak(utterance);
      }

      // Try to extract a date/time and automate booking
      const dt = extractDateTime(reply);
      let slotRes = await calendarSearch({});
      let slots = slotRes.data?.slots || [];
      if (dt) {
        // Try to find a slot that matches the extracted time (loose match)
        let found = slots.find(s => s.time.includes(dt) || s.start.includes(dt));
        // If not found, escalate to next 24h
        if (!found && slots.length === 0) {
          // Try next 24h
          const now = new Date();
          const next24h = new Date(now.getTime() + 72 * 60 * 60 * 1000);
          slotRes = await calendarSearch({ timeMin: now.toISOString(), timeMax: next24h.toISOString() });
          slots = slotRes.data?.slots || [];
          found = slots.find(s => s.time.includes(dt) || s.start.includes(dt));
        }
        if (found) {
          // Book it and get expert
          const createRes = await calendarCreate({ slot: found, name: form.name, email: form.email });
          const expert = createRes.data?.expert || { name: 'Ideudas Expert' };
          await storeBooking({ name: form.name, email: form.email, phone: form.phone, appointment: { ...found, expert: expert.name }, transcript: transcript });
          setAppointment({ ...found, expert: expert.name });
          setStep(3);
          setTranscript(t => t + `\nSofia: Your appointment for ${found.time} with ${expert.name} is confirmed! A calendar invite has been sent to ${form.email}.`);
        } else {
          setTranscript(t => t + '\nSofia: Sorry, that slot is no longer available. Here are some alternatives: ' + slots.map(s => s.time).join(', '));
        }
      } else if (slots.length === 0) {
        setTranscript(t => t + '\nSofia: Sorry, there are no available slots in the next 48 hours. The next available slot is in the following 24 hours.');
      }
    } catch (err) {
      console.error('Error in handleSpeechEnd:', err);
      setTranscript(t => t + '\nSofia: (Error: ' + err.message + ')');
    }
  };

  const startListening = () => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      setTranscript('Live transcription not supported in this browser.');
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = false;
    let finalTranscript = '';
    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
        } else {
          interim += transcript;
        }
      }
      setTranscript(finalTranscript + interim);
    };
    recognition.onend = () => {
      setListening(false);
      if (finalTranscript.trim()) handleSpeechEnd(finalTranscript.trim());
    };
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStep(2);
    await storeBooking({ name: form.name, email: form.email, phone: form.phone, transcript: '' });
    // Greet and ask for confirmation via LLM
    const intro = `Hello! Thank you for your interest in Ideudas. I'm Sofia, your AI booking assistant. Before we start, can you please confirm the email address we have for you is ${form.email}?`;
    setTranscript('Sofia: ' + intro);
    setConversation(c => [...c, { role: 'assistant', content: intro }]);
    
    // Speak the intro greeting
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(intro);
      utterance.lang = 'en-US';
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.volume = 1;
      
      // Auto-start listening after intro greeting
      utterance.onend = () => {
        setTimeout(() => {
          startListening();
        }, 1000);
      };
      
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleEndCall = async () => {
    // Simulate booking confirmation
    const slot = { date: "Dec 12, 2025", time: "10:00 AM", expert: "Maria Lopez" };
    try {
      await calendarCreate({ slot });
      await storeBooking({ name: form.name, email: form.email, phone: form.phone, appointment: slot });
      setAppointment(slot);
      setStep(3);
    } catch (err) {
      setTranscript("Sofia: There was an error booking your appointment. Please try again later.");
    }
  };

  return (
    <div className="container">
      <header>
        <img src="/logo.png" alt="Ideudas Logo" className="logo" />
      </header>
      {step === 1 && (
        <form className="form" onSubmit={handleSubmit}>
          <h2>Book Your Free Consultation</h2>
          <input name="name" type="text" placeholder="Full Name" required value={form.name} onChange={handleChange} />
          <input name="email" type="email" placeholder="Email Address" required value={form.email} onChange={handleChange} />
          <input name="phone" type="tel" placeholder="Phone Number" required value={form.phone} onChange={handleChange} />
          <button type="submit" className="cta">Start My Free Consultation Booking</button>
          <p className="info">You are about to connect with an AI Voice Agent to book your free, no-commitment consultation.</p>
        </form>
      )}
      {step === 2 && (
        <div className="voice-agent">
          <div className="status">Connecting with Ideudas Booking Agent...</div>
          <div className="transcript">
            <h3>Live Transcription</h3>
            <div className="transcript-box">{transcript || "(Transcription will appear here)"}</div>
          </div>
          {!listening ? (
            <button className="cta" onClick={startListening} type="button">Start Voice Transcription</button>
          ) : (
            <button className="cta" onClick={stopListening} type="button">Stop Transcription</button>
          )}
          <button className="end-call" onClick={handleEndCall}>End Call</button>
        </div>
      )}
      {step === 3 && appointment && (
        <div className="success">
          <h2>Success! Your Appointment is Booked.</h2>
          <p><strong>Date:</strong> {appointment.date || appointment.time?.split(' ')[0]}</p>
          <p><strong>Time:</strong> {appointment.time}</p>
          <p><strong>Expert:</strong> {appointment.expert}</p>
          <p>A calendar invitation with your video call link has been sent to <strong>{form.email}</strong>.</p>
        </div>
      )}
    </div>
  );
}

export default App;
