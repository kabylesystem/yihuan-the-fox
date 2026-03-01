import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { NebulaCanvas } from './components/NebulaCanvas';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Neuron, Synapse, NebulaState, Category, Message } from './types';
import { analyzeInput, checkBackend, isUsingBackend, resetMockState, getMockTurnIndex, getTotalMockTurns } from './services/geminiService';
import { onConnectionStatusChange, onStatusStep, onTTS, ConnectionStatus, hardResetSession } from './services/backendService';
import { Send, Zap, Info, Loader2, Search, Filter, Mic, Clock, X, MessageSquare, User, Bot, ChevronDown, ChevronUp, Plane, RefreshCw, Wifi, WifiOff, CheckCircle2, Circle, Sparkles, LocateFixed, Trash2, Award } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import blueRingLogo from './assets/blue-ring-logo.svg';

const INITIAL_STATE: NebulaState = {
  neurons: [],
  synapses: [],
  messages: [
    {
      id: 'welcome',
      role: 'ai',
      text: 'Welcome! Tap the mic and say "Bonjour" to begin. Each word you learn becomes a node in your knowledge graph — watch connections form as you progress.',
      timestamp: Date.now(),
      analysis: {
        vocabulary: [
          { word: 'Bienvenue', translation: 'Welcome', type: 'interjection', isNew: true },
        ],
        newElements: ['French Greeting'],
        level: 'A0',
        progress: 'Say your first French word to create your first neuron!'
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

// ── Animated word-by-word text ───────────────────────────────────────────

function AnimatedText({ text, className, delay = 0 }: { text: string; className?: string; delay?: number }) {
  const words = text.split(' ');
  return (
    <span className={className}>
      {words.map((word, i) => (
        <motion.span
          key={`${word}-${i}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: delay + i * 0.06, duration: 0.3 }}
          className="inline-block mr-[0.3em]"
        >
          {word}
        </motion.span>
      ))}
    </span>
  );
}

function BlueRingLogo() {
  return (
    <motion.div
      animate={{ scale: [1, 1.03, 1] }}
      transition={{ duration: 4.8, repeat: Infinity, ease: 'easeInOut' }}
      className="relative w-12 h-12"
    >
      <img
        src={blueRingLogo}
        alt="Echo ring logo"
        className="w-full h-full object-contain drop-shadow-[0_0_10px_rgba(80,110,200,0.35)]"
      />
    </motion.div>
  );
}

export default function App() {
  const [state, setState] = useState<NebulaState>(INITIAL_STATE);
  const [isLoading, setIsLoading] = useState(false);
  const [processingStep, setProcessingStep] = useState('');
  const [selectedNeuron, setSelectedNeuron] = useState<Neuron | null>(null);
  const [filterCategory, setFilterCategory] = useState<Category | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [timePulse, setTimePulse] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [voiceFallbackMode, setVoiceFallbackMode] = useState(false);
  const [audioFailStreak, setAudioFailStreak] = useState(0);
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

  // Voice HUD state
  const [lastUserText, setLastUserText] = useState('');
  const [lastAiText, setLastAiText] = useState('');
  const [lastCorrection, setLastCorrection] = useState('');
  const [lastAnalysis, setLastAnalysis] = useState<Message['analysis'] | null>(null);
  const [hudVisible, setHudVisible] = useState(false);
  const hudTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Gamification state
  const [xp, setXp] = useState(0);
  const [cefrLevel, setCefrLevel] = useState('A0');
  const [streak, setStreak] = useState(0);
  const [qualityStreak, setQualityStreak] = useState(0);
  const [combo, setCombo] = useState(0);
  const [missionIndex, setMissionIndex] = useState(0);
  const [missionDone, setMissionDone] = useState<Record<string, boolean>>({});
  const [missionBanner, setMissionBanner] = useState<string | null>(null);
  const [missionExpanded, setMissionExpanded] = useState(false);
  const [lastLatency, setLastLatency] = useState<{ stt: number; llm: number; total: number } | null>(null);
  const [levelUpEvent, setLevelUpEvent] = useState<string | null>(null);
  const [canvasFailed, setCanvasFailed] = useState(false);
  const [canvasResetKey, setCanvasResetKey] = useState(0);
  const [recenterNonce, setRecenterNonce] = useState(0);
  const [linkInspector, setLinkInspector] = useState<{ reason: string; detail: string; evidence: string[] } | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const completedMissionRef = useRef<number | null>(null);
  const lastAiTextRef = useRef('');
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);

  const fadingTargets = useMemo(
    () =>
      state.neurons
        .filter((n) => n.strength >= 0.18 && n.strength < 0.58)
        .sort((a, b) => a.strength - b.strength)
        .slice(0, 3)
        .map((n) => n.label),
    [state.neurons]
  );

  const missionDeck = useMemo(() => ([
    {
      id: 'm1',
      title: 'Talk about who you are',
      objective: 'Say your name and where you live.',
      starter: `Try saying: "Je m'appelle ... et j'habite à ...".`,
      reward: 45,
      targets: fadingTargets.slice(0, 1),
      tasks: [
        { id: 'm1_intro', label: 'Say your name in French.' },
        { id: 'm1_place', label: 'Say where you live.' },
        { id: 'm1_detail', label: 'Add one extra detail (city, hobby, or job).' },
      ],
    },
    {
      id: 'm2',
      title: 'Talk about food you like',
      objective: 'Say what food you like and why.',
      starter: `Try saying: "J'aime ... parce que ...".`,
      reward: 50,
      targets: fadingTargets.slice(0, 2),
      tasks: [
        { id: 'm2_food', label: 'Mention at least one food you like.' },
        { id: 'm2_reason', label: 'Give a reason (because...).' },
        { id: 'm2_reuse', label: fadingTargets[0] ? `Reuse this fading word: "${fadingTargets[0]}".` : 'Reuse one previous word.' },
      ],
    },
    {
      id: 'm3',
      title: 'Talk about what you did today',
      objective: 'Describe 2 actions from your day.',
      starter: `Try saying: "Aujourd'hui, j'ai ... puis j'ai ...".`,
      reward: 60,
      targets: fadingTargets.slice(0, 2),
      tasks: [
        { id: 'm3_today_action', label: 'Use a time anchor (today / this morning / tonight).' },
        { id: 'm3_today_time', label: 'Describe at least two actions in sequence.' },
        { id: 'm3_reuse', label: fadingTargets[0] ? `Reuse this fading word: "${fadingTargets[0]}".` : 'Reuse one previous word.' },
      ],
    },
  ]), [fadingTargets]);

  const activeMission = missionDeck[missionIndex % missionDeck.length];

  const evaluateMissionTask = useCallback((taskId: string, analysis: Message['analysis'] | null, graphState: NebulaState, userText: string) => {
    const accepted = (analysis?.acceptedUnits || []).map((u) => u.toLowerCase());
    const quality = analysis?.qualityScore || 0;
    const lowerText = (userText || '').toLowerCase();
    const containsTarget = (target: string) => {
      const t = target.toLowerCase();
      return accepted.some((u) => u.includes(t) || t.includes(u)) || lowerText.includes(t);
    };
    const containsAny = (candidates: string[]) => candidates.some((w) => lowerText.includes(w));
    const foodWords = ['pizza', 'pâtes', 'pates', 'riz', 'pain', 'fromage', 'poulet', 'salade', 'burger', 'sushi', 'fruit', 'café', 'cafe', 'chocolat', 'poisson', 'viande'];

    switch (taskId) {
      case 'm1_intro':
        return containsAny(["je m'appelle", "je suis"]) || accepted.some((u) => u.startsWith('je suis'));
      case 'm1_place':
        return containsAny(["j'habite", "j habite", "à paris", "a paris", "en france", "dans"]);
      case 'm1_detail':
        return accepted.length >= 2 || quality >= 0.65;
      case 'm2_food':
        return containsAny(foodWords);
      case 'm2_reason':
        return containsAny(["parce que", "car", "because"]);
      case 'm2_reuse':
        return activeMission.targets?.[0] ? containsTarget(activeMission.targets[0]) : accepted.length >= 1;
      case 'm3_today_action':
        return containsAny(["aujourd'hui", "aujourdhui", "ce matin", "ce soir", "cet apres", "cette nuit"]);
      case 'm3_today_time':
        return containsAny(["puis", "ensuite", "après", "apres", "et puis", "then"]);
      case 'm3_reuse':
        return activeMission.targets?.[0] ? containsTarget(activeMission.targets[0]) : accepted.length >= 1;
      default:
        return false;
    }
  }, [combo, qualityStreak, activeMission]);

  const playTtsPayload = useCallback((tts: any) => {
    if (!tts) return;

    const fallbackText = tts?.text || lastAiTextRef.current;
    const speakBrowser = (text: string) => {
      if (!text || !('speechSynthesis' in window)) return;
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'fr-FR';
        utterance.rate = 1.02;
        window.speechSynthesis.speak(utterance);
      } catch {
        // no-op
      }
    };

    if (tts.mode === 'audio' && tts.audio_base64) {
      try {
        if (activeAudioRef.current) {
          activeAudioRef.current.pause();
          activeAudioRef.current = null;
        }
        const mime = tts.content_type || 'audio/mp3';
        const audio = new Audio(`data:${mime};base64,${tts.audio_base64}`);
        activeAudioRef.current = audio;
        audio.play().catch(() => speakBrowser(fallbackText));
        return;
      } catch {
        speakBrowser(fallbackText);
        return;
      }
    }

    speakBrowser(fallbackText);
  }, []);

  // ── Initialize: check backend availability ───────────────────────────
  useEffect(() => {
    onConnectionStatusChange(setConnectionStatus);
    onStatusStep(setProcessingStep);
    onTTS(playTtsPayload);

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
      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
        activeAudioRef.current = null;
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [playTtsPayload]);

  useEffect(() => {
    lastAiTextRef.current = lastAiText;
  }, [lastAiText]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.messages]);

  useEffect(() => {
    if (isFlying) {
      setShowChat(true);
      const dimmingNeurons = state.neurons.filter(n => !n.isShadow && n.strength < 0.4);
      const suggestion = dimmingNeurons.length > 0
        ? `Neural Navigator reporting for duty! I notice your memory of "${dimmingNeurons[0].label}" is dimming. Shall we fly there for a quick review?`
        : "Neural Navigator online. All systems stable. Where shall we explore today?";

      setState(prev => ({
        ...prev,
        messages: [
          ...prev.messages,
          { id: `nav-${Date.now()}`, role: 'ai', text: suggestion, timestamp: Date.now() }
        ]
      }));
    }
  }, [isFlying]);

  // Clear isNew flags after 3 seconds
  useEffect(() => {
    const hasNew = state.neurons.some(n => n.isNew) || state.synapses.some(s => s.isNew);
    if (hasNew) {
      const timer = setTimeout(() => {
        setState(prev => ({
          ...prev,
          neurons: prev.neurons.map(n => ({ ...n, isNew: false })),
          synapses: prev.synapses.map(s => ({ ...s, isNew: false })),
        }));
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [state.neurons, state.synapses]);

  const triggerShootingStar = () => {
    const id = Math.random().toString(36).substr(2, 9);
    setShootingStars(prev => [...prev, id]);
  };

  const handleShootingStarComplete = (id: string) => {
    setShootingStars(prev => prev.filter(s => s !== id));
  };

  const retryCanvas = () => {
    setCanvasFailed(false);
    setCanvasResetKey(prev => prev + 1);
  };

  const handleRecenter = () => {
    setSelectedNeuron(null);
    setSearchQuery('');
    setRecenterNonce((n) => n + 1);
  };

  const missionTasks = useMemo(() => (
    activeMission.tasks.map((t) => ({ ...t, done: !!missionDone[t.id] }))
  ), [activeMission, missionDone]);

  const missionDoneCount = useMemo(
    () => missionTasks.filter((t) => t.done).length,
    [missionTasks]
  );

  const missionProgressPct = useMemo(
    () => Math.round((missionDoneCount / Math.max(1, missionTasks.length)) * 100),
    [missionDoneCount, missionTasks.length]
  );

  useEffect(() => {
    if (missionTasks.length === 0) return;
    if (missionDoneCount < missionTasks.length) return;
    if (completedMissionRef.current === missionIndex) return;

    completedMissionRef.current = missionIndex;
    const reward = activeMission.reward;
    setXp((prev) => prev + reward);
    setMissionBanner(`Mission Complete: ${activeMission.title}`);
    setTimeout(() => setMissionBanner(null), 2200);
    setMissionIndex((idx) => (idx + 1) % missionDeck.length);
    setMissionDone({});
  }, [missionDoneCount, missionTasks.length, missionIndex, activeMission, missionDeck.length]);

  // Show HUD with auto-fade
  const showHud = (userText: string, aiText: string, correction: string, analysis: Message['analysis'] | null) => {
    setLastUserText(userText);
    setLastAiText(aiText);
    setLastCorrection(correction);
    setLastAnalysis(analysis);
    setHudVisible(true);

    if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
    hudTimerRef.current = setTimeout(() => {
      setHudVisible(false);
    }, 12000);
  };

  // ── Send handler (text or audio) ─────────────────────────────────────
  const handleSend = async (input: string, inputType: 'text' | 'audio' = 'text') => {
    if (!input.trim() || isLoading) return;

    setIsLoading(true);
    triggerShootingStar();

    try {
      const newState = await analyzeInput(input, state, isFlying, inputType);
      if (
        !newState ||
        !Array.isArray(newState.neurons) ||
        !Array.isArray(newState.synapses) ||
        !Array.isArray(newState.messages)
      ) {
        throw new Error('Invalid state payload from analyzeInput');
      }

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

      // Update HUD with the latest conversation turn
      const msgs = newState.messages;
      const lastAi = [...msgs].reverse().find(m => m.role === 'ai' && !m.id.startsWith('nav-'));
      const lastUser = [...msgs].reverse().find(m => m.role === 'user');
      if (lastUser && lastAi) {
        showHud(lastUser.text, lastAi.text, lastAi.correctedForm || '', lastAi.analysis || null);
      }
      const maybeErrorMsg = [...msgs].reverse().find(m => m.role === 'ai')?.text || '';
      const isAudioFailure = inputType === 'audio' && maybeErrorMsg.toLowerCase().startsWith('error:');
      if (isAudioFailure) {
        setAudioFailStreak((prev) => {
          const next = prev + 1;
          if (next >= 2) setVoiceFallbackMode(true);
          return next;
        });
      } else if (inputType === 'audio') {
        setAudioFailStreak(0);
        setVoiceFallbackMode(false);
      }

      // Gamification: quality-based progression
      const newWords = newState.neurons.filter(n => n.isNew).length;
      const quality = lastAi?.analysis?.qualityScore ?? 0.6;
      const acceptedUnits = lastAi?.analysis?.acceptedUnits?.length || 0;
      const rejectedUnits = lastAi?.analysis?.rejectedUnits?.length || 0;
      const qualityOk = quality >= 0.65;
      if (newWords > 0 || lastAi) {
        const comboBoost = qualityOk ? Math.min(4, combo + 1) : 0;
        const deltaXp = Math.round(newWords * 10 + acceptedUnits * 6 - rejectedUnits * 2 + comboBoost * 4 + 4);
        setXp(prev => Math.max(0, prev + deltaXp));
        setStreak(prev => prev + 1);
        setCombo(comboBoost);
        setQualityStreak(prev => (qualityOk ? prev + 1 : 0));
      }
      if (lastAi?.analysis?.latencyMs) setLastLatency(lastAi.analysis.latencyMs);
      if (lastAi?.analysis?.level && lastAi.analysis.level !== cefrLevel) {
        setLevelUpEvent(`${cefrLevel} → ${lastAi.analysis.level}`);
        setCefrLevel(lastAi.analysis.level);
        setTimeout(() => setLevelUpEvent(null), 3000);
      }

      const analysis = lastAi?.analysis || null;
      const userText = lastUser?.text || '';
      setMissionDone((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const task of activeMission.tasks) {
          if (!next[task.id] && evaluateMissionTask(task.id, analysis, newState, userText)) {
            next[task.id] = true;
            changed = true;
          }
        }
        return changed ? next : prev;
      });

      if (isDemoMode && getMockTurnIndex() >= getTotalMockTurns()) {
        setDemoComplete(true);
      }
    } catch (error) {
      console.error("Failed to analyze input:", error);
    } finally {
      setIsLoading(false);
      setProcessingStep('');
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
    if (isLoading || demoComplete || voiceFallbackMode) return;

    if (isListening) {
      stopRecording();
    } else if (isDemoMode) {
      handleSend('[mock-advance]');
    } else {
      startRecording();
    }
  };

  // ── Reset session ────────────────────────────────────────────────────
  const handleReset = async () => {
    if (isUsingBackend()) {
      await hardResetSession();
    }
    resetMockState();
    setState(INITIAL_STATE);
    setDemoComplete(false);
    setVoiceFallbackMode(false);
    setAudioFailStreak(0);
    setHudVisible(false);
    setLastUserText('');
    setLastAiText('');
    setLastCorrection('');
    setLastAnalysis(null);
    setXp(0);
    setCefrLevel('A0');
    setStreak(0);
    setQualityStreak(0);
    setCombo(0);
    setMissionIndex(0);
    setMissionDone({});
    setMissionBanner(null);
    setLastLatency(null);
    setLinkInspector(null);
    setLevelUpEvent(null);
    completedMissionRef.current = null;
    retryCanvas();
  };

  const handleNeuronClick = useCallback((neuron: Neuron) => {
    setSelectedNeuron(neuron);
  }, []);

  const handleSynapseClick = useCallback((synapse: Synapse) => {
    const target = state.neurons.find(n => n.id === synapse.target);
    if (target) setSelectedNeuron(target);
    setLinkInspector({
      reason: synapse.reason || synapse.linkKind,
      detail: synapse.reasonDetail || 'This relationship was generated from validated canonical learning units.',
      evidence: synapse.evidenceUnits || [],
    });
  }, [state.neurons]);

  const searchTarget = useMemo(() => {
    if (!searchQuery) return null;
    return state.neurons.find(n => n.label.toLowerCase().includes(searchQuery.toLowerCase())) || null;
  }, [searchQuery, state.neurons]);

  // ── Connection badge ─────────────────────────────────────────────────
  const connectionBadge = isDemoMode ? (
    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/12 border border-blue-400/35 text-blue-600 text-[10px] uppercase tracking-widest font-bold">
      <WifiOff size={10} />
      <span>Demo Mode</span>
    </div>
  ) : connectionStatus === 'connected' ? (
    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/12 border border-blue-400/35 text-blue-600 text-[10px] uppercase tracking-widest font-bold">
      <Wifi size={10} />
      <span>Live</span>
    </div>
  ) : null;

  // ── Processing step label ────────────────────────────────────────────
  const stepLabel = processingStep === 'transcribing' ? 'Converting speech to text...'
    : processingStep === 'thinking' ? 'Generating i+1 response...'
    : processingStep === 'speaking' ? 'Synthesizing speech...'
    : 'Processing...';

  const latestQuality = Math.round((lastAnalysis?.qualityScore || 0) * 100);
  const avgMastery = state.neurons.length > 0
    ? Math.round((state.neurons.reduce((sum, n) => sum + n.strength, 0) / state.neurons.length) * 100)
    : 0;
  const learningHealth = Math.max(
    0,
    Math.min(
      100,
      Math.round((latestQuality * 0.5) + (avgMastery * 0.3) + (Math.min(combo, 4) * 5) + (qualityStreak * 2))
    )
  );
  const paceLabel = !lastLatency
    ? 'No data yet'
    : lastLatency.total <= 2500
      ? 'Fast'
      : lastLatency.total <= 4500
        ? 'Normal'
        : 'Slow';
  const paceColor = !lastLatency
    ? 'text-white/50'
    : lastLatency.total <= 2500
      ? 'text-blue-300'
      : lastLatency.total <= 4500
        ? 'text-amber-300'
        : 'text-red-300';
  const liveMissionObjective = (lastAnalysis?.missionHint || activeMission.objective || '').trim();

  return (
    <div className="relative w-full h-screen overflow-hidden text-[#12225f] font-sans bg-[#f6f4ea]">
      {/* 3D Nebula — always full screen */}
      <ErrorBoundary
        resetKey={canvasResetKey}
        onError={() => setCanvasFailed(true)}
        fallback={(
          <div className="w-full h-full bg-[#020205] flex items-center justify-center">
            <div className="bg-black/60 border border-white/10 rounded-2xl px-6 py-5 text-center pointer-events-auto">
              <div className="text-white/80 text-sm mb-2">3D visualization crashed</div>
              <div className="text-white/40 text-xs mb-4">The conversation is still running. You can reload the graph.</div>
              <button
                onClick={retryCanvas}
                className="px-4 py-2 rounded-lg bg-blue-500/20 border border-blue-500/30 text-blue-300 text-sm hover:bg-blue-500/30"
              >
                Reload 3D
              </button>
            </div>
          </div>
        )}
      >
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
          recenterNonce={recenterNonce}
        />
      </ErrorBoundary>
      {canvasFailed && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[70] px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs pointer-events-none">
          3D recovered mode active
        </div>
      )}
      {linkInspector && (
        <div className="absolute top-14 right-6 z-[70] w-[360px] bg-black/70 backdrop-blur-xl border border-cyan-400/25 rounded-2xl p-4 shadow-2xl pointer-events-auto">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] uppercase tracking-widest text-cyan-200/75 font-bold">Link Explanation</div>
            <button
              onClick={() => setLinkInspector(null)}
              className="text-white/40 hover:text-white/80"
            >
              <X size={14} />
            </button>
          </div>
          <div className="text-sm text-cyan-100 font-medium mb-2">{linkInspector.reason}</div>
          <div className="text-xs text-white/70 leading-relaxed">{linkInspector.detail}</div>
          {linkInspector.evidence.length > 0 && (
            <div className="mt-3 pt-2 border-t border-white/10">
              <div className="text-[10px] uppercase tracking-widest text-white/40 mb-1">Evidence</div>
              <div className="flex flex-wrap gap-1.5">
                {linkInspector.evidence.map((e, i) => (
                  <span key={`${e}-${i}`} className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-400/25 text-cyan-200">
                    {e}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* UI Overlay */}
      <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-6">
        <div className="absolute inset-0 pointer-events-none opacity-22 mix-blend-multiply" style={{ backgroundImage: 'radial-gradient(rgba(26,49,130,0.10) 0.6px, transparent 0.6px), radial-gradient(rgba(11,29,103,0.08) 0.5px, transparent 0.5px)', backgroundSize: '3px 3px, 6px 6px', backgroundPosition: '0 0, 1px 2px' }} />
        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="relative">
          <div className="w-full flex flex-col gap-4 pointer-events-auto items-start">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="ml-6 bg-[#f4f0df]/85 backdrop-blur-md border border-blue-300/35 p-4 rounded-2xl shadow-[0_12px_40px_rgba(30,64,175,0.18)]"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center border border-blue-300/45 bg-[#f3efdf]">
                  <BlueRingLogo />
                </div>
                <div>
                  <h1 className="text-xl font-bold tracking-tight text-[#0d2374]">Echo</h1>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[#3550b2]/70 font-medium">Neural Language Lab</p>
                </div>
                <div className="ml-3">{connectionBadge}</div>
              </div>
            </motion.div>

            {/* Mission panel */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 }}
              className="self-start ml-6 relative overflow-hidden bg-[#f5f1e1]/80 backdrop-blur-xl border border-blue-300/45 p-5 rounded-[28px] w-[500px] max-w-[calc(100vw-3rem)] shadow-[0_16px_50px_rgba(30,64,175,0.16)]"
            >
              <div className="absolute -right-28 -top-28 w-64 h-64 rounded-full border-[10px] border-blue-500/20" />
              <div className="absolute -right-28 -top-28 w-64 h-64 rounded-full bg-blue-500/10 blur-3xl animate-pulse" />
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <motion.p
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-[32px] text-[#10246f] leading-[1.06] mt-1 font-semibold"
                  >
                    {activeMission.title}
                  </motion.p>
                  <p className="text-[16px] text-[#1f347f]/82 mt-1">{liveMissionObjective}</p>
                </div>
                <div className="px-3 py-1.5 rounded-full bg-blue-500/12 border border-blue-300/45 text-base font-mono text-[#2446ab]">
                  {missionDoneCount}/{missionTasks.length}
                </div>
              </div>

              <div className="mb-4">
                <div className="w-full h-2.5 rounded-full bg-[#e3ddc9] border border-blue-200/45 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${missionProgressPct}%` }}
                    transition={{ type: 'spring', stiffness: 90, damping: 18 }}
                    className="h-full bg-gradient-to-r from-blue-500 to-blue-300"
                  />
                </div>
              </div>
              <button
                onClick={() => setMissionExpanded((v) => !v)}
                className="w-full mt-1 text-left text-sm text-[#2242aa] hover:text-[#16308e] transition-colors"
              >
                {missionExpanded ? 'Hide tasks' : 'Show tasks'}
              </button>

              {missionExpanded && (
                <>
                  <div className="space-y-2.5 mt-3">
                    {missionTasks.map((task) => {
                      const checked = task.done;
                      return (
                        <div
                          key={task.id}
                          className={`w-full text-left flex items-center gap-3 rounded-xl px-4 py-3 border transition-all ${
                            checked
                              ? 'bg-blue-500/12 border-blue-300/50 text-[#15318e]'
                              : 'bg-[#ece7d5]/70 border-blue-200/35 text-[#223a8f] hover:bg-[#f6f2e3]'
                          }`}
                        >
                          {checked ? <CheckCircle2 size={17} className="text-[#2041a8] flex-shrink-0" /> : <Circle size={17} className="text-[#4562c0]/60 flex-shrink-0" />}
                          <span className="text-[16px] leading-snug">{task.label}</span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-4 pt-3 border-t border-blue-200/50 flex items-center justify-between">
                    <div className="text-sm text-[#2b48af]/80 flex items-center gap-1.5">
                      <Award size={12} className="text-yellow-300" />
                      Mission reward
                    </div>
                    <div className="text-sm font-mono text-[#2142ad]">+{activeMission.reward} XP</div>
                  </div>
                </>
              )}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="self-start ml-6 bg-[#f5f1e1]/80 backdrop-blur-xl border border-blue-300/35 p-3 rounded-2xl w-[500px] max-w-[calc(100vw-3rem)] shadow-[0_8px_24px_rgba(30,64,175,0.10)]"
            >
              <div className="text-[10px] uppercase tracking-[0.16em] text-[#2a47a1]/70 font-semibold mb-2">Worlds</div>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((cat) => {
                  const active = filterCategory === cat;
                  return (
                    <button
                      key={cat}
                      onClick={() => setFilterCategory(cat)}
                      className={`px-3 py-1.5 rounded-full border text-xs font-semibold tracking-wide transition-all ${
                        active
                          ? 'bg-blue-600 text-white border-blue-600 shadow-[0_0_14px_rgba(37,76,170,0.34)]'
                          : 'bg-[#eef2fc] text-[#26479f] border-blue-200/70 hover:bg-white'
                      }`}
                    >
                      {cat === 'all' ? 'All' : cat}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </div>

          {/* Top-right controls */}
          <div className="absolute top-0 right-0 flex flex-col items-end gap-4 pointer-events-auto">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={16} />
                <input
                  type="text"
                  placeholder="Search neurons..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-[#f0f3fb]/92 backdrop-blur-md border border-blue-200/55 rounded-full py-2 pl-10 pr-10 text-sm focus:outline-none focus:border-blue-500/60 transition-all w-64 text-black placeholder:text-black/45"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#3652b7]/55 hover:text-[#1e3a8a]"
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
                      ? 'bg-blue-600 border-blue-600 text-white shadow-[0_0_20px_rgba(59,130,246,0.5)]'
                      : 'bg-[#f5f1e1]/85 border-blue-200/50 text-[#2443a7] hover:bg-[#ffffff]'
                  }`}
                  title="Toggle Interstellar Flight"
                >
                  <Plane size={18} className={isFlying ? 'animate-bounce' : ''} />
                  <span className="text-xs font-bold uppercase tracking-widest">
                    {isFlying ? 'In Flight' : 'Navigation'}
                  </span>
                </button>
                <button
                  onClick={() => setShowChat(!showChat)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-full border transition-all ${
                    showChat
                      ? 'bg-blue-500/18 border-blue-400/40 text-[#2142ad]'
                      : 'bg-[#f5f1e1]/85 border-blue-200/50 text-[#2443a7] hover:bg-[#ffffff]'
                  }`}
                >
                  <MessageSquare size={16} />
                  <span className="text-xs font-bold uppercase tracking-widest">Chat</span>
                </button>
                <button
                  onClick={handleRecenter}
                  className="flex items-center gap-2 px-3 py-2 rounded-full border transition-all bg-[#f5f1e1]/85 border-blue-200/50 text-[#2443a7] hover:bg-[#ffffff]"
                  title="Recenter graph layout"
                >
                  <LocateFixed size={16} />
                  <span className="text-xs font-bold uppercase tracking-widest">Recenter</span>
                </button>
                <button
                  onClick={handleReset}
                  className="flex items-center gap-2 px-3 py-2 rounded-full border transition-all bg-[#f5f1e1]/85 border-blue-200/50 text-[#2443a7] hover:bg-red-100 hover:border-red-300 hover:text-red-500"
                  title="Hard Reset — delete all learned words for this session"
                >
                  <Trash2 size={16} />
                  <span className="text-xs font-bold uppercase tracking-widest">Hard Reset</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Central Voice HUD (bottom center) ─────────────────────── */}
        <div className="flex justify-center items-end pointer-events-auto">
          <div className="flex flex-col items-center gap-4 max-w-xl w-full">

            {/* Transcript area */}
            <AnimatePresence>
              {hudVisible && (lastUserText || lastAiText) && (
                <motion.div
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                  className="w-full bg-[#edf2fb]/94 backdrop-blur-xl border border-blue-200/65 rounded-2xl p-4 shadow-[0_18px_38px_rgba(37,76,170,0.20)]"
                >
                  {/* User text */}
                  {lastUserText && (
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-6 h-6 rounded-md bg-blue-500/12 border border-blue-300/60 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <User size={12} className="text-[#2850ad]" />
                      </div>
                      <div className="text-[17px] text-[#183477] leading-snug">
                        <AnimatedText text={lastUserText} />
                      </div>
                    </div>
                  )}

                  {/* Correction (i+1: show the corrected form) */}
                  {lastCorrection && (
                    <motion.div
                      initial={{ opacity: 0, x: -5 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.2 }}
                      className="flex items-start gap-3 mb-3 ml-9"
                    >
                      <div className="text-[14px] text-[#2b4587]/85 italic">
                        <span className="text-[11px] uppercase tracking-widest font-bold mr-2 text-[#3357ad]/75">Correction</span>
                        <AnimatedText text={lastCorrection} delay={0.15} className="text-[#2e4d98]/95" />
                      </div>
                    </motion.div>
                  )}

                  {/* AI response */}
                  {lastAiText && (
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-6 h-6 rounded-md bg-blue-500/8 border border-blue-200/60 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Bot size={12} className="text-[#3a59ad]" />
                      </div>
                      <div className="text-[17px] text-[#1d3775] leading-snug">
                        <AnimatedText text={lastAiText} delay={0.4} />
                      </div>
                    </div>
                  )}

                  {/* Accepted canonical units */}
                  {lastAnalysis && (((lastAnalysis.acceptedUnits?.length || 0) > 0) || lastAnalysis.vocabulary.length > 0) && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.8 }}
                      className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-blue-200/55"
                    >
                      {(() => {
                        const allUnits = (lastAnalysis.acceptedUnits?.length
                          ? lastAnalysis.acceptedUnits
                          : lastAnalysis.vocabulary.map((v) => v.word));
                        const shown = allUnits.slice(0, 3);
                        return (
                          <>
                            {shown.map((unit, i) => (
                              <span
                                key={`${unit}-${i}`}
                                className="text-[12px] px-2.5 py-1 rounded-full border bg-blue-500/10 border-blue-300/60 text-[#264a9f]"
                              >
                                {unit}
                              </span>
                            ))}
                            {allUnits.length > shown.length && (
                              <span className="text-[12px] px-2.5 py-1 rounded-full border bg-[#dfe8fb] border-blue-200/80 text-[#2d4687]">
                                +{allUnits.length - shown.length}
                              </span>
                            )}
                          </>
                        );
                      })()}
                      {lastAnalysis.level && (
                        <span className="text-[11px] px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-300/60 text-[#2f54ad] font-mono font-bold ml-auto">
                          {lastAnalysis.level}
                        </span>
                      )}
                    </motion.div>
                  )}

                  {lastAnalysis?.progress && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 1.1 }}
                      className="text-[13px] text-[#35508f]/90 italic mt-2 pt-2 border-t border-blue-200/45"
                    >
                      {lastAnalysis?.progress}
                    </motion.div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Processing status */}
            <AnimatePresence>
              {isLoading && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2 px-4 py-2 rounded-full bg-black/40 backdrop-blur-md border border-white/10"
                >
                  <Loader2 className="animate-spin text-blue-400" size={14} />
                  <span className="text-xs text-white/60 uppercase tracking-widest">{stepLabel}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Text input (compact, above mic) */}
            <form onSubmit={handleTextSubmit} className="flex gap-2 w-full max-w-sm">
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder={isDemoMode ? "Type or tap mic..." : "Type in French..."}
                disabled={isLoading || demoComplete}
                className="flex-1 bg-[#f0f3fb]/92 backdrop-blur-md border border-blue-200/55 rounded-full px-4 py-2.5 text-sm text-black placeholder:text-black/45 focus:outline-none focus:border-blue-500/60 transition-all disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={isLoading || !textInput.trim() || demoComplete}
                className="px-3.5 py-2.5 bg-blue-100/90 border border-blue-300/70 rounded-full text-blue-700 hover:bg-blue-200/95 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Send size={16} />
              </button>
            </form>

            {/* Central mic button */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleVoiceToggle}
              disabled={isLoading || demoComplete || voiceFallbackMode}
              className={`group relative w-20 h-20 rounded-full flex items-center justify-center transition-all duration-500 ${
                demoComplete
                  ? 'bg-white/10 cursor-not-allowed'
                  : voiceFallbackMode
                    ? 'bg-amber-500/30 cursor-not-allowed'
                  : isListening
                    ? 'bg-red-500 shadow-[0_0_60px_rgba(239,68,68,0.6)]'
                    : 'bg-[#2f4cb8] shadow-[0_0_40px_rgba(47,76,184,0.35)] hover:shadow-[0_0_60px_rgba(47,76,184,0.55)]'
              }`}
            >
              <div className={`absolute inset-0 rounded-full border-2 border-white/20 ${isListening ? 'animate-ping' : ''}`} />
              {isLoading ? (
                <Loader2 className="animate-spin text-white" size={28} />
              ) : (
                <Mic className={`text-white transition-transform ${isListening ? 'scale-125' : ''}`} size={28} />
              )}

              {isListening && (
                <>
                  <div className="absolute -inset-3 border border-red-500/30 rounded-full animate-[ping_1.5s_infinite]" />
                  <div className="absolute -inset-6 border border-red-500/10 rounded-full animate-[ping_2s_infinite]" />
                </>
              )}

              {/* Onboarding: pulsing ring when no neurons yet */}
              {state.neurons.length === 0 && !isListening && !isLoading && !demoComplete && (
                <motion.div
                  animate={{ scale: [1, 1.3, 1], opacity: [0.6, 0.2, 0.6] }}
                  transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
                  className="absolute -inset-4 rounded-full border-2 border-blue-400/45"
                />
              )}
            </motion.button>

            {/* Status text under mic */}
            <div className="text-center mb-2">
              <p className="text-xs font-medium text-white/50 uppercase tracking-[0.3em]">
                {demoComplete ? 'Demo Complete — tap reset' :
                 isListening ? 'Listening... tap to send' :
                 voiceFallbackMode ? 'Voice fallback active — type text' :
                 isLoading ? stepLabel :
                 isDemoMode ? 'Tap to advance demo' : 'Tap to Speak'}
              </p>
              {voiceFallbackMode && (
                <p className="text-[10px] text-amber-300/70 mt-1">
                  Voice failed twice. Continue with text, or reset to retry voice.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Level Up Celebration ──────────────────────────────────── */}
      <AnimatePresence>
        {levelUpEvent && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.5 }}
            transition={{ duration: 0.5, type: 'spring', damping: 15 }}
            className="absolute inset-0 z-[60] flex items-center justify-center pointer-events-none"
          >
            <div className="text-center">
              <motion.div
                initial={{ y: 20 }}
                animate={{ y: 0 }}
                className="text-5xl font-bold text-blue-400 mb-2 drop-shadow-[0_0_30px_rgba(52,211,153,0.8)]"
              >
                LEVEL UP!
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="text-2xl text-white/80 font-mono"
              >
                {levelUpEvent}
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Mission Complete Banner ───────────────────────────────── */}
      <AnimatePresence>
        {missionBanner && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 170, damping: 18 }}
            className="absolute top-24 left-1/2 -translate-x-1/2 z-[95] px-5 py-3 rounded-2xl bg-blue-500/15 border border-blue-300/45 backdrop-blur-xl shadow-[0_0_28px_rgba(30,64,175,0.35)]"
          >
            <div className="text-[10px] uppercase tracking-[0.2em] text-blue-200/90 font-bold text-center">Quest Update</div>
            <div className="text-sm text-white font-semibold mt-1 text-center">{missionBanner}</div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Neuron Detail Modal ──────────────────────────────────────── */}
      <AnimatePresence>
        {selectedNeuron && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 w-[400px] pointer-events-auto z-50"
          >
            <div className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl overflow-hidden relative">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent opacity-50" />

              <div className="flex justify-between items-start mb-6">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`w-2 h-2 rounded-full ${selectedNeuron.isShadow ? 'bg-white/30' : 'bg-blue-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'}`} />
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
                          className="h-full bg-blue-400 shadow-[0_0_10px_rgba(52,211,153,0.5)]"
                        />
                      </div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-tighter mb-1 text-white/50">Usage Frequency</div>
                      <div className="text-lg font-mono font-bold text-blue-400">
                        {selectedNeuron.usageCount || 0} <span className="text-[10px] text-white/30 uppercase">times</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-sm text-blue-400/80">
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
                    <Mic size={14} className={isListening ? 'text-red-400' : 'text-blue-400'} />
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
                  <div className="bg-white/5 rounded-lg p-3 font-mono text-xs text-blue-400/70 border border-white/5">
                    {selectedNeuron.grammarDna}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Chat Sidebar (optional, toggled) ────────────────────────── */}
      <AnimatePresence>
        {showChat && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="absolute right-0 top-0 w-96 h-full bg-black/80 backdrop-blur-2xl border-l border-white/10 flex flex-col shadow-2xl z-40"
          >
            <div className="p-6 border-b border-white/10 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${
                  isFlying ? 'bg-blue-500/20 border-blue-500/30' : 'bg-blue-500/20 border-blue-500/30'
                }`}>
                  {isFlying ? <Plane className="text-blue-400" size={18} /> : <MessageSquare className="text-blue-400" size={18} />}
                </div>
                <h2 className="font-bold text-lg">{isFlying ? 'Neural Navigator' : 'History'}</h2>
              </div>
              <button
                onClick={() => setShowChat(false)}
                className="text-white/30 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide">
              {state.messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  <div className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center border ${
                    msg.role === 'user' ? 'bg-blue-500/20 border-blue-500/30' :
                    msg.id.startsWith('nav-') ? 'bg-blue-500/20 border-blue-500/30' : 'bg-white/10 border-white/10'
                  }`}>
                    {msg.role === 'user' ? <User size={16} className="text-blue-400" /> :
                     msg.id.startsWith('nav-') ? <Plane size={16} className="text-blue-400" /> : <Bot size={16} className="text-white/60" />}
                  </div>
                  <div className={`max-w-[80%] p-4 rounded-2xl text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-blue-500/10 border border-blue-500/20 text-blue-50'
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
                          className="flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold text-blue-400/60 hover:text-blue-400 transition-colors"
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
                                        <div className="text-xs font-bold text-blue-50">{v.word}</div>
                                        <div className="text-[10px] text-white/40 italic">{v.type}</div>
                                      </div>
                                      <div className="text-right">
                                        <div className="text-[10px] text-white/60">{v.translation}</div>
                                        {v.isNew && <span className="text-[8px] bg-blue-500/20 text-blue-400 px-1 rounded uppercase font-bold ml-1">New</span>}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              <div className="space-y-2">
                                <div className="text-[9px] uppercase tracking-widest text-white/30 font-bold">New Elements</div>
                                <div className="flex flex-wrap gap-1">
                                  {msg.analysis.newElements.map((el, i) => (
                                    <span key={i} className="text-[9px] bg-blue-500/10 text-blue-400/80 px-2 py-0.5 rounded-full border border-blue-500/20">
                                      {el}
                                    </span>
                                  ))}
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                  <div className="text-[9px] uppercase tracking-widest text-white/30 font-bold">Level</div>
                                  <div className="text-xs font-mono text-blue-400 bg-blue-500/10 px-2 py-1 rounded border border-blue-500/20 text-center">
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
