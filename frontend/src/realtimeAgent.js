/**
 * OpenAI Realtime API Integration
 * Provides voice conversation with real-time response
 */

class RealtimeAgent {
  constructor(apiKey, systemPrompt) {
    this.apiKey = apiKey;
    this.systemPrompt = systemPrompt;
    this.ws = null;
    this.isConnected = false;
    this.sessionId = null;
    this.onTranscript = null;
    this.onResponse = null;
    this.onError = null;
    this.conversationLog = [];
  }

  async connect() {
    return new Promise((resolve, reject) => {
      try {
        // Use ephemeral token for WebSocket connection
        const wsUrl = `wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-26`;
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
          console.log('[Realtime] Connected to OpenAI');
          this.isConnected = true;
          
          // Authenticate and configure session
          this.send({
            type: 'session.update',
            session: {
              modalities: ['text', 'audio'],
              instructions: this.systemPrompt,
              voice: 'alloy',
              input_audio_format: 'pcm16',
              output_audio_format: 'pcm16',
              input_audio_transcription: {
                model: 'whisper-1'
              },
              temperature: 0.7,
              max_response_output_tokens: 150
            }
          });
          
          resolve();
        };
        
        this.ws.onmessage = (event) => {
          this.handleMessage(JSON.parse(event.data));
        };
        
        this.ws.onerror = (error) => {
          console.error('[Realtime] WebSocket error:', error);
          if (this.onError) this.onError(error);
          reject(error);
        };
        
        this.ws.onclose = () => {
          console.log('[Realtime] Connection closed');
          this.isConnected = false;
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  send(message) {
    if (this.isConnected && this.ws) {
      this.ws.send(JSON.stringify(message));
    }
  }

  handleMessage(message) {
    console.log('[Realtime] Received:', message.type, message);
    
    switch (message.type) {
      case 'session.created':
        this.sessionId = message.session.id;
        console.log('[Realtime] Session created:', this.sessionId);
        break;
        
      case 'input_audio_buffer.speech_started':
        console.log('[Realtime] User started speaking');
        break;
        
      case 'input_audio_buffer.speech_stopped':
        console.log('[Realtime] User stopped speaking');
        break;
        
      case 'conversation.item.created':
        if (message.item.type === 'message') {
          this.conversationLog.push(message.item);
        }
        break;
        
      case 'response.text.delta':
        if (this.onResponse) {
          this.onResponse(message.delta);
        }
        break;
        
      case 'response.text.done':
        console.log('[Realtime] Response text complete');
        break;
        
      case 'response.audio_transcript.delta':
        if (this.onTranscript) {
          this.onTranscript(message.delta);
        }
        break;

      case 'input_audio_buffer.committed':
        console.log('[Realtime] Audio buffer committed');
        break;
        
      case 'response.done':
        console.log('[Realtime] Response complete');
        break;
        
      case 'error':
        console.error('[Realtime] API Error:', message.error);
        if (this.onError) this.onError(new Error(message.error.message));
        break;
    }
  }

  async startAudioInput(audioStream) {
    if (!this.isConnected) {
      throw new Error('Not connected to Realtime API');
    }

    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)({sampleRate: 24000});
      const source = audioContext.createMediaStreamSource(audioStream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);

      source.connect(processor);
      processor.connect(audioContext.destination);

      processor.onaudioprocess = (event) => {
        if (!this.isConnected) return;
        
        const audioData = event.inputBuffer.getChannelData(0);
        const pcmData = this.floatTo16BitPCM(audioData);
        const base64Audio = this.arrayBufferToBase64(pcmData);
        
        // Send audio data to OpenAI
        this.send({
          type: 'input_audio_buffer.append',
          audio: base64Audio
        });
      };

      // Create cleanup function
      const cleanup = () => {
        processor.disconnect();
        source.disconnect();
        audioContext.close();
      };

      return cleanup;
    } catch (err) {
      console.error('Error setting up audio input:', err);
      throw err;
    }
  }

  floatTo16BitPCM(floatArray) {
    const buffer = new ArrayBuffer(floatArray.length * 2);
    const view = new Int16Array(buffer);
    for (let i = 0; i < floatArray.length; i++) {
      const s = Math.max(-1, Math.min(1, floatArray[i]));
      view[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return buffer;
  }

  arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  updateSession(updates) {
    this.send({
      type: 'session.update',
      session: updates
    });
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.isConnected = false;
    }
  }
}

export default RealtimeAgent;
