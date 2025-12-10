import React, { useState, useRef, useEffect } from "react";
import './App.css';
import { calendarSearch, calendarCreate, storeBooking, llmAgent, getRealtimeToken, generateConversationSummary } from "./firebase";
import RealtimeAgent from "./realtimeAgent";

function App() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ name: "", email: "", phone: "", additionalEmails: "" });
  const [transcript, setTranscript] = useState("");
  const [liveLine, setLiveLine] = useState("");
  const [appointment, setAppointment] = useState(null);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);
  const transcriptBoxRef = useRef(null);
  const [calendarLog, setCalendarLog] = useState("");
  const [isAutoListening, setIsAutoListening] = useState(false);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [conversation, setConversation] = useState([]);
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [conversationSummary, setConversationSummary] = useState("");
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [unspokenText, setUnspokenText] = useState(""); // Track text that couldn't be spoken
  const realtimeAgentRef = useRef(null);
  const audioStreamRef = useRef(null);
  const [useRealtime, setUseRealtime] = useState(false); // Disabled for now - use traditional mode
  const defaultPrompt = `Eres Manuel, asistente virtual de reservas de Ideudas (consultoría legal de alivio de deudas).

OBJETIVO: Agendar una consulta gratuita de 30 minutos lo MÁS RÁPIDO posible. Mantén la llamada CORTA.

CONTEXTO DEL CLIENTE:
- Nombre: {name}
- Email: {email}
- Teléfono: {phone}
- Ya ha proporcionado estos datos en el formulario inicial.

REGLAS CRÍTICAS:
1. NUNCA saludes más de una vez. Después del saludo inicial, ve DIRECTO al grano.
2. NUNCA preguntes nombre, email o teléfono - ya los tienes en el contexto.
3. SIEMPRE di las horas con "de la mañana" o "de la tarde" (ejemplo: "10 de la mañana", "3 de la tarde").
4. SIEMPRE menciona que el cliente puede pulsar directamente el botón con el horario que prefiera.
5. Respuestas ULTRA CORTAS - máximo 2 frases.
6. Cuando el usuario confirme o diga "sí", di SOLO: "Perfecto, tu cita queda reservada. Recibirás la invitación por email. ¡Hasta pronto!" y TERMINA.
7. NO hagas preguntas innecesarias. NO pidas confirmaciones extra.
8. Si el usuario menciona una hora, ACEPTA y RESERVA inmediatamente.
9. Responde SIEMPRE en español.
10. Tu meta es terminar la llamada en menos de 3 intercambios.
11. Mantén el contexto de la conversación - si el usuario menciona un problema con las fechas, entiende que necesita horarios disponibles.
12. Si el usuario da información sobre su situación (ej: "jueves 11 de diciembre"), úsala para ofrecer horarios cercanos a esa preferencia.`;
  const [systemPrompt, setSystemPrompt] = useState(defaultPrompt);

  useEffect(() => {
    if (transcriptBoxRef.current) {
      transcriptBoxRef.current.scrollTop = transcriptBoxRef.current.scrollHeight;
    }
  }, [transcript, liveLine]);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  function extractDateTime(text) {
    const dateRegex = /(\w{3,9} \d{1,2}, \d{4} \d{1,2}:\d{2} ?[APMapm]{0,2})|((\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}))/;
    const match = text.match(dateRegex);
    return match ? match[0] : null;
  }

  // Safe speech synthesis with fallback for mobile
  function speak(text, onEnd) {
    if (!('speechSynthesis' in window)) {
      setUnspokenText(text);
      if (onEnd) setTimeout(onEnd, 500);
      return;
    }

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'es-ES';
      utterance.rate = 1.5;
      utterance.pitch = 1;
      utterance.volume = 1;
      
      utterance.onstart = () => {
        console.log('✓ Audio iniciado');
        setCalendarLog(prev => prev + '\n[Audio] ▶ Reproduciendo...');
      };
      
      utterance.onend = () => {
        console.log('✓ Audio completado');
        setUnspokenText("");
        if (onEnd) onEnd();
      };
      
      utterance.onerror = (event) => {
        console.error('✗ Error de audio:', event.error);
        setUnspokenText(text); // Show text as fallback
        if (onEnd) onEnd();
      };
      
      const result = window.speechSynthesis.speak(utterance);
      console.log('Iniciando speech:', result);
    } catch (err) {
      console.error('Speech error:', err);
      setUnspokenText(text);
      if (onEnd) onEnd();
    }
  }

  // Detect if user is confirming/accepting a time
  function detectConfirmation(text) {
    const lower = text.toLowerCase().trim();
    const confirmWords = ['sí', 'si', 'ok', 'vale', 'perfecto', 'bien', 'de acuerdo', 'esa', 'ese', 'la primera', 'la segunda', 'primera', 'segunda', 'confirmo', 'adelante', 'listo', 'genial', 'claro'];
    return confirmWords.some(word => lower.includes(word));
  }

  // Find matching slot from user input
  function findMatchingSlot(text, slots) {
    const lower = text.toLowerCase();
    
    // Check for ordinal references
    if (lower.includes('primera') || lower.includes('la 1') || lower.includes('esa')) {
      return slots[0];
    }
    if (lower.includes('segunda') || lower.includes('la 2')) {
      return slots[1];
    }
    
    // Try to match time patterns: "12 del mediodía", "las 12", "12 pm", etc.
    let targetHour = null;
    
    // IMPROVED: Match time AFTER "de la tarde/mañana/mediodía" to avoid matching dates
    // Pattern: "X de la tarde" or "X de la mañana" or "X del mediodía"
    const timePatternTarde = /(\d{1,2})\s*(?:y\s*media|\s*y\s*30)?\s*de\s*la\s*tarde/i;
    const timePatternManana = /(\d{1,2})\s*(?:y\s*media|\s*y\s*30)?\s*de\s*la\s*mañana/i;
    const timePatternMedioDia = /(\d{1,2})\s*(?:y\s*media|\s*y\s*30)?\s*del?\s*mediodía/i;
    const timePatternSimple = /las\s*(\d{1,2})\s*(?:horas)?/i;
    
    let timeMatch = text.match(timePatternTarde);
    let hour = null;
    if (timeMatch) {
      hour = parseInt(timeMatch[1]);
      if (hour < 12) hour += 12; // Convert afternoon times to 24h format
      targetHour = hour;
      console.log('Matched tarde pattern, hour:', hour);
    } else {
      timeMatch = text.match(timePatternManana);
      if (timeMatch) {
        hour = parseInt(timeMatch[1]);
        if (hour === 12) hour = 0; // 12 mañana = midnight
        targetHour = hour;
        console.log('Matched mañana pattern, hour:', hour);
      } else {
        timeMatch = text.match(timePatternMedioDia);
        if (timeMatch) {
          hour = parseInt(timeMatch[1]);
          targetHour = hour; // Mediodía stays as is (12)
          console.log('Matched mediodía pattern, hour:', hour);
        } else {
          timeMatch = text.match(timePatternSimple);
          if (timeMatch) {
            hour = parseInt(timeMatch[1]);
            // If time is 1-11 and afternoon context, assume PM
            if (hour < 12 && (lower.includes('tarde') || lower.includes('pm'))) {
              hour += 12;
            }
            targetHour = hour;
            console.log('Matched simple pattern, hour:', hour);
          }
        }
      }
    }
    
    // Find slot that matches the hour
    if (targetHour !== null) {
      const matched = slots.find(slot => {
        const slotDate = new Date(slot.start);
        const slotHour = slotDate.getHours();
        console.log(`Comparing slot hour ${slotHour} with target hour ${targetHour}`);
        return slotHour === targetHour || slotHour === (targetHour % 24);
      });
      
      if (matched) {
        console.log(`✓ Matched slot with hour ${targetHour}: ${matched.start}`);
        return matched;
      } else {
        console.log(`✗ No slot found matching hour ${targetHour}`);
      }
    }
    
    // If user just confirms without specifying time, return first available
    if (detectConfirmation(text) && !lower.includes('diciembre') && !lower.includes('jueves')) {
      return slots[0];
    }
    
    return null;
  }

  const handleSpeechEnd = async (finalTranscript) => {
    if (!finalTranscript.trim()) return;
    setIsAutoListening(false);

    console.log('User said:', finalTranscript);

    // Esperar a que los slots estén disponibles (máx 1s)
    let retries = 0;
    let slotsReady = availableSlots && availableSlots.length > 0;
    while (!slotsReady && retries < 10) {
      await new Promise(res => setTimeout(res, 100));
      slotsReady = availableSlots && availableSlots.length > 0;
      retries++;
    }
    console.log('Available slots:', availableSlots);

    // Check if user is confirming a time slot
    const matchedSlot = findMatchingSlot(finalTranscript, availableSlots);
    console.log('Matched slot:', matchedSlot);

    if (matchedSlot) {
      // User confirmed! Book immediately without asking LLM
      setTranscript(t => t + (t ? '\n' : '') + 'User: ' + finalTranscript);
      setCalendarLog(prev => prev + `\n[Reserva] Usuario confirmó horario`);
      setCalendarLog(prev => prev + `\n[Calendario] Creando evento para: ${matchedSlot.time}...`);

      try {
        const additionalEmails = form.additionalEmails ? form.additionalEmails.split(',').map(e => e.trim()).filter(e => e) : [];
        const createRes = await calendarCreate({ slot: matchedSlot, name: form.name, email: form.email, phone: form.phone, additionalEmails });
        setCalendarLog(prev => prev + `\n[Calendario] Evento creado exitosamente`);
        setCalendarLog(prev => prev + `\n[Calendario] Enviando invitación a ${form.email}...`);
        await storeBooking({ name: form.name, email: form.email, phone: form.phone, appointment: matchedSlot, transcript });
        setAppointment(matchedSlot);
        setCalendarLog(prev => prev + '\n[Calendario] ✓ Reserva completada exitosamente');
        
        // Say goodbye and end call
        const goodbye = `Perfecto ${form.name}, tu cita queda reservada para ${matchedSlot.time}. Recibirás la invitación en ${form.email}. ¡Hasta pronto!`;
        setTranscript(t => t + '\nManuel: ' + goodbye);
        
        speak(goodbye, () => setStep(3));
        return;
      } catch (err) {
        console.error('Booking error:', err);
        setCalendarLog(prev => prev + `\n[Error] ${err.message}`);
      }
    }
    
    // No confirmation detected, proceed with LLM
    // Include system message with user context and available slots
    const systemMessage = systemPrompt
      .replace('{name}', form.name)
      .replace('{email}', form.email)
      .replace('{phone}', form.phone);
    
    const slotsContext = availableSlots.length > 0 
      ? `\n\nHORARIOS DISPONIBLES:\n${availableSlots.map((s, i) => `${i + 1}. ${s.time}`).join('\n')}`
      : '';
    
    const updated = [
      { role: 'system', content: systemMessage + slotsContext },
      ...conversation,
      { role: 'user', content: finalTranscript }
    ];
    setConversation(updated);
    try {
      console.log('Calling LLM with messages:', updated);
      setCalendarLog(prev => prev + '\n[LLM] Procesando solicitud...');
      const res = await llmAgent({ messages: updated });
      console.log('LLM response:', res);
      const reply = res.data?.reply || '';
      if (!reply) {
        setTranscript(t => t + '\nManuel: (Sin respuesta del LLM)');
        return;
      }
      setConversation(c => [...c, { role: 'assistant', content: reply }]);
      setTranscript(t => t + (t ? '\n' : '') + 'Manuel: ' + reply);
      
      if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(reply);
        utterance.lang = 'es-ES';
        utterance.rate = 1.5;
        utterance.pitch = 1;
        utterance.volume = 1;
        window.speechSynthesis.cancel();
        
        utterance.onend = () => {
          setTimeout(() => {
            setIsAutoListening(true);
            startListening();
          }, 500); // Reduced from 1000ms
        };
        
        speak(reply, () => {
          setTimeout(() => {
            setIsAutoListening(true);
            startListening();
          }, 500); // Reduced from 1000ms
        });
      }
      } catch (err) {
        console.error('Error in handleSpeechEnd:', err);
        setCalendarLog(prev => prev + `\n[Error] ${err.message}`);
        setTranscript(t => t + '\nManuel: (Error: ' + err.message + ')');
    }
  };

  const startListening = () => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      setTranscript('Reconocimiento de voz no soportado en este navegador.');
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'es-ES';
    recognition.interimResults = true;
    recognition.continuous = false; // Stop automatically when speech ends
    let finalTranscript = '';
    recognition.onresult = (event) => {
      let interim = '';
      if (event.resultIndex === 0) {
        finalTranscript = '';
      }
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
        } else {
          interim += transcript;
        }
      }
      setLiveLine((finalTranscript + interim).trim());
    };
    recognition.onend = () => {
      setListening(false);
      if (finalTranscript.trim()) {
        const cleaned = finalTranscript.trim();
        setTranscript(t => t + (t ? '\n' : '') + 'User: ' + cleaned);
        setLiveLine('');
        handleSpeechEnd(cleaned);
      } else {
        setLiveLine('');
        if (isAutoListening) {
          setTimeout(() => startListening(), 300); // Reduced from 500ms
        }
      }
    };
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      setIsAutoListening(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStep(2);
    setCalendarLog('[Inicio] Conversación iniciada\n[Audio] Configurado en español');
    
    // Store booking in background (don't block on it)
    storeBooking({ name: form.name, email: form.email, phone: form.phone, transcript: '' })
      .catch(err => console.log('Store booking error (non-blocking):', err));
    
    // Fetch available slots first
    setCalendarLog(prev => prev + '\n[Calendario] Buscando franjas disponibles...');
    let slotsText = "mañana a las 10am o a las 3pm";
    let slots = [];
    try {
      const slotRes = await calendarSearch({});
      slots = slotRes.data?.slots || [];
      setAvailableSlots(slots); // Save slots for later use
      setCalendarLog(prev => prev + `\n[Calendario] Se encontraron ${slots.length} franjas`);
      if (slots.length >= 2) {
        slotsText = `${slots[0].time} o ${slots[1].time}`;
      } else if (slots.length === 1) {
        slotsText = slots[0].time;
      }
    } catch (err) {
      console.log('Error fetching slots:', err);
    }
    
    const userContext = `DATOS DEL USUARIO (NO preguntar):
- Nombre: ${form.name}
- Email: ${form.email}
- Teléfono: ${form.phone}

FRANJAS DISPONIBLES: ${slotsText}

INSTRUCCIÓN: Ya saludaste. A partir de ahora, respuestas de máximo 1-2 frases. Si el usuario confirma cualquier hora, reserva y despídete. Recuerda mencionar que pueden pulsar el botón del horario preferido.`;
    
    const intro = `¡Hola ${form.name}! Soy Manuel de Ideudas. Tengo disponible ${slotsText}. Puedes decirme cuál prefieres o pulsar directamente el botón del horario que te venga mejor.`;
    
    // Initialize conversation with full context
    setConversation([
      { role: 'system', content: systemPrompt },
      { role: 'system', content: userContext },
      { role: 'assistant', content: intro }
    ]);
    
    // If using Realtime, skip the intro TTS and go directly to connection
    if (useRealtime) {
      setTranscript('');
      setCalendarLog(prev => prev + '\n[Realtime] Iniciando conexión en vivo...');
      setTimeout(() => {
        initializeRealtime();
      }, 500);
      return;
    }
    
    setTranscript('Manuel: ' + intro);
    setCalendarLog(prev => prev + '\n[TTS] Iniciando síntesis de voz...');
    
    // Speak the greeting
    if ('speechSynthesis' in window) {
      // Cancel any existing speech
      window.speechSynthesis.cancel();
      
      setTimeout(() => {
        const utterance = new SpeechSynthesisUtterance(intro);
        utterance.lang = 'es-ES';
        utterance.rate = 1.5;
        utterance.pitch = 1;
        utterance.volume = 1;
        
        utterance.onstart = () => {
          console.log('Speech synthesis started');
          setCalendarLog(prev => prev + '\n[TTS] ▶ Hablando...');
        };
        
        utterance.onerror = (event) => {
          console.error('Speech synthesis error:', event.error);
          setCalendarLog(prev => prev + `\n[TTS] ✗ Error: ${event.error}`);
          // Auto-start listening even if TTS fails
          setTimeout(() => {
            setIsAutoListening(true);
            startListening();
          }, 1000);
        };
        
        utterance.onend = () => {
          console.log('Speech synthesis ended');
          setCalendarLog(prev => prev + '\n[TTS] ✓ Completado. Iniciando escucha...');
          setTimeout(() => {
            if (useRealtime) {
              initializeRealtime();
            } else {
              setIsAutoListening(true);
              startListening();
            }
          }, 1000);
        };
        
        window.speechSynthesis.speak(utterance);
      }, 100);
    } else {
      setCalendarLog(prev => prev + '\n[TTS] ✗ Síntesis de voz no disponible');
      // Auto-start listening if TTS not available
      setTimeout(() => {
        if (useRealtime) {
          initializeRealtime();
        } else {
          setIsAutoListening(true);
          startListening();
        }
      }, 1000);
    }
  };

  const initializeRealtime = async () => {
    try {
      setCalendarLog(prev => prev + '\n[Realtime] Iniciando modo conversación mejorado...');
      
      setListening(true);
      setCalendarLog(prev => prev + '\n[Audio] Escuchando...');
      
      // For now, use Deepgram-style approach: Use Web Speech API but with continuous mode
      // This gives us better real-time feel while avoiding audio WebSocket complexity
      startListening();

    } catch (error) {
      console.error('Failed to initialize Realtime:', error);
      setCalendarLog(prev => prev + `\n[Error] ${error.message}`);
      setUseRealtime(false);
      setTimeout(() => {
        setIsAutoListening(true);
        startListening();
      }, 1000);
    }
  };

  const stopRealtime = () => {
    // Currently using Web Speech API, so nothing special to clean up
    // This is here for future expansion
  };

  // Handle slot button click - book immediately
  const handleSlotClick = async (slot) => {
    setCalendarLog(prev => prev + `\n[Reserva] Usuario seleccionó: ${slot.time}`);
    setCalendarLog(prev => prev + `\n[Calendario] Creando evento...`);
    
    try {
      const additionalEmails = form.additionalEmails ? form.additionalEmails.split(',').map(e => e.trim()).filter(e => e) : [];
      const createRes = await calendarCreate({ slot, name: form.name, email: form.email, phone: form.phone, additionalEmails });
      setCalendarLog(prev => prev + `\n[Calendario] Evento creado exitosamente`);
      setCalendarLog(prev => prev + `\n[Calendario] Enviando invitación a ${form.email}...`);
      await storeBooking({ name: form.name, email: form.email, phone: form.phone, appointment: slot, transcript });
      setAppointment(slot);
      setCalendarLog(prev => prev + '\n[Calendario] ✓ Reserva completada');
      
      // Say goodbye
      const goodbye = `Perfecto ${form.name}, tu cita queda reservada para ${slot.time}. Recibirás la invitación en ${form.email}. ¡Hasta pronto!`;
      setTranscript(t => t + '\nManuel: ' + goodbye);
      
      // Stop listening
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      window.speechSynthesis.cancel();
      
      speak(goodbye, () => setStep(3));
    } catch (err) {
      console.error('Booking error:', err);
      setCalendarLog(prev => prev + `\n[Error] ${err.message}`);
      setTranscript(t => t + '\nManuel: Hubo un error al reservar. Por favor, intenta de nuevo.');
    }
  };

  const handleEndCall = async () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    stopRealtime(); // Stop Realtime connection if active
    window.speechSynthesis.cancel();
    setListening(false);
    setIsAutoListening(false);
    
    // Generate conversation summary
    setLoadingSummary(true);
    try {
      const result = await generateConversationSummary({ transcript });
      setConversationSummary(result.data.summary);
    } catch (err) {
      console.error('Summary generation error:', err);
      setConversationSummary('No se pudo generar el resumen');
    } finally {
      setLoadingSummary(false);
    }
    
    // Show success screen with conversation summary
    setStep(3);
  };

  return (
    <div className="container">
      <header>
        <img src="/logo.png" alt="Ideudas Logo" className="logo" />
      </header>
      {step === 1 && (
        <form className="form" onSubmit={handleSubmit}>
          <h2>Reserva tu Consulta Gratuita</h2>
          <input name="name" type="text" placeholder="Nombre Completo" required value={form.name} onChange={handleChange} />
          <input name="email" type="email" placeholder="Correo Electrónico" required value={form.email} onChange={handleChange} />
          <input name="phone" type="tel" placeholder="Número de Teléfono" required value={form.phone} onChange={handleChange} />
          <input name="additionalEmails" type="text" placeholder="Emails Adicionales (separados por comas, opcional)" value={form.additionalEmails} onChange={handleChange} />
          <button type="submit" className="cta">Comenzar Reserva de Consulta Gratuita</button>
          <p className="info">Estás a punto de conectar con un Agente de Voz IA para reservar tu consulta gratuita sin compromiso.</p>
          
          <div className="prompt-editor-toggle">
            <button type="button" className="toggle-btn" onClick={() => setShowPromptEditor(!showPromptEditor)}>
              {showPromptEditor ? '▼ Ocultar' : '▶ Mostrar'} Instrucciones del Agente (Modo Prototipo)
            </button>
          </div>
          {showPromptEditor && (
            <div className="prompt-editor">
              <label>Instrucciones del Voice Agent:</label>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={12}
                placeholder="Escribe las instrucciones para el agente..."
              />
              <button type="button" className="reset-btn" onClick={() => setSystemPrompt(defaultPrompt)}>
                Restaurar Instrucciones Predeterminadas
              </button>
            </div>
          )}

          <div className="prompt-editor-toggle">
            <label style={{display: 'flex', alignItems: 'center', gap: '10px', marginTop: '1.5rem', cursor: 'pointer', opacity: 0.6}}>
              <input 
                type="checkbox" 
                checked={useRealtime} 
                onChange={(e) => setUseRealtime(e.target.checked)}
                style={{width: '18px', height: '18px', cursor: 'pointer'}}
                disabled
              />
              <span style={{fontSize: '0.95rem', color: '#999'}}>
                🔄 Modo Realtime (En Desarrollo)
              </span>
            </label>
            <p style={{fontSize: '0.85rem', color: '#ccc', margin: '0.5rem 0 0 28px'}}>
              Próximamente: Conversación completamente en tiempo real
            </p>
          </div>
        </form>
      )}
      {step === 2 && (
        <div className="voice-agent">
          <div className="status">Conectando con el Agente de Reservas de Ideudas...</div>
          <div className="transcript">
            <h3>Transcripción en Vivo</h3>
            <div className="transcript-box" ref={transcriptBoxRef}>
              {transcript ? (
                <>
                  {transcript.split('\n').filter(line => line.trim()).map((line, idx) => (
                    <div key={idx} className={`message ${line.startsWith('Manuel:') ? 'sofia-message' : 'user-message'}`}>
                      {line}
                    </div>
                  ))}
                  {liveLine && (
                    <div className="message live-message">🎤 {liveLine}</div>
                  )}
                </>
              ) : (
                <div className="message" style={{color: '#999'}}>(La transcripción aparecerá aquí)</div>
              )}
            </div>
          </div>
          
          {availableSlots.length > 0 && (
            <div className="slot-buttons">
              <h4>📅 Selecciona un horario:</h4>
              <div className="slots-grid">
                {availableSlots.map((slot, idx) => (
                  <button
                    key={idx}
                    className="slot-btn"
                    onClick={() => handleSlotClick(slot)}
                  >
                    {slot.time}
                  </button>
                ))}
              </div>
            </div>
          )}
          
          <div className="calendar-log">
            <h3>Registro de Calendario</h3>
            <div className="log-box">{calendarLog || "(Los registros aparecerán aquí)"}</div>
          </div>
          <button className="end-call" onClick={handleEndCall}>Finalizar Llamada</button>
        </div>
      )}
      {step === 3 && (
        <div className="success">
          {appointment ? (
            <>
              <h2>¡Éxito! Tu Cita Ha Sido Reservada.</h2>
              <p><strong>Fecha:</strong> {appointment.date || appointment.time?.split(' ')[0]}</p>
              <p><strong>Hora:</strong> {appointment.time}</p>
              <p>Una invitación de calendario con tu enlace de videollamada ha sido enviada a <strong>{form.email}</strong>.</p>
            </>
          ) : (
            <>
              <h2>Fin de la Llamada</h2>
              <p>Gracias por usar el Agente de Reservas de Ideudas.</p>
            </>
          )}
          
          <div className="conversation-summary">
            <h3>📝 Resumen de la Conversación</h3>
            <div className="summary-box">
              {loadingSummary ? (
                <p style={{fontStyle: 'italic', color: '#999'}}>Generando resumen...</p>
              ) : (
                <p>{conversationSummary}</p>
              )}
            </div>
          </div>
          
          {unspokenText && (
            <div style={{padding: '1rem', backgroundColor: '#fff3cd', borderRadius: '8px', marginBottom: '1rem', border: '1px solid #ffc107'}}>
              <p><strong>🔊 Mensaje de audio no se escuchó en tu dispositivo:</strong></p>
              <p style={{marginBottom: '1rem', color: '#333'}}>{unspokenText}</p>
              <button onClick={() => speak(unspokenText)} className="cta" style={{width: '100%'}}>
                ▶ Reproducir Audio
              </button>
            </div>
          )}
          
          <div className="calendar-log">
            <h3>📋 Registro de Acciones</h3>
            <div className="log-box">{calendarLog}</div>
          </div>
          
          {appointment && (
            <div className="calendar-log">
              <h3>✓ Detalles de Reserva</h3>
              <div className="log-box">{calendarLog}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
