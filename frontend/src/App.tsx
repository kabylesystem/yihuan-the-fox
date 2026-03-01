import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { NebulaCanvas } from './components/NebulaCanvas';
import { Neuron, Synapse, NebulaState, Category, Message } from './types';
import { analyzeInput, checkBackend, isUsingBackend, resetMockState, getMockTurnIndex, getTotalMockTurns } from './services/geminiService';
import { onConnectionStatusChange, ConnectionStatus, resetSession } from './services/backendService';
import { Send, Brain, Zap, Info, Loader2, Search, Filter, Mic, Clock, X, MessageSquare, User, Bot, ChevronDown, ChevronUp, Plane, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useFlightModeMachine } from './components/navigation/useFlightModeMachine';
import { FlightModeChoice } from './components/navigation/FlightModeChoice';
import { StarcorePanel } from './components/navigation/StarcorePanel';
import { StarcoreSessionView } from './components/navigation/StarcoreSessionView';

const INITIAL_STATE: NebulaState = {
  neurons: [],
  synapses: [],
  messages: [
    {
      id: 'welcome',
      role: 'ai',
      text: 'Bienvenue ! Welcome to Echo Neural Language Lab. Click the mic button or type to start your French learning journey.',
      timestamp: Date.now(),
      analysis: {
        vocabulary: [
          { word: 'Bienvenue', translation: 'Welcome', type: 'interjection', isNew: true },
        ],
        newElements: ['French Greeting'],
        level: 'A0',
        progress: 'Your neural nebula is empty. Speak or type to create your first neurons!'
      }
    }
  ]
};

const CATEGORIES: (Category | 'all')[] = ['all', 'work', 'daily', 'travel', 'social', 'academic', 'coding', 'other'];

// ── Audio helpers ────────────────────────────────────────────────────────

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

export default function App() {
  const [state, setState] = useState<NebulaState>(INITIAL_STATE);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedNeuron, setSelectedNeuron] = useState<Neuron | null>(null);
  const [filterCategory, setFilterCategory] = useState<Category | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [timePulse, setTimePulse] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [isFlying, setIsFlying] = useState(false);
  const [showFilter, setShowFilter] = useState(true);
  const [showPulse, setShowPulse] = useState(true);
  const [expandedAnalysis, setExpandedAnalysis] = useState<string | null>(null);
  const [shootingStars, setShootingStars] = useState<string[]>([]);
  const [textInput, setTextInput] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [demoComplete, setDemoComplete] = useState(false);
  const [isStarcoreSessionOpen, setIsStarcoreSessionOpen] = useState(false);
  const [relightTargetId, setRelightTargetId] = useState<string | null>(null);
  const [relightTargetLabel, setRelightTargetLabel] = useState<string | null>(null);
  const [relightSessionStage, setRelightSessionStage] = useState<'idle' | 'queued' | 'active' | 'completed'>('idle');
  const [relightGlowProgress, setRelightGlowProgress] = useState(1);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const {
    phase: flightPhase,
    branch: flightBranch,
    decayingNeuron,
    chooseBranch,
    notifyTravelArrived,
    notifyFocusComplete,
    returnToIdle,
  } = useFlightModeMachine(isFlying, state.neurons);

  const effectiveRelightTargetId =
    flightBranch === 'relight'
      ? (relightTargetId ?? decayingNeuron?.id ?? null)
      : null;
  const relightTargetLabelForUi = relightTargetLabel ?? decayingNeuron?.label;

  // ── Initialize: check backend availability ───────────────────────────
  useEffect(() => {
    onConnectionStatusChange(setConnectionStatus);

    checkBackend().then((backendAvailable) => {
      if (!backendAvailable) {
        setIsDemoMode(true);
        setConnectionStatus('failed');
      }
    });

    return () => {
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.messages]);

  useEffect(() => {
    if (isFlying) {
      setShowChat(true);
      const dimmingNeurons = state.neurons.filter(n => !n.isShadow && n.strength < 0.4);
      const suggestion = dimmingNeurons.length > 0
        ? `I've detected that your memory of "${dimmingNeurons[0].label}" is fading. Shall we jump back for a quick recalibration?`
        : 'Navigation online. All systems ready. Where shall we explore today?';

      setState(prev => ({
        ...prev,
        messages: [
          ...prev.messages,
          { id: `nav-${Date.now()}`, role: 'ai', text: suggestion, timestamp: Date.now() }
        ]
      }));
    }
  }, [isFlying]);

  const triggerShootingStar = () => {
    const id = Math.random().toString(36).substr(2, 9);
    setShootingStars(prev => [...prev, id]);
  };

  const handleShootingStarComplete = (id: string) => {
    setShootingStars(prev => prev.filter(s => s !== id));
  };

  // ── Send handler (text or audio) ─────────────────────────────────────
  const handleSend = async (input: string, inputType: 'text' | 'audio' = 'text') => {
    if (!input.trim() || isLoading) return;

    setIsLoading(true);
    setShowChat(true);
    triggerShootingStar();

    try {
      const newState = await analyzeInput(input, state, isFlying, inputType);

      if (isFlying) {
        const lastMsg = newState.messages[newState.messages.length - 1];
        if (lastMsg && lastMsg.role === 'ai') {
          const match = lastMsg.text.match(/(?:Navigating to|Setting course for|Heading towards) ["']?([^"'.!?,]+)["']?/i);
          if (match) {
            const label = match[1].trim();
            const target = newState.neurons.find(n => n.label.toLowerCase() === label.toLowerCase());
            if (target) setSelectedNeuron(target);
          }
        }
      }

      setState(newState);

      if (isDemoMode && getMockTurnIndex() >= getTotalMockTurns()) {
        setDemoComplete(true);
      }
    } catch (error) {
      console.error("Failed to analyze input:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // ── Text submit ──────────────────────────────────────────────────────
  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (textInput.trim()) {
      handleSend(textInput);
      setTextInput('');
    }
  };

  // ── Voice recording ──────────────────────────────────────────────────
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm',
      });

      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }

        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        chunksRef.current = [];

        if (blob.size > 0) {
          try {
            const base64Audio = await blobToBase64(blob);
            handleSend(base64Audio, 'audio');
          } catch {
            handleSend('[audio]');
          }
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(100);
      setIsListening(true);
    } catch {
      if (isDemoMode) {
        handleSend('[mock-advance]');
      }
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    setIsListening(false);
  };

  const handleVoiceToggle = () => {
    if (isLoading || demoComplete) return;

    if (isListening) {
      stopRecording();
    } else if (isDemoMode) {
      handleSend('[mock-advance]');
    } else {
      startRecording();
    }
  };

  const resetRelightFlowState = useCallback(() => {
    setRelightTargetId(null);
    setRelightTargetLabel(null);
    setRelightSessionStage('idle');
    setRelightGlowProgress(1);
  }, []);

  const handleRelightBranch = useCallback(() => {
    const fallbackDecaying = [...state.neurons]
      .filter((n) => !n.isShadow && n.strength < 0.4)
      .sort((a, b) => a.strength - b.strength)[0] ?? null;

    const target = decayingNeuron ?? fallbackDecaying;
    setRelightSessionStage('queued');
    setRelightGlowProgress(0);
    setRelightTargetId(target?.id ?? null);
    setRelightTargetLabel(target?.label ?? null);
    if (target) setSelectedNeuron(target);

    chooseBranch('relight');
  }, [state.neurons, decayingNeuron, chooseBranch]);

  const handleExploreBranch = useCallback(() => {
    resetRelightFlowState();
    chooseBranch('explore');
  }, [chooseBranch, resetRelightFlowState]);

  const handleStarcoreSessionStart = useCallback(() => {
    if (flightBranch !== 'relight' || !effectiveRelightTargetId) return;
    setRelightSessionStage((prev) => (prev === 'completed' ? prev : 'active'));
  }, [flightBranch, effectiveRelightTargetId]);

  const handleStarcoreSessionComplete = useCallback(() => {
    if (flightBranch !== 'relight' || !effectiveRelightTargetId) return;
    setRelightSessionStage('completed');
  }, [flightBranch, effectiveRelightTargetId]);

  // ── Reset session ────────────────────────────────────────────────────
  const handleReset = async () => {
    if (isUsingBackend()) {
      await resetSession();
    }
    resetMockState();
    setState(INITIAL_STATE);
    setDemoComplete(false);
    resetRelightFlowState();
  };

  const handleNeuronClick = useCallback((neuron: Neuron) => {
    setSelectedNeuron(neuron);
  }, []);

  const handleSynapseClick = useCallback((synapse: Synapse) => {
    const target = state.neurons.find(n => n.id === synapse.target);
    if (target) setSelectedNeuron(target);
  }, [state.neurons]);

  const searchTarget = useMemo(() => {
    if (!searchQuery) return null;
    return state.neurons.find(n => n.label.toLowerCase().includes(searchQuery.toLowerCase())) || null;
  }, [searchQuery, state.neurons]);
  const isStarcoreView = isFlying && flightPhase === 'starcoreOpen';

  const abortRelightAndReturn = useCallback(() => {
    setIsStarcoreSessionOpen(false);
    setShowChat(false);
    setSelectedNeuron(null);
    resetRelightFlowState();
    returnToIdle();
  }, [resetRelightFlowState, returnToIdle]);

  const handleCloseInfoWindow = useCallback(() => {
    const shouldAbortRelight = isStarcoreView && flightBranch === 'relight' && relightSessionStage !== 'completed';
    if (shouldAbortRelight) {
      abortRelightAndReturn();
      return;
    }
    if (isStarcoreView && flightBranch === 'relight') {
      setSelectedNeuron(null);
    }
    setShowChat(false);
  }, [isStarcoreView, flightBranch, relightSessionStage, abortRelightAndReturn]);

  const handleSessionBack = useCallback(() => {
    const shouldAbortRelight = flightBranch === 'relight' && relightSessionStage !== 'completed';
    if (shouldAbortRelight) {
      abortRelightAndReturn();
      return;
    }
    setIsStarcoreSessionOpen(false);
  }, [flightBranch, relightSessionStage, abortRelightAndReturn]);

  useEffect(() => {
    if (!isStarcoreView) {
      setIsStarcoreSessionOpen(false);
    }
  }, [isStarcoreView]);

  useEffect(() => {
    if (isFlying && flightPhase === 'starcoreOpen' && flightBranch === 'explore') {
      setShowChat(true);
    }
  }, [isFlying, flightPhase, flightBranch]);

  useEffect(() => {
    if (!isFlying) {
      resetRelightFlowState();
    }
  }, [isFlying, resetRelightFlowState]);

  useEffect(() => {
    if ((relightSessionStage === 'queued' || relightSessionStage === 'active') && effectiveRelightTargetId) {
      setRelightGlowProgress(0);
    }
  }, [relightSessionStage, effectiveRelightTargetId]);

  useEffect(() => {
    if (relightSessionStage !== 'completed' || !effectiveRelightTargetId) return;

    const targetId = effectiveRelightTargetId;
    let rafId = 0;
    const startedAt = performance.now();
    const durationMs = 2200;
    let finalized = false;

    const animateGlow = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / durationMs);
      setRelightGlowProgress(progress);
      if (progress < 1) {
        rafId = requestAnimationFrame(animateGlow);
        return;
      }

      if (finalized) return;
      finalized = true;

      setState((prev) => ({
        ...prev,
        neurons: prev.neurons.map((n) =>
          n.id === targetId
            ? {
                ...n,
                strength: Math.max(n.strength, 0.88),
                potential: Math.max(n.potential, 0.88),
                usageCount: Math.max(n.usageCount, 1) + 1,
                lastReviewed: Date.now(),
              }
            : n
        ),
      }));
      setIsStarcoreSessionOpen(false);
      setShowChat(false);
      setSelectedNeuron(null);
      resetRelightFlowState();
      returnToIdle();
    };

    setRelightGlowProgress(0);
    rafId = requestAnimationFrame(animateGlow);
    return () => cancelAnimationFrame(rafId);
  }, [relightSessionStage, effectiveRelightTargetId, resetRelightFlowState, returnToIdle]);

  // ── Connection badge ─────────────────────────────────────────────────
  const connectionBadge = isDemoMode ? (
    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[10px] uppercase tracking-widest font-bold">
      <WifiOff size={10} />
      <span>Demo Mode</span>
    </div>
  ) : connectionStatus === 'connected' ? (
    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] uppercase tracking-widest font-bold">
      <Wifi size={10} />
      <span>Live</span>
    </div>
  ) : null;

  return (
    <div className="relative w-full h-screen overflow-hidden text-white font-sans bg-black flex">
      {/* Main View Area */}
      <div className={`relative h-full transition-all duration-500 ease-in-out ${showChat ? 'w-2/3' : 'w-full'}`}>
        {/* 3D Nebula Background */}
        <NebulaCanvas
          neurons={state.neurons}
          synapses={state.synapses}
          onNeuronClick={handleNeuronClick}
          onSynapseClick={handleSynapseClick}
          filterCategory={filterCategory}
          searchTarget={searchTarget}
          timePulse={timePulse}
          shootingStars={shootingStars}
          onShootingStarComplete={handleShootingStarComplete}
          isFlying={isFlying}
          flightPhase={flightPhase}
          flightBranch={flightBranch}
          relightTargetId={effectiveRelightTargetId}
          relightGlowProgress={relightGlowProgress}
          onFlightTravelArrive={notifyTravelArrived}
          onFlightFocusComplete={notifyFocusComplete}
        />

        {/* UI Overlay */}
        <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-6">
          {/* Header & Search */}
          <div className="flex justify-between items-start">
            <div className="flex flex-col gap-4 pointer-events-auto">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-black/20 backdrop-blur-md border border-white/10 p-4 rounded-2xl"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center border border-emerald-500/30">
                    <Brain className="text-emerald-400" size={24} />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold tracking-tight text-white">Echo</h1>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-medium">Neural Language Lab</p>
                  </div>
                  <div className="ml-3">{connectionBadge}</div>
                </div>
              </motion.div>

              {/* Context Filter Panel */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-black/20 backdrop-blur-md border border-white/10 p-4 rounded-2xl w-48"
              >
                <button
                  onClick={() => setShowFilter(!showFilter)}
                  className="flex items-center justify-between w-full text-white/60 hover:text-white transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Filter size={14} />
                    <span className="text-xs uppercase tracking-widest font-semibold">Context Filter</span>
                  </div>
                  {showFilter ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>

                <AnimatePresence>
                  {showFilter && (
                    <motion.div
                      initial={{ height: 0, opacity: 0, marginTop: 0 }}
                      animate={{ height: 'auto', opacity: 1, marginTop: 12 }}
                      exit={{ height: 0, opacity: 0, marginTop: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="grid grid-cols-1 gap-2">
                        {CATEGORIES.map(cat => (
                          <button
                            key={cat}
                            onClick={() => setFilterCategory(cat)}
                            className={`text-[10px] uppercase tracking-wider py-1.5 px-3 rounded-lg transition-all border ${
                              filterCategory === cat
                                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400 font-bold'
                                : 'bg-white/5 border-white/5 text-white/40 hover:bg-white/10'
                            }`}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>

              {/* Time Pulse Control */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-black/20 backdrop-blur-md border border-white/10 p-4 rounded-2xl w-48"
              >
                <button
                  onClick={() => setShowPulse(!showPulse)}
                  className="flex items-center justify-between w-full text-white/60 hover:text-white transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Clock size={14} />
                    <span className="text-xs uppercase tracking-widest font-semibold">Time Pulse</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {!showPulse && <span className="text-[10px] font-mono text-emerald-400">{Math.round(timePulse * 100)}%</span>}
                    {showPulse ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </div>
                </button>

                <AnimatePresence>
                  {showPulse && (
                    <motion.div
                      initial={{ height: 0, opacity: 0, marginTop: 0 }}
                      animate={{ height: 'auto', opacity: 1, marginTop: 12 }}
                      exit={{ height: 0, opacity: 0, marginTop: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] text-white/40 uppercase tracking-wider">Intensity</span>
                        <span className="text-[10px] font-mono text-emerald-400">{Math.round(timePulse * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={timePulse}
                        onChange={(e) => setTimePulse(parseFloat(e.target.value))}
                        className="w-full accent-emerald-500 h-1 bg-white/10 rounded-full appearance-none cursor-pointer"
                      />
                      <p className="text-[9px] text-white/30 mt-2 leading-relaxed">Simulate memory decay.</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            </div>

            <div className="flex flex-col items-end gap-4 pointer-events-auto">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={16} />
                  <input
                    type="text"
                    placeholder="Search neurons..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-black/40 backdrop-blur-md border border-white/10 rounded-full py-2 pl-10 pr-10 text-sm focus:outline-none focus:border-emerald-500/50 transition-all w-64 text-white"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsFlying(!isFlying)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full border transition-all ${
                      isFlying
                        ? 'bg-blue-500 border-blue-500 text-white shadow-[0_0_20px_rgba(59,130,246,0.5)]'
                        : 'bg-black/40 border-white/10 text-white/60 hover:bg-white/10'
                    }`}
                    title="Toggle Interstellar Flight"
                  >
                    <Plane size={18} className={isFlying ? 'animate-bounce' : ''} />
                    <span className="text-xs font-bold uppercase tracking-widest">
                      {isFlying ? 'In Flight' : 'Navigation'}
                    </span>
                  </button>
                  {!showChat && (
                    <button
                      onClick={() => setShowChat(true)}
                      className="p-2 rounded-full border transition-all bg-black/40 border-white/10 text-white/60 hover:bg-white/10"
                    >
                      <MessageSquare size={20} />
                    </button>
                  )}
                  {(demoComplete || state.messages.length > 2) && (
                    <button
                      onClick={handleReset}
                      className="p-2 rounded-full border transition-all bg-black/40 border-white/10 text-white/60 hover:bg-white/10"
                      title="Reset session"
                    >
                      <RefreshCw size={18} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2">
            <FlightModeChoice
              visible={isFlying && flightPhase === 'choose'}
              onRelight={handleRelightBranch}
              onExplore={handleExploreBranch}
            />
          </div>

          {/* Bottom Control Area */}
          <AnimatePresence>
            {!showChat && !isFlying && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="flex justify-center items-end"
              >
                <div className="pointer-events-auto flex flex-col items-center gap-6">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleVoiceToggle}
                    disabled={isLoading || demoComplete}
                    className={`group relative w-24 h-24 rounded-full flex items-center justify-center transition-all duration-500 ${
                      demoComplete
                        ? 'bg-white/10 cursor-not-allowed'
                        : isListening
                          ? 'bg-red-500 shadow-[0_0_50px_rgba(239,68,68,0.5)]'
                          : 'bg-emerald-500 shadow-[0_0_30px_rgba(16,185,129,0.3)] hover:shadow-[0_0_50px_rgba(16,185,129,0.5)]'
                    }`}
                  >
                    <div className={`absolute inset-0 rounded-full border-2 border-white/20 ${isListening ? 'animate-ping' : ''}`} />
                    {isLoading ? (
                      <Loader2 className="animate-spin text-white" size={32} />
                    ) : (
                      <Mic className={`text-white transition-transform ${isListening ? 'scale-125' : ''}`} size={32} />
                    )}

                    {isListening && (
                      <>
                        <div className="absolute -inset-4 border border-red-500/30 rounded-full animate-[ping_1.5s_infinite]" />
                        <div className="absolute -inset-8 border border-red-500/10 rounded-full animate-[ping_2s_infinite]" />
                      </>
                    )}
                  </motion.button>

                  <div className="text-center">
                    <p className="text-xs font-medium text-white/60 uppercase tracking-[0.3em]">
                      {demoComplete ? 'Demo Complete — Reset to restart' :
                       isListening ? 'Listening... click again to stop' :
                       isLoading ? 'Analyzing Neural Path...' :
                       isDemoMode ? 'Tap to advance demo' : 'Tap to Speak'}
                    </p>
                    <p className="text-[10px] text-white/30 mt-1">
                      {isDemoMode ? 'French A1 to A2 learning progression' : 'AI will analyze your sentence and expand the nebula'}
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Neuron Detail Modal */}
        <AnimatePresence>
          {selectedNeuron && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="absolute left-4 bottom-4 w-[400px] max-w-[calc(100%-2rem)] pointer-events-auto z-40"
            >
              <div className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl overflow-hidden relative">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-500 to-transparent opacity-50" />

                <div className="flex justify-between items-start mb-6">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`w-2 h-2 rounded-full ${selectedNeuron.isShadow ? 'bg-white/30' : 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'}`} />
                      <span className="text-[10px] uppercase tracking-widest text-white/40 font-bold">{selectedNeuron.category}</span>
                    </div>
                    <h2 className="text-2xl font-bold tracking-tight text-white leading-tight">
                      {selectedNeuron.label}
                    </h2>
                  </div>
                  <button
                    onClick={() => setSelectedNeuron(null)}
                    className="text-white/30 hover:text-white transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="space-y-4">
                  {!selectedNeuron.isShadow ? (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="flex justify-between text-xs uppercase tracking-tighter mb-1 text-white/50">
                          <span>Strength</span>
                          <span>{Math.round(selectedNeuron.strength * 100)}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${selectedNeuron.strength * 100}%` }}
                            className="h-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)]"
                          />
                        </div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-tighter mb-1 text-white/50">Usage Frequency</div>
                        <div className="text-lg font-mono font-bold text-emerald-400">
                          {selectedNeuron.usageCount || 0} <span className="text-[10px] text-white/30 uppercase">times</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-sm text-emerald-400/80">
                      This is an <strong>i+1 expansion</strong>. Speak or type this phrase to activate the neural connection!
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={handleVoiceToggle}
                      disabled={isLoading || demoComplete}
                      className={`rounded-xl p-3 text-sm transition-all flex items-center justify-center gap-2 border ${
                        isListening ? 'bg-red-500/20 border-red-500 text-red-400 animate-pulse' : 'bg-white/5 hover:bg-white/10 border-white/10'
                      }`}
                    >
                      <Mic size={14} className={isListening ? 'text-red-400' : 'text-emerald-400'} />
                      {isListening ? 'Listening...' : isDemoMode ? 'Demo Next' : 'Voice Activate'}
                    </button>
                    <button
                      onClick={() => handleSend(selectedNeuron.label)}
                      disabled={isLoading}
                      className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl p-3 text-sm transition-all flex items-center justify-center gap-2"
                    >
                      <Zap size={14} className="text-amber-400" />
                      Quick Pulse
                    </button>
                  </div>

                  <div className="pt-4 border-t border-white/5">
                    <div className="flex items-center gap-2 text-white/40 mb-2">
                      <Info size={12} />
                      <span className="text-[10px] uppercase tracking-widest font-bold">Grammar DNA</span>
                    </div>
                    <div className="bg-white/5 rounded-lg p-3 font-mono text-xs text-emerald-400/70 border border-white/5">
                      {selectedNeuron.grammarDna}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Chat Interface */}
      <AnimatePresence>
        {showChat && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="w-1/3 h-full bg-black/80 backdrop-blur-2xl border-l border-white/10 flex flex-col shadow-2xl z-50"
          >
            <div className="p-6 border-b border-white/10 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${
                  isStarcoreView ? 'bg-cyan-500/20 border-cyan-500/30' : isFlying ? 'bg-blue-500/20 border-blue-500/30' : 'bg-emerald-500/20 border-emerald-500/30'
                }`}>
                  {isStarcoreView ? <Zap className="text-cyan-300" size={18} /> : isFlying ? <Plane className="text-blue-400" size={18} /> : <MessageSquare className="text-emerald-400" size={18} />}
                </div>
                <h2 className="font-bold text-lg">{isStarcoreView ? 'Starcore Console' : isFlying ? 'Neural Navigator' : 'Neural Dialogue'}</h2>
              </div>
              <button
                onClick={handleCloseInfoWindow}
                className="text-white/30 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {isStarcoreView ? (
              isStarcoreSessionOpen ? (
                <StarcoreSessionView
                  branch={flightBranch}
                  targetLabel={flightBranch === 'relight' ? relightTargetLabelForUi : 'Frontier i+1 Sector'}
                  onSessionStart={handleStarcoreSessionStart}
                  onSessionComplete={handleStarcoreSessionComplete}
                  onBack={handleSessionBack}
                />
              ) : (
                <StarcorePanel
                  branch={flightBranch}
                  targetLabel={flightBranch === 'relight' ? relightTargetLabelForUi : 'Frontier i+1 Sector'}
                  onOpenSession={() => setIsStarcoreSessionOpen(true)}
                />
              )
            ) : (
              <>
                <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide">
                  {state.messages.map((msg) => (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center border ${
                        msg.role === 'user' ? 'bg-emerald-500/20 border-emerald-500/30' :
                        msg.id.startsWith('nav-') ? 'bg-blue-500/20 border-blue-500/30' : 'bg-white/10 border-white/10'
                      }`}>
                        {msg.role === 'user' ? <User size={16} className="text-emerald-400" /> :
                         msg.id.startsWith('nav-') ? <Plane size={16} className="text-blue-400" /> : <Bot size={16} className="text-white/60" />}
                      </div>
                      <div className={`max-w-[80%] p-4 rounded-2xl text-sm leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-50'
                          : msg.id.startsWith('nav-')
                          ? 'bg-blue-500/10 border border-blue-500/20 text-blue-50'
                          : 'bg-white/5 border border-white/10 text-white/80'
                      }`}>
                        {msg.id.startsWith('nav-') && <div className="text-[10px] uppercase tracking-widest font-bold text-blue-400 mb-1">Neural Navigator</div>}
                        {msg.text}

                        {msg.analysis && (
                          <div className="mt-3 pt-3 border-t border-white/10">
                            <button
                              onClick={() => setExpandedAnalysis(expandedAnalysis === msg.id ? null : msg.id)}
                              className="flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold text-emerald-400/60 hover:text-emerald-400 transition-colors"
                            >
                              {expandedAnalysis === msg.id ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                              {expandedAnalysis === msg.id ? 'Hide Details' : 'Show Details'}
                            </button>

                            <AnimatePresence>
                              {expandedAnalysis === msg.id && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  className="overflow-hidden mt-3 space-y-4"
                                >
                                  <div className="space-y-2">
                                    <div className="text-[9px] uppercase tracking-widest text-white/30 font-bold">Vocabulary</div>
                                    <div className="grid grid-cols-1 gap-2">
                                      {msg.analysis.vocabulary.map((v, i) => (
                                        <div key={i} className="bg-white/5 p-2 rounded-lg border border-white/5 flex justify-between items-center">
                                          <div>
                                            <div className="text-xs font-bold text-emerald-50">{v.word}</div>
                                            <div className="text-[10px] text-white/40 italic">{v.type}</div>
                                          </div>
                                          <div className="text-right">
                                            <div className="text-[10px] text-white/60">{v.translation}</div>
                                            {v.isNew && <span className="text-[8px] bg-emerald-500/20 text-emerald-400 px-1 rounded uppercase font-bold ml-1">New</span>}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>

                                  <div className="space-y-2">
                                    <div className="text-[9px] uppercase tracking-widest text-white/30 font-bold">New Elements</div>
                                    <div className="flex flex-wrap gap-1">
                                      {msg.analysis.newElements.map((el, i) => (
                                        <span key={i} className="text-[9px] bg-emerald-500/10 text-emerald-400/80 px-2 py-0.5 rounded-full border border-emerald-500/20">
                                          {el}
                                        </span>
                                      ))}
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                      <div className="text-[9px] uppercase tracking-widest text-white/30 font-bold">Level</div>
                                      <div className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20 text-center">
                                        {msg.analysis.level}
                                      </div>
                                    </div>
                                    <div className="space-y-1">
                                      <div className="text-[9px] uppercase tracking-widest text-white/30 font-bold">Progress</div>
                                      <div className="text-[10px] text-white/60 leading-tight">
                                        {msg.analysis.progress}
                                      </div>
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                  <div ref={chatEndRef} />
                </div>

                <div className="p-6 bg-white/5 border-t border-white/10">
                  <div className="flex flex-col gap-3">
                    <form onSubmit={handleTextSubmit} className="flex gap-2">
                      <input
                        type="text"
                        value={textInput}
                        onChange={(e) => setTextInput(e.target.value)}
                        placeholder={isDemoMode ? "Type or click mic for demo..." : "Type in French..."}
                        disabled={isLoading || demoComplete}
                        className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-emerald-500/50 transition-all disabled:opacity-50"
                      />
                      <button
                        type="submit"
                        disabled={isLoading || !textInput.trim() || demoComplete}
                        className="px-4 py-3 bg-emerald-500/20 border border-emerald-500/30 rounded-xl text-emerald-400 hover:bg-emerald-500/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Send size={18} />
                      </button>
                    </form>

                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={handleVoiceToggle}
                      disabled={isLoading || demoComplete}
                      className={`h-12 rounded-xl flex items-center justify-center gap-3 transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                        isListening
                          ? 'bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.3)]'
                          : isFlying
                          ? 'bg-blue-500 text-white shadow-[0_0_20px_rgba(59,130,246,0.3)]'
                          : 'bg-emerald-500 text-white shadow-[0_0_20px_rgba(16,185,129,0.3)]'
                      }`}
                    >
                      {isListening ? <Loader2 className="animate-spin" size={18} /> : isFlying ? <Plane size={18} /> : <Mic size={18} />}
                      <span className="font-bold text-sm uppercase tracking-widest">
                        {demoComplete ? 'Demo Complete' :
                         isListening ? 'Listening... tap to stop' :
                         isDemoMode ? `Demo Turn ${Math.min(getMockTurnIndex() + 1, getTotalMockTurns())}/${getTotalMockTurns()}` :
                         isFlying ? 'Talk to Navigator' : 'Hold to Speak'}
                      </span>
                    </motion.button>

                    <p className="text-[10px] text-center text-white/30 uppercase tracking-widest">
                      {isDemoMode ? 'French A1 to A2 progression demo' :
                       isFlying ? 'The Navigator is listening to your commands' : 'Speak French and grow your neural nebula'}
                    </p>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
