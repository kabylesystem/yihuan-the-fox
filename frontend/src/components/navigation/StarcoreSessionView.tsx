import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Bot, Loader2, Mic, Send, User } from 'lucide-react';
import { FlightModeBranch } from './flightTypes';
import { sendMessage } from '../../services/backendService';

interface SessionMessage {
  id: string;
  role: 'ai' | 'user';
  text: string;
}

interface StarcoreSessionViewProps {
  branch: FlightModeBranch;
  targetLabel?: string;
  onBack: () => void;
  onSessionStart?: () => void;
  onSessionComplete?: () => void;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = (reader.result as string).split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function buildInitialMessages(branch: FlightModeBranch, targetLabel?: string): SessionMessage[] {
  if (branch === 'explore') {
    return [{ id: 'exp-1', role: 'ai', text: 'Try building a new sentence using what you already know. I\'ll guide you!' }];
  }
  return [{ id: 'rel-1', role: 'ai', text: `Let's review "${targetLabel ?? 'this phrase'}". Can you use it in a sentence?` }];
}

export function StarcoreSessionView({
  branch,
  targetLabel,
  onBack,
  onSessionStart,
  onSessionComplete,
}: StarcoreSessionViewProps) {
  const [messages, setMessages] = useState<SessionMessage[]>(() => buildInitialMessages(branch, targetLabel));
  const [input, setInput] = useState('');
  const [isResponding, setIsResponding] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const silenceStartRef = useRef<number>(0);
  const hasSpokenRef = useRef(false);
  const vadIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const userTurnCount = useMemo(() => messages.filter((m) => m.role === 'user').length, [messages]);

  useEffect(() => {
    setMessages(buildInitialMessages(branch, targetLabel));
    setInput('');
    setIsResponding(false);
    setIsListening(false);
  }, [branch, targetLabel]);

  useEffect(() => { onSessionStart?.(); }, [onSessionStart, branch, targetLabel]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (vadIntervalRef.current) clearInterval(vadIntervalRef.current);
      if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, []);

  const handleAiReply = async (userText: string) => {
    setIsResponding(true);
    try {
      const data = await sendMessage(userText, 'text');
      // Backend sends {type: "turn_response", turn: {response: {spoken_response: ...}}}
      const turn = data?.turn;
      const resp = turn?.response;
      const aiText = resp?.spoken_response || data?.message || 'I didn\'t catch that. Try again?';
      setMessages(prev => [...prev, { id: `ai-${Date.now()}`, role: 'ai', text: aiText }]);
    } catch {
      setMessages(prev => [...prev, { id: `ai-${Date.now()}`, role: 'ai', text: 'Connection error. Try again.' }]);
    } finally {
      setIsResponding(false);
    }
  };

  const sendUserMessage = (text: string) => {
    const cleaned = text.trim();
    if (!cleaned || isResponding) return;
    setMessages(prev => [...prev, { id: `user-${Date.now()}`, role: 'user', text: cleaned }]);
    setInput('');
    handleAiReply(cleaned);
  };

  const sendAudioMessage = async (blob: Blob) => {
    if (blob.size === 0) return;
    setIsResponding(true);
    try {
      const base64 = await blobToBase64(blob);
      const data = await sendMessage(base64, 'audio');
      // Backend sends {type: "turn_response", turn: {user_said: ..., response: {spoken_response: ...}}}
      const turn = data?.turn;
      const resp = turn?.response;
      const userSaid = turn?.user_said || '';
      const aiText = resp?.spoken_response || data?.message || 'I didn\'t catch that.';
      if (userSaid) {
        setMessages(prev => [...prev, { id: `user-${Date.now()}`, role: 'user', text: userSaid }]);
      }
      setMessages(prev => [...prev, { id: `ai-${Date.now()}`, role: 'ai', text: aiText }]);
    } catch {
      setMessages(prev => [...prev, { id: `ai-${Date.now()}`, role: 'ai', text: 'Connection error. Try again.' }]);
    } finally {
      setIsResponding(false);
    }
  };

  const stopRecording = () => {
    if (vadIntervalRef.current) { clearInterval(vadIntervalRef.current); vadIntervalRef.current = null; }
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    setIsListening(false);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioCtx = new AudioContext();
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.3;
      source.connect(analyser);
      analyserRef.current = analyser;
      silenceStartRef.current = 0;
      hasSpokenRef.current = false;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm',
      });

      chunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mediaRecorder.onstop = async () => {
        if (vadIntervalRef.current) { clearInterval(vadIntervalRef.current); vadIntervalRef.current = null; }
        if (audioContextRef.current) { audioContextRef.current.close(); audioContextRef.current = null; }
        if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        chunksRef.current = [];
        if (blob.size > 0) sendAudioMessage(blob);
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(100);
      setIsListening(true);

      // VAD: auto-stop on silence
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      vadIntervalRef.current = setInterval(() => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((s, v) => s + v, 0) / dataArray.length;
        if (avg > 15) {
          hasSpokenRef.current = true;
          silenceStartRef.current = 0;
        } else if (hasSpokenRef.current) {
          if (silenceStartRef.current === 0) silenceStartRef.current = Date.now();
          else if (Date.now() - silenceStartRef.current > 500) stopRecording();
        }
      }, 100);
    } catch {
      // Mic not available
    }
  };

  const handleVoiceToggle = () => {
    if (isResponding) return;
    if (isListening) stopRecording();
    else startRecording();
  };

  const canCompleteRelight = branch === 'relight' && userTurnCount >= 2 && !isResponding;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.10] px-4 py-3">
        <h3 className="text-sm font-semibold text-white">
          {branch === 'explore' ? 'Explore' : 'Review'}
        </h3>
        <button
          onClick={onBack}
          className="text-xs text-white/40 hover:text-white/70 transition"
        >
          Close
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
          >
            <div className={`w-6 h-6 rounded-md flex items-center justify-center border flex-shrink-0 ${msg.role === 'user' ? 'bg-cyan-500/15 border-cyan-400/25' : 'bg-blue-500/15 border-blue-400/25'}`}>
              {msg.role === 'user' ? <User size={11} className="text-cyan-300" /> : <Bot size={11} className="text-blue-300" />}
            </div>
            <div className={`max-w-[85%] rounded-xl border px-3 py-2 text-[13px] leading-relaxed ${msg.role === 'user' ? 'bg-cyan-500/10 border-cyan-400/20 text-white/90' : 'bg-white/[0.06] border-white/[0.10] text-white/70'}`}>
              {msg.text}
            </div>
          </motion.div>
        ))}

        <AnimatePresence>
          {isResponding && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-[11px] text-white/30">
              Thinking...
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="border-t border-white/[0.10] p-3 space-y-2">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendUserMessage(input)}
            placeholder="Type in French..."
            className="flex-1 rounded-xl border border-white/[0.14] bg-white/[0.07] px-3 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:border-blue-400/40"
          />
          <button
            onClick={() => sendUserMessage(input)}
            disabled={isResponding || !input.trim()}
            className="rounded-xl border border-white/[0.14] bg-white/[0.07] px-3 text-white/60 transition hover:bg-white/[0.12] disabled:opacity-40"
          >
            <Send size={14} />
          </button>
          <button
            onClick={handleVoiceToggle}
            disabled={isResponding}
            className={`rounded-xl border px-3 transition ${
              isListening
                ? 'border-violet-400/40 bg-violet-500/25 text-violet-200'
                : 'border-white/[0.14] bg-white/[0.07] text-white/60 hover:bg-white/[0.12]'
            }`}
          >
            {isListening ? <Loader2 size={14} className="animate-spin" /> : <Mic size={14} />}
          </button>
        </div>

        {canCompleteRelight && (
          <button
            onClick={() => onSessionComplete?.()}
            className="w-full py-2 rounded-xl border border-blue-400/25 bg-blue-500/15 text-xs font-medium text-blue-200 transition hover:bg-blue-500/20"
          >
            Complete Review
          </button>
        )}
      </div>
    </div>
  );
}
