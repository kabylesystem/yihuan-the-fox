import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Bot, Loader2, Mic, Send, User, Zap } from 'lucide-react';
import { FlightModeBranch } from './flightTypes';

interface SessionMessage {
  id: string;
  role: 'ai' | 'user';
  text: string;
}

interface StarcoreSessionViewProps {
  branch: FlightModeBranch;
  targetLabel?: string;
  onBack: () => void;
}

function buildInitialMessages(branch: FlightModeBranch, targetLabel?: string): SessionMessage[] {
  if (branch === 'explore') {
    return [
      {
        id: 'exp-1',
        role: 'ai',
        text: 'Phase 3 online: i+1 Boundary Expansion. We will use mostly mastered language and dock one new structure.',
      },
      {
        id: 'exp-2',
        role: 'ai',
        text: 'Known baseline: "I went to the park." Expansion target: "I went to the park to clear my head."',
      },
      {
        id: 'exp-3',
        role: 'ai',
        text: 'Knowledge docking: you mastered "I want to eat an apple." Next step: "I\'m craving an apple." Explain "craving" with one familiar word.',
      },
    ];
  }

  return [
    {
      id: 'rel-1',
      role: 'ai',
      text: `Last session we learned \"${targetLabel ?? 'this memory node'}\". Recalibration is now active.`,
    },
    {
      id: 'rel-2',
      role: 'ai',
      text: 'Let us review and strengthen retention: paraphrase it once, then use it in one new sentence with your own context.',
    },
  ];
}

export function StarcoreSessionView({ branch, targetLabel, onBack }: StarcoreSessionViewProps) {
  const [messages, setMessages] = useState<SessionMessage[]>(() => buildInitialMessages(branch, targetLabel));
  const [input, setInput] = useState('');
  const [isResponding, setIsResponding] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const sessionTitle = useMemo(
    () => (branch === 'explore' ? 'Frontier Expansion Session' : 'Memory Recalibration Session'),
    [branch]
  );

  useEffect(() => {
    setMessages(buildInitialMessages(branch, targetLabel));
    setInput('');
    setIsResponding(false);
    setIsListening(false);
  }, [branch, targetLabel]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const simulateAiReply = (userText: string) => {
    const response =
      branch === 'explore'
        ? `Good attempt. Keep your known structure, then add one frontier element. Try: "${userText}" + a purpose phrase such as "to clear my head."`
        : `Nice recall. Now deepen retention: reuse the same idea in a different real-life scenario and keep the key phrase stable.`;

    window.setTimeout(() => {
      setMessages((prev) => [...prev, { id: `ai-${Date.now()}`, role: 'ai', text: response }]);
      setIsResponding(false);
    }, 550);
  };

  const sendUserMessage = (text: string) => {
    const cleaned = text.trim();
    if (!cleaned || isResponding) return;

    setMessages((prev) => [...prev, { id: `user-${Date.now()}`, role: 'user', text: cleaned }]);
    setInput('');
    setIsResponding(true);
    simulateAiReply(cleaned);
  };

  const handleVoiceSimulate = () => {
    if (isListening || isResponding) return;

    setIsListening(true);
    window.setTimeout(() => {
      setIsListening(false);
      sendUserMessage(branch === 'explore' ? 'I went to the park to relax after work.' : 'I reviewed this phrase again and used it in my own sentence.');
    }, 900);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-white/10 p-4">
        <p className="text-[10px] uppercase tracking-[0.2em] text-cyan-200/60">Session Active</p>
        <h3 className="mt-1 text-sm font-semibold text-cyan-50">{sessionTitle}</h3>
        <button
          onClick={onBack}
          className="mt-3 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/80 transition hover:bg-white/10"
        >
          Back to Console
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="rounded-xl border border-cyan-300/20 bg-cyan-500/10 p-3">
          <div className="flex items-center gap-2 text-cyan-100">
            <Zap size={13} />
            <p className="text-[11px] uppercase tracking-[0.16em] font-semibold">Context Anchor</p>
          </div>
          <p className="mt-2 text-xs text-cyan-100/80">
            {branch === 'explore'
              ? '70-80% known language + 20-30% new i+1 input. Explain each new item with one familiar expression.'
              : `Review focus: ${targetLabel ?? 'selected memory node'} + one transfer sentence in a new context.`}
          </p>
        </div>

        {messages.map((msg) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
          >
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center border ${msg.role === 'user' ? 'bg-emerald-500/15 border-emerald-500/30' : 'bg-blue-500/15 border-blue-500/30'}`}>
              {msg.role === 'user' ? <User size={13} className="text-emerald-300" /> : <Bot size={13} className="text-blue-300" />}
            </div>
            <div className={`max-w-[86%] rounded-xl border px-3 py-2 text-xs leading-relaxed ${msg.role === 'user' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-50' : 'bg-blue-500/10 border-blue-500/20 text-blue-50'}`}>
              {msg.text}
            </div>
          </motion.div>
        ))}

        <AnimatePresence>
          {isResponding && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-[11px] text-blue-200/70">
              Starcore is generating the next guided step...
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={endRef} />
      </div>

      <div className="border-t border-white/10 p-4 space-y-2">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={branch === 'explore' ? 'Type your i+1 attempt...' : 'Type your recall sentence...'}
            className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:border-cyan-400/50"
          />
          <button
            onClick={() => sendUserMessage(input)}
            disabled={isResponding || !input.trim()}
            className="rounded-xl border border-cyan-400/30 bg-cyan-500/15 px-3 text-cyan-100 transition hover:bg-cyan-400/20 disabled:opacity-40"
          >
            <Send size={14} />
          </button>
        </div>

        <button
          onClick={handleVoiceSimulate}
          disabled={isResponding}
          className={`w-full h-10 rounded-xl border text-xs uppercase tracking-[0.16em] font-semibold transition ${
            isListening
              ? 'border-red-400/40 bg-red-500/20 text-red-100'
              : 'border-blue-400/30 bg-blue-500/20 text-blue-100 hover:bg-blue-500/25'
          }`}
        >
          {isListening ? (
            <span className="inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Listening...</span>
          ) : (
            <span className="inline-flex items-center gap-2"><Mic size={14} /> Hold to Speak (Simulated)</span>
          )}
        </button>
      </div>
    </div>
  );
}
