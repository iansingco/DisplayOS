import { useEffect, useRef, useState, useCallback } from "react";

export function useVoiceControl({ enabled, wakeWord = "hey display", onCommand, send }) {
  const [listening, setListening] = useState(false);
  const [lastTranscript, setLastTranscript] = useState("");
  const recRef = useRef(null);

  const start = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR || !enabled) return;

    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = "en-US";
    recRef.current = rec;

    rec.onstart = () => setListening(true);
    rec.onend = () => {
      setListening(false);
      setTimeout(() => { try { rec.start(); } catch {} }, 500);
    };
    rec.onresult = (e) => {
      const transcript = Array.from(e.results)
        .map(r => r[0].transcript).join(" ").toLowerCase().trim();
      setLastTranscript(transcript);
      const wake = wakeWord.toLowerCase();
      if (!wake || transcript.includes(wake)) {
        const cmd = wake ? transcript.split(wake).pop().trim() : transcript;
        if (cmd) {
          send({ type: "VOICE_TRANSCRIPT", transcript: cmd });
          if (onCommand) onCommand(cmd);
        }
      }
    };
    rec.onerror = (e) => { if (e.error !== "no-speech") console.warn("[Voice]", e.error); };
    rec.start();
  }, [enabled, wakeWord, send, onCommand]);

  useEffect(() => {
    if (enabled) start();
    return () => { try { recRef.current?.stop(); } catch {} };
  }, [enabled, start]);

  return { listening, lastTranscript };
}
