import { useState, useRef, useCallback, useEffect } from 'react';

interface VoiceState {
  isListening: boolean;
  isSpeaking: boolean;
  transcript: string;
  error: string | null;
  isSupported: boolean;
}

interface VoiceSettings {
  voiceRate?: number;
  voicePitch?: number;
  voiceName?: string;
}

const GEARHEAD_GREETINGS = [
  "Hello, I'm Gearhead, your automotive AI companion. How can I assist you today?",
  "Hey there, mechanic! Gearhead here, ready to help diagnose any issue.",
  "Gearhead online. What vehicle problem can I help you solve?",
  "At your service! I'm Gearhead, let's get that engine running smoothly.",
  "Gearhead reporting in. Tell me about the issue you're experiencing.",
];

const GEARHEAD_ACKNOWLEDGMENTS = [
  "Got it. Let me analyze that for you...",
  "Understood. Running diagnostics now...",
  "I'm on it. Checking my database for solutions...",
  "Roger that. Processing your query...",
  "Analyzing the problem. One moment...",
];

const GEARHEAD_RESULT_INTROS = [
  "Here's what I found for you.",
  "Based on my analysis, here's my assessment.",
  "I've completed my diagnostic review. Here are the results.",
  "My analysis is complete. Let me walk you through the findings.",
  "I've identified some key information about your issue.",
];

export function useVoiceInteraction(settings: VoiceSettings = {}) {
  const [state, setState] = useState<VoiceState>({
    isListening: false,
    isSpeaking: false,
    transcript: '',
    error: null,
    isSupported: typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window),
  });

  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const preferredVoiceRef = useRef<SpeechSynthesisVoice | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      synthRef.current = window.speechSynthesis;
      
      const loadVoices = () => {
        const voices = synthRef.current?.getVoices() || [];
        const preferredVoices = voices.filter(voice => 
          voice.name.toLowerCase().includes('samantha') ||
          voice.name.toLowerCase().includes('karen') ||
          voice.name.toLowerCase().includes('daniel') ||
          voice.name.toLowerCase().includes('google') ||
          voice.name.toLowerCase().includes('microsoft') ||
          voice.lang.startsWith('en')
        );
        
        preferredVoiceRef.current = preferredVoices[0] || voices[0] || null;
      };
      
      loadVoices();
      synthRef.current?.addEventListener('voiceschanged', loadVoices);
      
      return () => {
        synthRef.current?.removeEventListener('voiceschanged', loadVoices);
      };
    }
  }, []);

  const getRandomPhrase = useCallback((phrases: string[]) => {
    return phrases[Math.floor(Math.random() * phrases.length)];
  }, []);

  const speak = useCallback((text: string, onEnd?: () => void) => {
    if (!synthRef.current) return;

    synthRef.current.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = settings.voiceRate || 1.0;
    utterance.pitch = settings.voicePitch || 1.0;
    
    if (preferredVoiceRef.current) {
      utterance.voice = preferredVoiceRef.current;
    }

    utterance.onstart = () => {
      setState(prev => ({ ...prev, isSpeaking: true }));
    };

    utterance.onend = () => {
      setState(prev => ({ ...prev, isSpeaking: false }));
      onEnd?.();
    };

    utterance.onerror = (event) => {
      setState(prev => ({ ...prev, isSpeaking: false, error: `Speech error: ${event.error}` }));
    };

    utteranceRef.current = utterance;
    synthRef.current.speak(utterance);
  }, [settings.voiceRate, settings.voicePitch]);

  const speakGreeting = useCallback(() => {
    speak(getRandomPhrase(GEARHEAD_GREETINGS));
  }, [speak, getRandomPhrase]);

  const speakAcknowledgment = useCallback(() => {
    speak(getRandomPhrase(GEARHEAD_ACKNOWLEDGMENTS));
  }, [speak, getRandomPhrase]);

  const speakResult = useCallback((diagnosis: string, causes: string[], recommendations?: string[]) => {
    const intro = getRandomPhrase(GEARHEAD_RESULT_INTROS);
    
    const shortDiagnosis = diagnosis.length > 500 ? diagnosis.substring(0, 500) + '...' : diagnosis;
    
    let fullText = `${intro} ${shortDiagnosis}`;
    
    if (causes && causes.length > 0) {
      fullText += ` The likely causes include: ${causes.slice(0, 3).join(', ')}.`;
    }
    
    if (recommendations && recommendations.length > 0) {
      fullText += ` I also found some parts you might need from popular retailers.`;
    }
    
    fullText += ` Is there anything else you'd like me to explain?`;
    
    speak(fullText);
  }, [speak, getRandomPhrase]);

  const stopSpeaking = useCallback(() => {
    if (synthRef.current) {
      synthRef.current.cancel();
      setState(prev => ({ ...prev, isSpeaking: false }));
    }
  }, []);

  const startListening = useCallback(() => {
    if (!state.isSupported) {
      setState(prev => ({ ...prev, error: 'Speech recognition is not supported in this browser.' }));
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      setState(prev => ({ ...prev, error: 'Speech recognition is not available.' }));
      return;
    }

    stopSpeaking();

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setState(prev => ({ ...prev, isListening: true, error: null, transcript: '' }));
    };

    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((result: any) => result[0].transcript)
        .join('');
      
      setState(prev => ({ ...prev, transcript }));
    };

    recognition.onerror = (event: any) => {
      let errorMessage = 'Speech recognition error';
      
      switch (event.error) {
        case 'not-allowed':
          errorMessage = 'Microphone access denied. Please enable microphone permissions.';
          break;
        case 'no-speech':
          errorMessage = "I didn't hear anything. Please try again.";
          break;
        case 'network':
          errorMessage = 'Network error. Please check your connection.';
          break;
        case 'aborted':
          errorMessage = '';
          break;
        default:
          errorMessage = `Speech error: ${event.error}`;
      }
      
      setState(prev => ({ ...prev, isListening: false, error: errorMessage || null }));
    };

    recognition.onend = () => {
      setState(prev => ({ ...prev, isListening: false }));
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [state.isSupported, stopSpeaking]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setState(prev => ({ ...prev, isListening: false }));
    }
  }, []);

  const clearTranscript = useCallback(() => {
    setState(prev => ({ ...prev, transcript: '', error: null }));
  }, []);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  return {
    ...state,
    startListening,
    stopListening,
    speak,
    speakGreeting,
    speakAcknowledgment,
    speakResult,
    stopSpeaking,
    clearTranscript,
    clearError,
  };
}

export { GEARHEAD_GREETINGS, GEARHEAD_ACKNOWLEDGMENTS, GEARHEAD_RESULT_INTROS };
