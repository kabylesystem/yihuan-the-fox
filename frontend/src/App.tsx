import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { NebulaCanvas } from './components/NebulaCanvas';
import { Dashboard } from './components/Dashboard';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Neuron, Synapse, NebulaState, Category, Message } from './types';
import { analyzeInput, checkBackend, isUsingBackend, resetMockState, getMockTurnIndex, getTotalMockTurns } from './services/geminiService';
import { onConnectionStatusChange, onStatusStep, onTTS, ConnectionStatus, hardResetSession } from './services/backendService';
import { Send, Zap, Info, Loader2, Search, Filter, Mic, Clock, X, MessageSquare, User, Bot, ChevronDown, ChevronUp, Plane, RefreshCw, Wifi, WifiOff, CheckCircle2, Circle, Sparkles, LocateFixed, Trash2, Volume2, FlaskConical, BarChart2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getDailyMissions, evaluateMissionTask as evalTask, MascotOverlay, loadDailyState, saveOnboarding, saveMissionProgress } from './missions';
import type { MissionWithTasks, MascotOverlayProps } from './missions';

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

const DEFAULT_CATEGORIES: (Category | 'all')[] = ['all', 'daily', 'social', 'travel', 'work', 'academic', 'coding', 'other'];

// ── Test Data Generator ──────────────────────────────────────────────
const FRENCH_VOCAB: { word: string; translation: string; category: Category; kind: 'vocab' | 'sentence' | 'grammar' }[] = [
  { word: 'bonjour', translation: 'hello', category: 'social', kind: 'vocab' },
  { word: 'merci', translation: 'thank you', category: 'social', kind: 'vocab' },
  { word: 'au revoir', translation: 'goodbye', category: 'social', kind: 'vocab' },
  { word: "je m'appelle", translation: 'my name is', category: 'social', kind: 'sentence' },
  { word: 'comment ça va', translation: 'how are you', category: 'social', kind: 'sentence' },
  { word: "j'habite à", translation: 'I live in', category: 'daily', kind: 'sentence' },
  { word: 'manger', translation: 'to eat', category: 'daily', kind: 'vocab' },
  { word: 'boire', translation: 'to drink', category: 'daily', kind: 'vocab' },
  { word: 'dormir', translation: 'to sleep', category: 'daily', kind: 'vocab' },
  { word: 'travailler', translation: 'to work', category: 'work', kind: 'vocab' },
  { word: 'le bureau', translation: 'the office', category: 'work', kind: 'vocab' },
  { word: 'un collègue', translation: 'a colleague', category: 'work', kind: 'vocab' },
  { word: 'une réunion', translation: 'a meeting', category: 'work', kind: 'vocab' },
  { word: 'le voyage', translation: 'the trip', category: 'travel', kind: 'vocab' },
  { word: "l'avion", translation: 'the plane', category: 'travel', kind: 'vocab' },
  { word: 'la gare', translation: 'the station', category: 'travel', kind: 'vocab' },
  { word: 'un billet', translation: 'a ticket', category: 'travel', kind: 'vocab' },
  { word: "j'aime", translation: 'I like', category: 'daily', kind: 'vocab' },
  { word: 'le fromage', translation: 'cheese', category: 'daily', kind: 'vocab' },
  { word: 'le pain', translation: 'bread', category: 'daily', kind: 'vocab' },
  { word: 'le café', translation: 'coffee', category: 'daily', kind: 'vocab' },
  { word: "aujourd'hui", translation: 'today', category: 'daily', kind: 'vocab' },
  { word: 'demain', translation: 'tomorrow', category: 'daily', kind: 'vocab' },
  { word: 'hier', translation: 'yesterday', category: 'daily', kind: 'vocab' },
  { word: 'la maison', translation: 'the house', category: 'daily', kind: 'vocab' },
  { word: 'le musée', translation: 'the museum', category: 'travel', kind: 'vocab' },
  { word: 'la plage', translation: 'the beach', category: 'travel', kind: 'vocab' },
  { word: "l'hôtel", translation: 'the hotel', category: 'travel', kind: 'vocab' },
  { word: 'un ami', translation: 'a friend', category: 'social', kind: 'vocab' },
  { word: 'la famille', translation: 'the family', category: 'social', kind: 'vocab' },
  { word: "s'il vous plaît", translation: 'please', category: 'social', kind: 'sentence' },
  { word: 'excusez-moi', translation: 'excuse me', category: 'social', kind: 'sentence' },
  { word: "l'université", translation: 'the university', category: 'academic', kind: 'vocab' },
  { word: 'étudier', translation: 'to study', category: 'academic', kind: 'vocab' },
  { word: 'un examen', translation: 'an exam', category: 'academic', kind: 'vocab' },
  { word: 'le professeur', translation: 'the teacher', category: 'academic', kind: 'vocab' },
  { word: 'apprendre', translation: 'to learn', category: 'academic', kind: 'vocab' },
  { word: 'la bibliothèque', translation: 'the library', category: 'academic', kind: 'vocab' },
  { word: 'le code', translation: 'the code', category: 'coding', kind: 'vocab' },
  { word: 'programmer', translation: 'to code', category: 'coding', kind: 'vocab' },
  { word: "l'ordinateur", translation: 'the computer', category: 'coding', kind: 'vocab' },
  { word: 'le clavier', translation: 'the keyboard', category: 'coding', kind: 'vocab' },
  { word: 'je voudrais', translation: 'I would like', category: 'social', kind: 'sentence' },
  { word: 'combien', translation: 'how much', category: 'daily', kind: 'vocab' },
  { word: 'où est', translation: 'where is', category: 'travel', kind: 'sentence' },
  { word: 'le restaurant', translation: 'the restaurant', category: 'daily', kind: 'vocab' },
  { word: "l'eau", translation: 'water', category: 'daily', kind: 'vocab' },
  { word: 'le vin', translation: 'wine', category: 'daily', kind: 'vocab' },
  { word: 'la carte', translation: 'the menu', category: 'daily', kind: 'vocab' },
  { word: 'le métro', translation: 'the metro', category: 'travel', kind: 'vocab' },
  { word: 'à gauche', translation: 'to the left', category: 'travel', kind: 'vocab' },
  { word: 'à droite', translation: 'to the right', category: 'travel', kind: 'vocab' },
  { word: 'tout droit', translation: 'straight ahead', category: 'travel', kind: 'vocab' },
  { word: 'parler', translation: 'to speak', category: 'social', kind: 'vocab' },
  { word: 'comprendre', translation: 'to understand', category: 'academic', kind: 'vocab' },
  { word: 'écrire', translation: 'to write', category: 'academic', kind: 'vocab' },
  { word: 'lire', translation: 'to read', category: 'academic', kind: 'vocab' },
  { word: 'le temps', translation: 'the weather/time', category: 'daily', kind: 'vocab' },
  { word: 'il fait beau', translation: "it's nice out", category: 'daily', kind: 'sentence' },
  { word: 'il pleut', translation: "it's raining", category: 'daily', kind: 'sentence' },
  { word: "j'ai faim", translation: "I'm hungry", category: 'daily', kind: 'sentence' },
  { word: "j'ai soif", translation: "I'm thirsty", category: 'daily', kind: 'sentence' },
  { word: 'le projet', translation: 'the project', category: 'work', kind: 'vocab' },
  { word: "l'entreprise", translation: 'the company', category: 'work', kind: 'vocab' },
  { word: 'le salaire', translation: 'the salary', category: 'work', kind: 'vocab' },
  { word: 'un emploi', translation: 'a job', category: 'work', kind: 'vocab' },
  { word: 'le week-end', translation: 'the weekend', category: 'daily', kind: 'vocab' },
  { word: 'faire du sport', translation: 'to exercise', category: 'daily', kind: 'sentence' },
  { word: 'le cinéma', translation: 'the cinema', category: 'daily', kind: 'vocab' },
  { word: 'la musique', translation: 'music', category: 'daily', kind: 'vocab' },
  { word: 'jouer', translation: 'to play', category: 'daily', kind: 'vocab' },
  { word: 'acheter', translation: 'to buy', category: 'daily', kind: 'vocab' },
  { word: 'le marché', translation: 'the market', category: 'daily', kind: 'vocab' },
  { word: 'la boulangerie', translation: 'the bakery', category: 'daily', kind: 'vocab' },
  { word: 'le médecin', translation: 'the doctor', category: 'daily', kind: 'vocab' },
  { word: 'la pharmacie', translation: 'the pharmacy', category: 'daily', kind: 'vocab' },
  { word: 'se lever', translation: 'to get up', category: 'daily', kind: 'vocab' },
  { word: 'se coucher', translation: 'to go to bed', category: 'daily', kind: 'vocab' },
  { word: 'le petit-déjeuner', translation: 'breakfast', category: 'daily', kind: 'vocab' },
  { word: 'le déjeuner', translation: 'lunch', category: 'daily', kind: 'vocab' },
  { word: 'le dîner', translation: 'dinner', category: 'daily', kind: 'vocab' },
  { word: 'la chambre', translation: 'the room', category: 'travel', kind: 'vocab' },
  { word: 'réserver', translation: 'to reserve', category: 'travel', kind: 'vocab' },
  { word: 'le passeport', translation: 'the passport', category: 'travel', kind: 'vocab' },
  { word: 'la douane', translation: 'customs', category: 'travel', kind: 'vocab' },
  { word: 'une application', translation: 'an app', category: 'coding', kind: 'vocab' },
  { word: 'le serveur', translation: 'the server', category: 'coding', kind: 'vocab' },
  { word: 'un algorithme', translation: 'an algorithm', category: 'coding', kind: 'vocab' },
  { word: 'déboguer', translation: 'to debug', category: 'coding', kind: 'vocab' },
  { word: 'le réseau', translation: 'the network', category: 'coding', kind: 'vocab' },
  { word: "l'interface", translation: 'the interface', category: 'coding', kind: 'vocab' },
  { word: 'la recherche', translation: 'research', category: 'academic', kind: 'vocab' },
  { word: 'un cours', translation: 'a class', category: 'academic', kind: 'vocab' },
  { word: 'le diplôme', translation: 'the degree', category: 'academic', kind: 'vocab' },
  { word: 'la note', translation: 'the grade', category: 'academic', kind: 'vocab' },
  { word: 'le stage', translation: 'the internship', category: 'work', kind: 'vocab' },
  { word: 'le patron', translation: 'the boss', category: 'work', kind: 'vocab' },
  { word: 'la pause', translation: 'the break', category: 'work', kind: 'vocab' },
  { word: 'un entretien', translation: 'an interview', category: 'work', kind: 'vocab' },
  { word: 'content', translation: 'happy', category: 'social', kind: 'vocab' },
  { word: 'triste', translation: 'sad', category: 'social', kind: 'vocab' },
  { word: 'fatigué', translation: 'tired', category: 'daily', kind: 'vocab' },
];

function generateTestNeurons(count: number): { neurons: Neuron[]; synapses: Synapse[] } {
  const shuffled = [...FRENCH_VOCAB].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, Math.min(count, shuffled.length));
  const neurons: Neuron[] = selected.map((v, i) => ({
    id: `test-${i}-${v.word.replace(/\s/g, '_')}`,
    label: v.word,
    type: 'soma' as const,
    nodeKind: v.kind,
    potential: 0.5 + Math.random() * 0.5,
    strength: 0.15 + Math.random() * 0.85,
    usageCount: 1 + Math.floor(Math.random() * 8),
    category: v.category,
    grammarDna: '',
    isNew: i < 5,
    lastReviewed: Date.now() - Math.floor(Math.random() * 600000),
  }));
  // Generate meaningful links
  const synapses: Synapse[] = [];
  const linkKinds: ('semantic' | 'conjugation' | 'prerequisite' | 'reactivation')[] = ['semantic', 'conjugation', 'prerequisite', 'reactivation'];
  // Same-category links
  const byCategory: Record<string, Neuron[]> = {};
  neurons.forEach(n => { (byCategory[n.category] ||= []).push(n); });
  Object.values(byCategory).forEach(group => {
    for (let i = 0; i < group.length - 1 && i < 4; i++) {
      synapses.push({
        source: group[i].id,
        target: group[i + 1].id,
        strength: 0.3 + Math.random() * 0.7,
        linkKind: linkKinds[Math.floor(Math.random() * linkKinds.length)],
        isNew: i < 2,
      });
    }
  });
  // Cross-category links (sparse)
  for (let i = 0; i < Math.min(count / 4, 12); i++) {
    const a = neurons[Math.floor(Math.random() * neurons.length)];
    const b = neurons[Math.floor(Math.random() * neurons.length)];
    if (a.id !== b.id && !synapses.some(s => s.source === a.id && s.target === b.id)) {
      synapses.push({
        source: a.id,
        target: b.id,
        strength: 0.2 + Math.random() * 0.5,
        linkKind: 'semantic',
      });
    }
  }
  return { neurons, synapses };
}

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
      animate={{ scale: [1, 1.05, 1] }}
      transition={{ duration: 4.8, repeat: Infinity, ease: 'easeInOut' }}
      className="relative w-10 h-10 rounded-full"
      style={{
        background: 'radial-gradient(circle, #000 28%, #001a66 42%, #0040dd 56%, #1a6aff 70%, #2060e0 85%, #1848b0 100%)',
        boxShadow: '0 0 18px 4px rgba(30,80,240,0.45), 0 0 40px 8px rgba(20,60,200,0.2)',
      }}
    />
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

  // Gamification + mission state (loaded from localStorage)
  const savedState = useMemo(() => loadDailyState(), []);
  const [xp, setXp] = useState(0);
  const [cefrLevel, setCefrLevel] = useState('A0');
  const [streak, setStreak] = useState(0);
  const [qualityStreak, setQualityStreak] = useState(0);
  const [combo, setCombo] = useState(0);
  const [dailyMinutes, setDailyMinutes] = useState(savedState.dailyMinutes);
  const [missionIndex, setMissionIndex] = useState(savedState.missionIndex);
  const [missionDone, setMissionDone] = useState<Record<string, boolean>>(savedState.missionDone);
  const [missionsCompletedToday, setMissionsCompletedToday] = useState(savedState.missionsCompletedToday);
  const [missionExpanded, setMissionExpanded] = useState(false);
  const [lastLatency, setLastLatency] = useState<{ stt: number; llm: number; total: number } | null>(null);

  // Onboarding + mascot overlay
  const [showOnboarding, setShowOnboarding] = useState(!savedState.onboarded);
  const [onboardingStep, setOnboardingStep] = useState(1);
  const [mascotOverlay, setMascotOverlay] = useState<{ type: MascotOverlayProps['type']; data?: any } | null>(
    !savedState.onboarded ? { type: 'onboarding' } : null
  );
  const [canvasFailed, setCanvasFailed] = useState(false);
  const [canvasResetKey, setCanvasResetKey] = useState(0);
  const [linkInspector, setLinkInspector] = useState<{ reason: string; detail: string; evidence: string[] } | null>(null);
  const [showTestGen, setShowTestGen] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [testGenCount, setTestGenCount] = useState(40);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const completedMissionRef = useRef<number | null>(null);
  const lastAiTextRef = useRef('');
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const ttsFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ttsPlaybackSettledRef = useRef(false);

  const fadingTargets = useMemo(
    () =>
      state.neurons
        .filter((n) => n.strength >= 0.18 && n.strength < 0.58)
        .sort((a, b) => a.strength - b.strength)
        .slice(0, 3)
        .map((n) => n.label),
    [state.neurons]
  );

  // Dynamic daily missions from missions.ts
  const missionDeck = useMemo(
    () => getDailyMissions(dailyMinutes, fadingTargets),
    [dailyMinutes, fadingTargets]
  );

  const activeMission = missionDeck[missionIndex % missionDeck.length] as MissionWithTasks | undefined;
  const activeMissionSafe = activeMission || { id: 'none', title: 'Free conversation', objective: 'Just talk!', humor: '', reward: 0, tasks: [], keywords: [] };

  // Show mission intro overlay when mission changes (but not on first load if onboarding is showing)
  const prevMissionIdRef = useRef(activeMissionSafe.id);
  useEffect(() => {
    if (activeMissionSafe.id !== prevMissionIdRef.current && !showOnboarding) {
      prevMissionIdRef.current = activeMissionSafe.id;
      setMascotOverlay({ type: 'mission_intro', data: activeMissionSafe });
    }
  }, [activeMissionSafe.id, showOnboarding]);

  const playTtsPayload = useCallback((tts: any) => {
    if (!tts) return;
    if (ttsPlaybackSettledRef.current) return;

    const fallbackText = tts?.text || lastAiTextRef.current;
    const markSpoken = () => {
      ttsPlaybackSettledRef.current = true;
      if (ttsFallbackTimerRef.current) {
        clearTimeout(ttsFallbackTimerRef.current);
        ttsFallbackTimerRef.current = null;
      }
    };

    const speakBrowser = (text: string) => {
      if (!text || !('speechSynthesis' in window)) return;
      try {
        markSpoken();
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'fr-FR';
        utterance.rate = 1.02;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        const voices = window.speechSynthesis.getVoices();
        const frenchVoice =
          voices.find((v) => (v.lang || '').toLowerCase().startsWith('fr')) ||
          voices.find((v) => (v.lang || '').toLowerCase().includes('fr'));
        if (frenchVoice) utterance.voice = frenchVoice;
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
        const rawMime = (tts.content_type || 'audio/mpeg').toLowerCase();
        const mime = rawMime.includes('mp3') ? 'audio/mpeg' : rawMime;
        const audio = new Audio(`data:${mime};base64,${tts.audio_base64}`);
        audio.preload = 'auto';
        audio.volume = 1;
        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
        }
        audio.onplay = () => markSpoken();
        audio.onerror = () => speakBrowser(fallbackText);
        activeAudioRef.current = audio;
        const playPromise = audio.play();
        if (playPromise && typeof playPromise.then === 'function') {
          playPromise.then(() => markSpoken()).catch(() => speakBrowser(fallbackText));
        } else {
          markSpoken();
        }
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
      if (ttsFallbackTimerRef.current) {
        clearTimeout(ttsFallbackTimerRef.current);
        ttsFallbackTimerRef.current = null;
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

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

  // Clear justUsed flags after 4 seconds
  useEffect(() => {
    const hasJustUsed = state.neurons.some(n => n.justUsed);
    if (hasJustUsed) {
      const timer = setTimeout(() => {
        setState(prev => ({
          ...prev,
          neurons: prev.neurons.map(n => ({ ...n, justUsed: false })),
        }));
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [state.neurons]);

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
  };

  const missionTasks = useMemo(() => (
    activeMissionSafe.tasks.map((t) => ({ ...t, done: !!missionDone[t.id] }))
  ), [activeMissionSafe, missionDone]);

  const missionDoneCount = useMemo(
    () => missionTasks.filter((t) => t.done).length,
    [missionTasks]
  );

  const missionProgressPct = useMemo(
    () => Math.round((missionDoneCount / Math.max(1, missionTasks.length)) * 100),
    [missionDoneCount, missionTasks.length]
  );

  // Dynamic categories from actual neuron data
  const dynamicCategories = useMemo(() => {
    const cats = new Set<Category>();
    state.neurons.forEach(n => cats.add(n.category));
    const ordered = DEFAULT_CATEGORIES.filter(c => c === 'all' || cats.has(c as Category));
    // Add 'all' if not present
    if (!ordered.includes('all')) ordered.unshift('all');
    return ordered.length > 1 ? ordered : DEFAULT_CATEGORIES;
  }, [state.neurons]);

  // Test data generator
  const handleGenerateTestData = useCallback(() => {
    const { neurons, synapses } = generateTestNeurons(testGenCount);
    setState(prev => ({
      ...prev,
      neurons: [...prev.neurons, ...neurons],
      synapses: [...prev.synapses, ...synapses],
    }));
    setShowTestGen(false);
  }, [testGenCount]);

  useEffect(() => {
    if (missionTasks.length === 0) return;
    if (missionDoneCount < missionTasks.length) return;
    if (completedMissionRef.current === missionIndex) return;

    completedMissionRef.current = missionIndex;
    const reward = activeMissionSafe.reward;
    setXp((prev) => prev + reward);

    // Show mission complete overlay
    setMascotOverlay({ type: 'mission_complete', data: { title: activeMissionSafe.title } });

    const nextCompleted = missionsCompletedToday + 1;
    setMissionsCompletedToday(nextCompleted);

    // Delay mission advance until after the overlay auto-dismisses (3s)
    const totalDaily = missionDeck.length;
    setTimeout(() => {
      const nextIdx = (missionIndex + 1) % missionDeck.length;
      setMissionIndex(nextIdx);
      setMissionDone({});
      saveMissionProgress(nextIdx, {}, nextCompleted);

      if (nextCompleted >= totalDaily) {
        setTimeout(() => setMascotOverlay({ type: 'daily_done' }), 500);
      } else {
        setMascotOverlay({ type: 'mission_intro', data: missionDeck[nextIdx] });
      }
    }, 3200);
  }, [missionDoneCount, missionTasks.length, missionIndex, activeMissionSafe, missionDeck.length, missionsCompletedToday]);

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
    ttsPlaybackSettledRef.current = false;
    triggerShootingStar();

    // Expose mission context for backend AI to use
    (window as any).__echeMissionContext = {
      title: activeMissionSafe.title,
      objective: activeMissionSafe.objective,
      starter: activeMissionSafe.objective,
      tasks: missionTasks.map(t => ({ label: t.label, done: t.done })),
      done_count: missionDoneCount,
      total: missionTasks.length,
    };

    try {
      let newState = await analyzeInput(input, state, isFlying, inputType);
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

      // Mark existing nodes as justUsed if the learner said them again
      const msgs = newState.messages;
      const lastAi = [...msgs].reverse().find(m => m.role === 'ai' && !m.id.startsWith('nav-'));
      const lastUser = [...msgs].reverse().find(m => m.role === 'user');
      const justUsedWords = new Set(
        (lastAi?.analysis?.acceptedUnits || []).map((u: string) => u.toLowerCase())
      );
      if (justUsedWords.size > 0) {
        newState = {
          ...newState,
          neurons: newState.neurons.map(n => ({
            ...n,
            justUsed: !n.isNew && justUsedWords.has(n.label.toLowerCase()),
          })),
        };
      }

      setState(newState);
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
        setCefrLevel(lastAi.analysis.level);
      }

      const analysis = lastAi?.analysis || null;
      const userText = lastUser?.text || '';
      setMissionDone((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const task of activeMissionSafe.tasks) {
          if (!next[task.id] && evalTask(task.id, activeMissionSafe, analysis?.acceptedUnits || [], userText, quality, fadingTargets)) {
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

  const handleReplayVoice = useCallback(() => {
    if (!lastAiText || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(lastAiText);
    utterance.lang = 'fr-FR';
    utterance.rate = 1.02;
    window.speechSynthesis.speak(utterance);
  }, [lastAiText]);

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
    setMascotOverlay(null);
    setLastLatency(null);
    setLinkInspector(null);
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
    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/15 border border-blue-400/20 text-blue-300 text-[10px] uppercase tracking-widest font-bold">
      <WifiOff size={10} />
      <span>Demo Mode</span>
    </div>
  ) : connectionStatus === 'connected' ? (
    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/15 border border-blue-400/20 text-blue-300 text-[10px] uppercase tracking-widest font-bold">
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
  const liveMissionObjective = (lastAnalysis?.missionHint || activeMissionSafe.objective || '')
    .replace(/^Mission\s+[A-C][12](?:[+-])?\s*(?:[-–:])\s*/i, '')
    .trim();

  return (
    <div className="relative w-full h-screen overflow-hidden text-white font-sans bg-[#020510]">
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
        <div className="absolute inset-0 pointer-events-none opacity-15 mix-blend-screen" style={{ backgroundImage: 'radial-gradient(rgba(100,140,255,0.08) 0.5px, transparent 0.5px), radial-gradient(rgba(80,120,200,0.05) 0.4px, transparent 0.4px)', backgroundSize: '3px 3px, 6px 6px', backgroundPosition: '0 0, 1px 2px' }} />
        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="relative">
          <div className="flex flex-col gap-3 pointer-events-none items-start max-h-[calc(100vh-10rem)] overflow-y-auto overflow-x-hidden scrollbar-hide">
            {/* Mission panel */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 }}
              className="pointer-events-auto self-start ml-6 relative overflow-hidden bg-white/[0.07] backdrop-blur-xl border border-white/[0.14] p-5 rounded-[28px] w-[500px] max-w-[calc(100vw-3rem)] shadow-[0_16px_50px_rgba(0,0,0,0.35)]"
            >
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/35 font-semibold mb-1">
                Mission {Math.min(missionsCompletedToday + 1, missionDeck.length)}/{missionDeck.length} today — {dailyMinutes} min
              </div>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <motion.p
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-[32px] text-white leading-[1.06] mt-1 font-semibold"
                  >
                    {activeMissionSafe.title}
                  </motion.p>
                  <p className="text-[16px] text-white/60 mt-1">{liveMissionObjective}</p>
                </div>
                <div className="px-3 py-1.5 rounded-full bg-blue-500/15 border border-blue-400/25 text-base font-mono text-blue-300">
                  {missionDoneCount}/{missionTasks.length}
                </div>
              </div>

              <div className="mb-4">
                <div className="w-full h-2.5 rounded-full bg-white/[0.10] border border-white/[0.12] overflow-hidden">
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
                className="w-full mt-1 text-left text-sm text-blue-300/80 hover:text-blue-200 transition-colors"
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
                              ? 'bg-blue-500/15 border-blue-400/30 text-blue-200'
                              : 'bg-white/[0.06] border-white/[0.10] text-white/70 hover:bg-white/[0.10]'
                          }`}
                        >
                          {checked ? <CheckCircle2 size={17} className="text-blue-400 flex-shrink-0" /> : <Circle size={17} className="text-white/30 flex-shrink-0" />}
                          <span className="text-[16px] leading-snug">{task.label}</span>
                        </div>
                      );
                    })}
                  </div>

                </>
              )}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="pointer-events-auto self-start ml-6 bg-white/[0.07] backdrop-blur-xl border border-white/[0.14] rounded-2xl w-[240px] shadow-[0_8px_24px_rgba(0,0,0,0.30)] overflow-hidden"
            >
              <button
                onClick={() => setShowFilter(v => !v)}
                className="w-full flex items-center justify-between p-4 text-left hover:bg-white/[0.04] transition-colors"
              >
                <span className="text-[10px] uppercase tracking-[0.18em] text-white/45 font-semibold">Worlds</span>
                <ChevronDown size={14} className={`text-white/30 transition-transform ${showFilter ? 'rotate-180' : ''}`} />
              </button>
              <AnimatePresence>
                {showFilter && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="flex flex-col gap-2.5 px-4 pb-4">
                      {dynamicCategories.map((cat) => {
                        const active = filterCategory === cat;
                        const count = cat === 'all' ? state.neurons.length : state.neurons.filter(n => n.category === cat).length;
                        return (
                          <button
                            key={cat}
                            onClick={() => setFilterCategory(cat)}
                            className={`px-4 py-3 rounded-xl border text-sm font-medium tracking-wide transition-all text-left flex items-center justify-between ${
                              active
                                ? 'bg-blue-500/25 text-white border-blue-400/40 shadow-[0_0_14px_rgba(59,130,246,0.25)]'
                                : 'bg-white/[0.05] text-white/55 border-white/[0.08] hover:bg-white/[0.12] hover:text-white/80'
                            }`}
                          >
                            <span className="capitalize">{cat === 'all' ? 'All' : cat}</span>
                            {count > 0 && (
                              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md ${active ? 'bg-white/15 text-white/80' : 'bg-white/[0.06] text-white/35'}`}>
                                {count}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
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
                  className="bg-white/[0.08] backdrop-blur-xl border border-white/[0.14] rounded-full py-2 pl-10 pr-10 text-sm focus:outline-none focus:border-blue-400/40 transition-all w-64 text-white placeholder:text-white/35"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsFlying(!isFlying)}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-all ${
                    isFlying
                      ? 'bg-blue-600 border-blue-600 text-white shadow-[0_0_20px_rgba(59,130,246,0.5)]'
                      : 'bg-white/[0.08] border-white/[0.14] text-white/50 hover:bg-white/[0.14] hover:text-white/70'
                  }`}
                  title="Navigation"
                >
                  <Plane size={18} className={isFlying ? 'animate-bounce' : ''} />
                </button>
                <button
                  onClick={() => setShowChat(!showChat)}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-all ${
                    showChat
                      ? 'bg-blue-500/20 border-blue-400/30 text-blue-200'
                      : 'bg-white/[0.08] border-white/[0.14] text-white/50 hover:bg-white/[0.14] hover:text-white/70'
                  }`}
                  title="Chat"
                >
                  <MessageSquare size={16} />
                </button>
                <button
                  onClick={handleRecenter}
                  className="w-10 h-10 rounded-xl flex items-center justify-center border transition-all bg-white/[0.08] border-white/[0.14] text-white/50 hover:bg-white/[0.14] hover:text-white/70"
                  title="Recenter"
                >
                  <LocateFixed size={16} />
                </button>
                <button
                  onClick={() => setShowDashboard(true)}
                  className="w-10 h-10 rounded-xl flex items-center justify-center border transition-all bg-white/[0.08] border-white/[0.14] text-white/50 hover:bg-amber-500/20 hover:border-amber-400/30 hover:text-amber-300"
                  title="Dashboard"
                >
                  <BarChart2 size={16} />
                </button>
                <button
                  onClick={handleReset}
                  className="w-10 h-10 rounded-xl flex items-center justify-center border transition-all bg-white/[0.08] border-white/[0.14] text-white/50 hover:bg-red-500/20 hover:border-red-400/30 hover:text-red-300"
                  title="Hard Reset"
                >
                  <Trash2 size={16} />
                </button>
                <div className="relative">
                  <button
                    onClick={() => setShowTestGen(v => !v)}
                    className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-all ${
                      showTestGen
                        ? 'bg-purple-500/25 border-purple-400/40 text-purple-300 shadow-[0_0_14px_rgba(168,85,247,0.3)]'
                        : 'bg-white/[0.08] border-white/[0.14] text-white/50 hover:bg-white/[0.14] hover:text-white/70'
                    }`}
                    title="Test Data Generator"
                  >
                    <FlaskConical size={18} />
                  </button>
                  <AnimatePresence>
                    {showTestGen && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: -10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: -10 }}
                        className="absolute right-0 top-12 w-[300px] bg-black/70 backdrop-blur-2xl border border-white/[0.12] rounded-2xl p-5 shadow-[0_16px_50px_rgba(0,0,0,0.5)] z-50"
                      >
                        <div className="flex items-center gap-2 mb-3">
                          <FlaskConical size={16} className="text-purple-400" />
                          <span className="text-sm font-bold uppercase tracking-wider text-white/90">Test Data Generator</span>
                        </div>
                        <p className="text-xs text-white/40 mb-4">
                          Generate realistic French neurons across multiple categories.
                        </p>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] uppercase tracking-widest text-white/50 font-bold">Neuron Count</span>
                          <span className="text-sm font-mono font-bold text-purple-300">{testGenCount}</span>
                        </div>
                        <input
                          type="range"
                          min={5}
                          max={100}
                          value={testGenCount}
                          onChange={e => setTestGenCount(Number(e.target.value))}
                          className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer mb-2 accent-purple-500"
                        />
                        <div className="flex justify-between text-[10px] text-white/30 mb-3">
                          <span>5</span>
                          <span>100 (max)</span>
                        </div>
                        <div className="flex gap-2 mb-4">
                          {[10, 20, 50, 100].map(n => (
                            <button
                              key={n}
                              onClick={() => setTestGenCount(n)}
                              className={`flex-1 py-1.5 rounded-lg border text-xs font-bold transition-all ${
                                testGenCount === n
                                  ? 'bg-purple-500/20 border-purple-400/30 text-purple-300'
                                  : 'bg-white/[0.05] border-white/[0.08] text-white/40 hover:bg-white/[0.10]'
                              }`}
                            >
                              {n}
                            </button>
                          ))}
                        </div>
                        <button
                          onClick={handleGenerateTestData}
                          className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-sm uppercase tracking-wider transition-all shadow-[0_0_20px_rgba(168,85,247,0.3)] hover:shadow-[0_0_30px_rgba(168,85,247,0.5)]"
                        >
                          <span className="flex items-center justify-center gap-2">
                            <Sparkles size={14} />
                            Generate Nebula
                          </span>
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Logo (bottom-left) ────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute bottom-6 left-12 pointer-events-auto flex items-center gap-3 bg-white/[0.05] backdrop-blur-xl border border-white/[0.10] px-4 py-3 rounded-2xl shadow-[0_8px_24px_rgba(0,0,0,0.30)]"
        >
          <BlueRingLogo />
          <div>
            <h1 className="text-base font-bold tracking-tight text-white">Echo</h1>
            <p className="text-[9px] uppercase tracking-[0.2em] text-white/40 font-medium">Neural Language Lab</p>
          </div>
        </motion.div>

        {/* ── Central Voice HUD (bottom center) ─────────────────────── */}
        <div className="flex justify-center items-end pointer-events-auto max-h-[60vh] overflow-hidden">
          <div className="flex flex-col items-center gap-3 max-w-xl w-full">

            {/* Transcript area */}
            <AnimatePresence>
              {hudVisible && (lastUserText || lastAiText) && (
                <motion.div
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                  className="w-full bg-white/[0.07] backdrop-blur-xl border border-white/[0.14] rounded-2xl p-4 shadow-[0_18px_38px_rgba(0,0,0,0.35)] max-h-[35vh] overflow-y-auto"
                >
                  {/* User text */}
                  {lastUserText && (
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-6 h-6 rounded-md bg-blue-500/15 border border-blue-400/25 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <User size={12} className="text-blue-300" />
                      </div>
                      <div className="text-[17px] text-white/90 leading-snug">
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
                      <div className="text-[14px] text-white/70 italic">
                        <span className="text-[11px] uppercase tracking-widest font-bold mr-2 text-amber-400/80">Correction</span>
                        <AnimatedText text={lastCorrection} delay={0.15} className="text-amber-200/90" />
                      </div>
                    </motion.div>
                  )}

                  {/* AI response */}
                  {lastAiText && (
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-6 h-6 rounded-md bg-blue-500/10 border border-blue-400/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Bot size={12} className="text-blue-300" />
                      </div>
                      <div className="text-[17px] text-white/80 leading-snug">
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
                      className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-white/[0.12]"
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
                                className="text-[12px] px-2.5 py-1 rounded-full border bg-blue-500/15 border-blue-400/25 text-blue-200"
                              >
                                {unit}
                              </span>
                            ))}
                            {allUnits.length > shown.length && (
                              <span className="text-[12px] px-2.5 py-1 rounded-full border bg-white/[0.08] border-white/[0.14] text-white/60">
                                +{allUnits.length - shown.length}
                              </span>
                            )}
                          </>
                        );
                      })()}
                      {lastAnalysis.level && (
                        <span className="text-[11px] px-2.5 py-1 rounded-full bg-blue-500/15 border border-blue-400/25 text-blue-300 font-mono font-bold ml-auto">
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
                      className="text-[13px] text-white/50 italic mt-2 pt-2 border-t border-white/[0.10]"
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
                className="flex-1 bg-white/[0.08] backdrop-blur-xl border border-white/[0.14] rounded-full px-4 py-2.5 text-sm text-white placeholder:text-white/35 focus:outline-none focus:border-blue-400/40 transition-all disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={isLoading || !textInput.trim() || demoComplete}
                className="px-3.5 py-2.5 bg-white/[0.08] border border-white/[0.14] rounded-full text-white/70 hover:bg-white/[0.16] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Send size={16} />
              </button>
              <button
                type="button"
                onClick={handleReplayVoice}
                disabled={!lastAiText}
                className="px-3.5 py-2.5 bg-white/[0.08] border border-white/[0.14] rounded-full text-white/70 hover:bg-white/[0.16] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                title="Replay agent voice"
              >
                <Volume2 size={16} />
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
      {/* ── Mascot Overlay (onboarding, mission intro, celebrations) ── */}
      {mascotOverlay && (
        <MascotOverlay
          type={mascotOverlay.type}
          data={mascotOverlay.data}
          onboardingStep={onboardingStep}
          onSelectMinutes={(m: number) => {
            setDailyMinutes(m);
            setOnboardingStep(3);
            setMascotOverlay({ type: 'onboarding', data: { minutes: m } });
          }}
          onDismiss={() => {
            if (mascotOverlay.type === 'onboarding') {
              if (onboardingStep < 3) {
                setOnboardingStep((s) => s + 1);
                setMascotOverlay({ type: 'onboarding' });
              } else {
                // Onboarding complete
                saveOnboarding(dailyMinutes);
                setShowOnboarding(false);
                setMascotOverlay({ type: 'mission_intro', data: activeMissionSafe });
              }
            } else {
              setMascotOverlay(null);
            }
          }}
        />
      )}

      {/* ── Dashboard ──────────────────────────────────────────────── */}
      <Dashboard isOpen={showDashboard} onClose={() => setShowDashboard(false)} />

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
                  <div className="flex flex-col gap-3">
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

                {/* Category */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Category</span>
                  <span className="text-sm text-blue-400 capitalize">{selectedNeuron.category}</span>
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
