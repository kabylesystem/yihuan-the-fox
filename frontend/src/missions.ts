// ── missions.ts ─────────────────────────────────────────────────────────────
// Mission system, daily selector, task evaluator, and MascotOverlay for Echo.
// Drop-in replacement for the hardcoded missionDeck in App.tsx.
// ---------------------------------------------------------------------------

import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

// ── Types ──────────────────────────────────────────────────────────────────

export interface MissionDef {
  id: string;
  title: string;       // witty / funny title
  objective: string;   // what to talk about
  humor: string;       // funny subtitle for mascot overlay
  mainTask: string;    // primary task label
  keywords: string[];  // words that indicate main-task completion
  detailKeywords?: string[];  // extra keywords for the "add detail" task
}

export interface MissionWithTasks {
  id: string;
  title: string;
  objective: string;
  humor: string;
  reward: number;
  tasks: { id: string; label: string }[];
  keywords: string[];
}

export type LearnerLevel = 'starter' | 'intermediate' | 'advanced';

export const LEARNER_LEVEL_LABEL: Record<LearnerLevel, string> = {
  starter: 'Beginner (A0-A1)',
  intermediate: 'Developing (A2-B1)',
  advanced: 'Independent (B2+)',
};

// ── Supported languages ─────────────────────────────────────────────────────

export interface SupportedLanguage {
  code: string;       // ISO 639-1 (sent to backend)
  name: string;       // English name
  native: string;     // Name in the language itself
  flag: string;       // Emoji flag
  greeting: string;   // Example greeting
}

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  { code: 'fr', name: 'French', native: 'Français', flag: '🇫🇷', greeting: 'Bonjour' },
  { code: 'es', name: 'Spanish', native: 'Español', flag: '🇪🇸', greeting: 'Hola' },
  { code: 'de', name: 'German', native: 'Deutsch', flag: '🇩🇪', greeting: 'Hallo' },
  { code: 'it', name: 'Italian', native: 'Italiano', flag: '🇮🇹', greeting: 'Ciao' },
  { code: 'pt', name: 'Portuguese', native: 'Português', flag: '🇵🇹', greeting: 'Olá' },
  { code: 'ja', name: 'Japanese', native: '日本語', flag: '🇯🇵', greeting: 'こんにちは' },
  { code: 'ko', name: 'Korean', native: '한국어', flag: '🇰🇷', greeting: '안녕하세요' },
  { code: 'zh', name: 'Chinese', native: '中文', flag: '🇨🇳', greeting: '你好' },
  { code: 'ar', name: 'Arabic', native: 'العربية', flag: '🇸🇦', greeting: 'مرحبا' },
  { code: 'ru', name: 'Russian', native: 'Русский', flag: '🇷🇺', greeting: 'Привет' },
  { code: 'nl', name: 'Dutch', native: 'Nederlands', flag: '🇳🇱', greeting: 'Hallo' },
  { code: 'tr', name: 'Turkish', native: 'Türkçe', flag: '🇹🇷', greeting: 'Merhaba' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी', flag: '🇮🇳', greeting: 'नमस्ते' },
  { code: 'sv', name: 'Swedish', native: 'Svenska', flag: '🇸🇪', greeting: 'Hej' },
  { code: 'pl', name: 'Polish', native: 'Polski', flag: '🇵🇱', greeting: 'Cześć' },
];

// ── MISSION_POOL (15 language-agnostic missions) ──────────────────────────
// Keywords removed — mission completion is evaluated by accepted vocabulary
// units from the AI, not by matching hardcoded words in any specific language.

export const MISSION_POOL: MissionDef[] = [
  // -- Identity --
  {
    id: 'id_name',
    title: 'Who Even Are You?',
    objective: 'Introduce yourself: name, age, or nationality.',
    humor: 'Existential crisis, but make it linguistic.',
    mainTask: 'Say your name or introduce yourself.',
    keywords: [],
  },
  {
    id: 'id_origin',
    title: 'Citizen of Somewhere',
    objective: 'Say where you are from or where you live.',
    humor: 'Geography class, multilingual edition.',
    mainTask: 'Say where you live or where you are from.',
    keywords: [],
  },

  // -- Food --
  {
    id: 'food_like',
    title: 'Foodie Confessions',
    objective: 'Talk about a food you love and why.',
    humor: 'Food is the universal language.',
    mainTask: 'Mention a food you like.',
    keywords: [],
  },
  {
    id: 'food_order',
    title: 'Table for One, Please!',
    objective: 'Order something at a restaurant or cafe.',
    humor: 'Menu decoding: activated.',
    mainTask: 'Order food or a drink.',
    keywords: [],
  },

  // -- Daily Life --
  {
    id: 'daily_morning',
    title: 'Rise & Grind',
    objective: 'Describe your morning routine.',
    humor: 'Snooze button not available in your target language.',
    mainTask: 'Describe a morning activity.',
    keywords: [],
  },
  {
    id: 'daily_today',
    title: 'Today in Review',
    objective: 'Describe what you did today using past tense.',
    humor: 'Living in the past, linguistically.',
    mainTask: 'Use a time anchor (today, this morning, tonight).',
    keywords: [],
    detailKeywords: [],
  },

  // -- People --
  {
    id: 'people_family',
    title: 'Family Tree Speedrun',
    objective: 'Talk about a family member.',
    humor: 'Holiday dinner, multilingual edition.',
    mainTask: 'Mention a family member.',
    keywords: [],
  },
  {
    id: 'people_friend',
    title: 'BFF Material',
    objective: 'Describe a friend — what they look like or what you do together.',
    humor: 'Friendship is magic. So is verb conjugation.',
    mainTask: 'Talk about a friend.',
    keywords: [],
  },

  // -- Places --
  {
    id: 'places_city',
    title: 'City Slicker',
    objective: 'Describe a city or place you know.',
    humor: 'Tour guide energy activated.',
    mainTask: 'Name or describe a city or place.',
    keywords: [],
  },
  {
    id: 'places_travel',
    title: 'Passport Stamp Collector',
    objective: 'Talk about a trip you took or want to take.',
    humor: 'Turbulence expected in grammar zone.',
    mainTask: 'Talk about traveling somewhere.',
    keywords: [],
  },

  // -- Hobbies --
  {
    id: 'hobby_sport',
    title: 'Sweat in Two Languages',
    objective: 'Talk about a sport or physical activity you enjoy.',
    humor: 'Leg day, but for your vocabulary.',
    mainTask: 'Mention a sport or exercise.',
    keywords: [],
  },
  {
    id: 'hobby_music',
    title: 'Main Character Playlist',
    objective: 'Talk about music you like or an instrument you play.',
    humor: 'Auto-tune won\'t help your accent.',
    mainTask: 'Talk about music or an instrument.',
    keywords: [],
  },

  // -- Deeper Topics --
  {
    id: 'deep_dream',
    title: 'Dream Big',
    objective: 'Talk about a dream, goal, or ambition.',
    humor: 'Manifesting in a new language.',
    mainTask: 'Describe a dream or goal.',
    keywords: [],
  },
  {
    id: 'deep_opinion',
    title: 'Hot Take Central',
    objective: 'Give your opinion on something — agree or disagree.',
    humor: 'Controversy is great for vocabulary retention.',
    mainTask: 'Express an opinion.',
    keywords: [],
  },
  {
    id: 'deep_weather',
    title: 'Small Talk Champion',
    objective: 'Talk about the weather or seasons.',
    humor: 'Peak adult conversation unlocked.',
    mainTask: 'Describe the weather or a season.',
    keywords: [],
  },
];

// ── Deterministic daily seed ───────────────────────────────────────────────

function dateSeed(): number {
  const d = new Date();
  // Combine year, month, day into a single integer seed.
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

/** Simple deterministic PRNG (mulberry32). */
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── getDailyMissions ───────────────────────────────────────────────────────

export function getDailyMissions(
  dailyMinutes: number,
  fadingTargets: string[],
  learnerLevel: LearnerLevel = 'intermediate',
): MissionWithTasks[] {
  const count = Math.max(1, Math.floor(dailyMinutes / 5));

  const starterMissionIds = new Set([
    'id_name',
    'id_origin',
    'food_like',
    'food_order',
    'daily_morning',
    'daily_today',
    'people_family',
    'people_friend',
    'places_city',
    'deep_weather',
  ]);

  const sourcePool = learnerLevel === 'starter'
    ? MISSION_POOL.filter((def) => starterMissionIds.has(def.id))
    : MISSION_POOL;

  // Deterministic shuffle by today's date
  const rand = mulberry32(dateSeed());
  const pool = [...sourcePool];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const selected = pool.slice(0, Math.min(count, pool.length));

  return selected.map((def, idx) => {
    const detailLabel =
      learnerLevel === 'starter'
        ? 'Add one short detail.'
        : learnerLevel === 'advanced'
          ? 'Add two details and connect them.'
          : 'Add a detail or reason.';

    const fadingWord = fadingTargets[idx % Math.max(1, fadingTargets.length)] || '';
    const reuseLabel = fadingWord
      ? learnerLevel === 'advanced'
        ? `Reuse this fading word and add an example: "${fadingWord}".`
        : learnerLevel === 'starter'
          ? `Reuse this fading word once: "${fadingWord}".`
          : `Reuse this fading word: "${fadingWord}".`
      : learnerLevel === 'advanced'
        ? 'Reuse one old word and expand with an example.'
        : 'Reuse one word you learned before.';

    return {
      id: def.id,
      title: def.title,
      objective: def.objective,
      humor: def.humor,
      reward: 40 + idx * 5,
      keywords: def.keywords,
      tasks: [
        { id: `${def.id}_main`, label: def.mainTask },
        { id: `${def.id}_detail`, label: detailLabel },
        { id: `${def.id}_reuse`, label: reuseLabel },
      ],
    };
  });
}

// ── evaluateMissionTask ────────────────────────────────────────────────────

export function evaluateMissionTask(
  taskId: string,
  mission: MissionWithTasks,
  acceptedUnits: string[],
  userText: string,
  qualityScore: number,
  fadingTargets: string[],
  learnerLevel: LearnerLevel = 'intermediate',
): boolean {
  const lower = (userText || '').toLowerCase();
  const acceptedLower = acceptedUnits.map((u) => u.toLowerCase());

  const containsAny = (words: string[]): boolean =>
    words.some((w) => lower.includes(w.toLowerCase()));

  const containsTarget = (target: string): boolean => {
    const t = target.toLowerCase();
    return (
      acceptedLower.some((u) => u.includes(t) || t.includes(u)) ||
      lower.includes(t)
    );
  };

  // Main task: pass if we got enough accepted vocabulary units on-topic
  // (language-agnostic — the AI validates vocabulary server-side)
  if (taskId.endsWith('_main')) {
    if (mission.keywords.length > 0) {
      return containsAny(mission.keywords);
    }
    // Require meaningful vocabulary output — not just 1 word
    const unitThreshold = learnerLevel === 'starter' ? 2 : learnerLevel === 'advanced' ? 4 : 3;
    return acceptedUnits.length >= unitThreshold && qualityScore >= 0.5;
  }

  // Detail task: quality AND enough accepted units (harder than main)
  if (taskId.endsWith('_detail')) {
    const unitThreshold = learnerLevel === 'starter' ? 2 : learnerLevel === 'advanced' ? 4 : 3;
    const qualityThreshold = learnerLevel === 'starter' ? 0.60 : learnerLevel === 'advanced' ? 0.75 : 0.65;
    return acceptedUnits.length >= unitThreshold && qualityScore >= qualityThreshold;
  }

  // Reuse task: check if any fading target appears
  if (taskId.endsWith('_reuse')) {
    if (fadingTargets.length === 0) {
      // No fading targets yet; pass if enough accepted units (not just 1)
      return acceptedUnits.length >= 2 && qualityScore >= 0.55;
    }
    const reused = fadingTargets.some((t) => containsTarget(t));
    if (!reused) return false;
    if (learnerLevel === 'advanced') {
      return acceptedUnits.length >= 2 || qualityScore >= 0.7;
    }
    return true;
  }

  return false;
}

// ── MascotOverlay ──────────────────────────────────────────────────────────

export interface MascotOverlayProps {
  type: 'onboarding' | 'mission_intro' | 'mission_complete' | 'daily_done' | 'level_up' | 'memory_fade';
  data?: any;
  onDismiss: () => void;
  onboardingStep?: number;
  selectedMinutes?: number;
  selectedLevel?: LearnerLevel;
  selectedLanguage?: string;
  onSelectMinutes?: (minutes: number) => void;
  onSelectLevel?: (level: LearnerLevel) => void;
  onSelectLanguage?: (code: string) => void;
}

// We build the component with React.createElement to avoid needing JSX in a .ts file.
const h = React.createElement;

function EchoLogo(props: { size?: 'sm' | 'lg' }) {
  const isLarge = props.size !== 'sm';
  const sz = isLarge ? 'w-20 h-20' : 'w-10 h-10';
  const armLength = isLarge ? 26 : 14;
  const armOffset = isLarge ? 15 : 8;
  const legLength = isLarge ? 18 : 10;
  const legOffset = isLarge ? 10 : 5;
  const lineThickness = isLarge ? 3 : 2;
  const eyeOpen = isLarge ? 8 : 4;
  const eyeClosed = isLarge ? 4 : 2;
  const eyeHeightOpen = isLarge ? 8 : 4;
  const eyeHeightClosed = isLarge ? 2 : 1;
  const mouthWidth = isLarge ? 18 : 10;
  const mouthHeight = isLarge ? 8 : 4;
  const lineColor = 'rgba(156, 211, 255, 0.95)';
  const glowColor = '0 0 10px rgba(82, 191, 255, 0.55)';
  const [poseIndex, setPoseIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setPoseIndex((prev) => (prev + 1) % 3);
    }, 2800);
    return () => clearInterval(timer);
  }, []);

  const poses = [
    {
      leftArm: -18,
      rightArm: 18,
      leftLeg: 10,
      rightLeg: -10,
      leftEyeClosed: false,
      rightEyeClosed: false,
      mouth: 'smile' as const,
    },
    {
      leftArm: -58,
      rightArm: 30,
      leftLeg: 4,
      rightLeg: -16,
      leftEyeClosed: true,
      rightEyeClosed: false,
      mouth: 'smile' as const,
    },
    {
      leftArm: -80,
      rightArm: 80,
      leftLeg: 16,
      rightLeg: -16,
      leftEyeClosed: false,
      rightEyeClosed: false,
      mouth: 'surprised' as const,
    },
  ];
  const pose = poses[poseIndex];

  return h(
    motion.div,
    {
      animate: { scale: [1, 1.06, 1], y: [0, -2, 0] },
      transition: { duration: 4.8, repeat: Infinity, ease: 'easeInOut' },
      className: `relative ${sz} rounded-full mx-auto flex items-center justify-center`,
      style: {
        background:
          'radial-gradient(circle, #000 28%, #001a66 42%, #0040dd 56%, #1a6aff 70%, #2060e0 85%, #1848b0 100%)',
        boxShadow:
          '0 0 18px 4px rgba(30,80,240,0.45), 0 0 40px 8px rgba(20,60,200,0.2)',
      },
    },
    h(
      React.Fragment,
      null,
      h(motion.div, {
        className: 'absolute rounded-full',
        style: {
          left: `-${armOffset}px`,
          top: '52%',
          width: `${armLength}px`,
          height: `${lineThickness}px`,
          background: lineColor,
          boxShadow: glowColor,
          transformOrigin: '100% 50%',
        },
        animate: { rotate: pose.leftArm },
        transition: { duration: 0.45, ease: 'easeOut' },
      }),
      h(motion.div, {
        className: 'absolute rounded-full',
        style: {
          right: `-${armOffset}px`,
          top: '52%',
          width: `${armLength}px`,
          height: `${lineThickness}px`,
          background: lineColor,
          boxShadow: glowColor,
          transformOrigin: '0% 50%',
        },
        animate: { rotate: pose.rightArm },
        transition: { duration: 0.45, ease: 'easeOut' },
      }),
      h(motion.div, {
        className: 'absolute rounded-full',
        style: {
          left: '36%',
          bottom: `-${legOffset}px`,
          width: `${legLength}px`,
          height: `${lineThickness}px`,
          background: lineColor,
          boxShadow: glowColor,
          transformOrigin: '50% 0%',
        },
        animate: { rotate: pose.leftLeg },
        transition: { duration: 0.45, ease: 'easeOut' },
      }),
      h(motion.div, {
        className: 'absolute rounded-full',
        style: {
          right: '36%',
          bottom: `-${legOffset}px`,
          width: `${legLength}px`,
          height: `${lineThickness}px`,
          background: lineColor,
          boxShadow: glowColor,
          transformOrigin: '50% 0%',
        },
        animate: { rotate: pose.rightLeg },
        transition: { duration: 0.45, ease: 'easeOut' },
      }),
      h(
        'div',
        {
          className: 'absolute inset-0 pointer-events-none flex flex-col items-center justify-center',
          style: { gap: isLarge ? '7px' : '4px' },
        },
        h(
          'div',
          { className: 'flex items-center justify-center', style: { gap: isLarge ? '10px' : '5px' } },
          h(motion.div, {
            className: 'rounded-full',
            style: { background: lineColor, boxShadow: glowColor },
            animate: {
              width: pose.leftEyeClosed ? eyeClosed : eyeOpen,
              height: pose.leftEyeClosed ? eyeHeightClosed : eyeHeightOpen,
            },
            transition: { duration: 0.35, ease: 'easeOut' },
          }),
          h(motion.div, {
            className: 'rounded-full',
            style: { background: lineColor, boxShadow: glowColor },
            animate: {
              width: pose.rightEyeClosed ? eyeClosed : eyeOpen,
              height: pose.rightEyeClosed ? eyeHeightClosed : eyeHeightOpen,
            },
            transition: { duration: 0.35, ease: 'easeOut' },
          }),
        ),
        pose.mouth === 'surprised'
          ? h(motion.div, {
            className: 'rounded-full border',
            style: { borderColor: lineColor, boxShadow: glowColor },
            animate: { width: mouthHeight, height: mouthHeight },
            transition: { duration: 0.35, ease: 'easeOut' },
          })
          : h(motion.div, {
            className: 'border-b rounded-b-full',
            style: {
              borderBottomColor: lineColor,
              borderBottomWidth: isLarge ? 2 : 1.5,
            },
            animate: { width: mouthWidth, height: mouthHeight },
            transition: { duration: 0.35, ease: 'easeOut' },
          }),
      ),
    ),
  );
}

function PillButton(props: {
  label: string;
  onClick: () => void;
  accent?: boolean;
  small?: boolean;
}) {
  const base =
    'rounded-full font-semibold tracking-wide transition-all active:scale-95';
  const size = props.small
    ? 'px-5 py-2 text-sm'
    : 'px-8 py-3 text-base';
  const colors = props.accent
    ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_24px_rgba(59,130,246,0.4)]'
    : 'bg-white/10 hover:bg-white/20 text-white border border-white/20';

  return h(
    'button',
    { className: `${base} ${size} ${colors}`, onClick: props.onClick },
    props.label,
  );
}

// ── localStorage persistence ──────────────────────────────────────────────

const STORAGE = {
  onboarded: 'echo_onboarding',
  dailyMinutes: 'echo_daily_minutes',
  learnerLevel: 'echo_learner_level',
  language: 'echo_language',
  sessionDate: 'echo_session_date',
  missionsCompleted: 'echo_missions_completed',
  missionDone: 'echo_mission_done',
  missionIndex: 'echo_mission_index',
} as const;

export function loadDailyState() {
  const today = new Date().toISOString().slice(0, 10);
  const onboarded = localStorage.getItem(STORAGE.onboarded) === 'true';
  const dailyMinutes = parseInt(localStorage.getItem(STORAGE.dailyMinutes) || '15', 10);
  const storedLevel = localStorage.getItem(STORAGE.learnerLevel);
  const learnerLevel: LearnerLevel =
    storedLevel === 'starter' || storedLevel === 'intermediate' || storedLevel === 'advanced'
      ? storedLevel
      : 'intermediate';
  const language = localStorage.getItem(STORAGE.language) || 'fr';
  const savedDate = localStorage.getItem(STORAGE.sessionDate) || '';
  const isNewDay = savedDate !== today;

  if (isNewDay) {
    localStorage.setItem(STORAGE.sessionDate, today);
    localStorage.setItem(STORAGE.missionsCompleted, '0');
    localStorage.setItem(STORAGE.missionDone, '{}');
    localStorage.setItem(STORAGE.missionIndex, '0');
    return { onboarded, dailyMinutes, learnerLevel, language, missionsCompletedToday: 0, missionDone: {} as Record<string, boolean>, missionIndex: 0, isNewDay: true };
  }

  return {
    onboarded,
    dailyMinutes,
    learnerLevel,
    language,
    missionsCompletedToday: parseInt(localStorage.getItem(STORAGE.missionsCompleted) || '0', 10),
    missionDone: JSON.parse(localStorage.getItem(STORAGE.missionDone) || '{}') as Record<string, boolean>,
    missionIndex: parseInt(localStorage.getItem(STORAGE.missionIndex) || '0', 10),
    isNewDay: false,
  };
}

export function saveOnboarding(dailyMinutes: number, learnerLevel: LearnerLevel, language: string = 'fr') {
  localStorage.setItem(STORAGE.onboarded, 'true');
  localStorage.setItem(STORAGE.dailyMinutes, String(dailyMinutes));
  localStorage.setItem(STORAGE.learnerLevel, learnerLevel);
  localStorage.setItem(STORAGE.language, language);
  localStorage.setItem(STORAGE.sessionDate, new Date().toISOString().slice(0, 10));
  localStorage.setItem(STORAGE.missionsCompleted, '0');
}

export function saveMissionProgress(missionIndex: number, missionDone: Record<string, boolean>, missionsCompleted: number) {
  localStorage.setItem(STORAGE.missionIndex, String(missionIndex));
  localStorage.setItem(STORAGE.missionDone, JSON.stringify(missionDone));
  localStorage.setItem(STORAGE.missionsCompleted, String(missionsCompleted));
}

// ── MascotOverlay Component ───────────────────────────────────────────────

export function MascotOverlay(props: MascotOverlayProps) {
  const { type, data, onDismiss, onboardingStep, selectedMinutes, selectedLevel, selectedLanguage, onSelectMinutes, onSelectLevel, onSelectLanguage } = props;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Stable ref for onDismiss so the auto-dismiss timer doesn't reset on every parent re-render
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  // Auto-dismiss celebrations
  const autoDismiss = type === 'mission_complete' || type === 'daily_done' || type === 'level_up';
  useEffect(() => {
    if (autoDismiss) {
      timerRef.current = setTimeout(() => onDismissRef.current(), 3000);
      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
      };
    }
  }, [autoDismiss]);

  // Content builder per type
  let content: React.ReactNode;

  if (type === 'onboarding') {
    if (onboardingStep === 1) {
      content = h(
        'div',
        { className: 'flex flex-col items-center gap-6' },
        h(EchoLogo, { size: 'lg' }),
        h(
          'h1',
          { className: 'text-3xl font-bold text-white text-center mt-4' },
          "Hey! I'm Echo.",
        ),
        h(
          'p',
          { className: 'text-lg text-white/60 text-center max-w-sm' },
          "I'll help you learn any language \u2014 just by talking.",
        ),
        h(PillButton, { label: 'Continue', onClick: onDismiss, accent: true }),
      );
    } else if (onboardingStep === 2) {
      // Language selection step
      content = h(
        'div',
        { className: 'flex flex-col items-center gap-6' },
        h(EchoLogo, { size: 'lg' }),
        h(
          'h1',
          { className: 'text-2xl font-bold text-white text-center mt-4' },
          'What do you want to learn?',
        ),
        h(
          'p',
          { className: 'text-base text-white/50 text-center' },
          'Pick your target language.',
        ),
        h(
          'div',
          { className: 'w-full grid grid-cols-3 gap-2.5 mt-2 max-h-[320px] overflow-y-auto pr-1' },
          ...SUPPORTED_LANGUAGES.map((lang) =>
            h(
              'button',
              {
                key: lang.code,
                onClick: () => onSelectLanguage?.(lang.code),
                className:
                  'flex flex-col items-center gap-1 rounded-2xl border border-white/15 bg-white/5 hover:bg-white/10 px-2 py-3 transition-all',
              },
              h('span', { className: 'text-2xl' }, lang.flag),
              h('span', { className: 'text-xs font-semibold text-white' }, lang.native),
            ),
          ),
        ),
      );
    } else if (onboardingStep === 3) {
      const minutes = [5, 10, 15, 20, 30];
      content = h(
        'div',
        { className: 'flex flex-col items-center gap-6' },
        h(EchoLogo, { size: 'lg' }),
        h(
          'h1',
          { className: 'text-2xl font-bold text-white text-center mt-4' },
          'How much time per day?',
        ),
        h(
          'p',
          { className: 'text-base text-white/50 text-center' },
          'Pick what feels comfortable. You can change it later.',
        ),
        h(
          'div',
          { className: 'flex flex-wrap justify-center gap-3 mt-2' },
          ...minutes.map((m) =>
            h(PillButton, {
              key: m,
              label: `${m} min`,
              small: true,
              onClick: () => onSelectMinutes?.(m),
            }),
          ),
        ),
      );
    } else if (onboardingStep === 4) {
      const levels: Array<{ value: LearnerLevel; title: string; hint: string }> = [
        { value: 'starter', title: 'Beginner (A0-A1)', hint: 'Simple words and short sentences.' },
        { value: 'intermediate', title: 'Developing (A2-B1)', hint: 'Everyday topics with clear details.' },
        { value: 'advanced', title: 'Independent (B2+)', hint: 'Longer answers, examples, and nuance.' },
      ];

      content = h(
        'div',
        { className: 'flex flex-col items-center gap-6' },
        h(EchoLogo, { size: 'lg' }),
        h(
          'h1',
          { className: 'text-2xl font-bold text-white text-center mt-4' },
          'What is your current level?',
        ),
        h(
          'p',
          { className: 'text-base text-white/50 text-center max-w-md' },
          'We will tune daily mission difficulty to this level.',
        ),
        h(
          'div',
          { className: 'w-full flex flex-col gap-3 mt-1' },
          ...levels.map((level) =>
            h(
              'button',
              {
                key: level.value,
                onClick: () => onSelectLevel?.(level.value),
                className:
                  'w-full text-left rounded-2xl border border-white/15 bg-white/5 hover:bg-white/10 px-4 py-3 transition-all',
              },
              h('p', { className: 'text-white font-semibold text-sm' }, level.title),
              h('p', { className: 'text-white/55 text-xs mt-1' }, level.hint),
            ),
          ),
        ),
      );
    } else if (onboardingStep === 5) {
      const mins = selectedMinutes ?? data?.minutes ?? 10;
      const level: LearnerLevel = selectedLevel ?? data?.level ?? 'intermediate';
      const langCode = selectedLanguage ?? data?.language ?? 'fr';
      const langObj = SUPPORTED_LANGUAGES.find(l => l.code === langCode);
      const n = Math.max(1, Math.floor(mins / 5));
      content = h(
        'div',
        { className: 'flex flex-col items-center gap-6' },
        h(EchoLogo, { size: 'lg' }),
        h(
          'h1',
          { className: 'text-2xl font-bold text-white text-center mt-4' },
          `${langObj?.greeting ?? 'Hello'}!`,
        ),
        h(
          'p',
          { className: 'text-base text-white/50 text-center max-w-md' },
          `${langObj?.flag ?? ''} ${langObj?.name ?? langCode} \u2022 ${mins} min/day \u2022 ${LEARNER_LEVEL_LABEL[level]}`,
        ),
        h(PillButton, { label: "Let's go!", onClick: onDismiss, accent: true }),
      );
    }
  } else if (type === 'mission_intro') {
    content = h(
      'div',
      { className: 'flex flex-col items-center gap-5' },
      h(EchoLogo, { size: 'lg' }),
      h(
        'p',
        { className: 'text-2xl text-blue-200/90 text-center font-semibold tracking-wide mt-2' },
        'Your first mission:',
      ),
      h(
        'h1',
        { className: 'text-3xl font-bold text-white text-center mt-1' },
        data?.title ?? 'New Mission',
      ),
      h(
        'p',
        { className: 'text-base text-blue-300 text-center max-w-md font-medium' },
        'Speak boldly, one sentence at a time, and watch your nebula light up ✨',
      ),
      h(PillButton, { label: "Let's go", onClick: onDismiss, accent: true }),
    );
  } else if (type === 'mission_complete') {
    content = h(
      'div',
      { className: 'flex flex-col items-center gap-5' },
      h(EchoLogo, { size: 'lg' }),
      h(
        'h1',
        { className: 'text-3xl font-bold text-white text-center mt-4' },
        'Mission Complete!',
      ),
      h(
        'p',
        { className: 'text-lg text-white/60 text-center' },
        data?.title ?? '',
      ),
    );
  } else if (type === 'daily_done') {
    content = h(
      'div',
      { className: 'flex flex-col items-center gap-5' },
      h(EchoLogo, { size: 'lg' }),
      h(
        'h1',
        { className: 'text-2xl font-bold text-white text-center mt-4' },
        'Daily goal complete!',
      ),
      h(
        'p',
        { className: 'text-base text-white/50 text-center' },
        'See you tomorrow.',
      ),
    );
  } else if (type === 'level_up') {
    content = h(
      'div',
      { className: 'flex flex-col items-center gap-5' },
      h(EchoLogo, { size: 'lg' }),
      h(
        'h1',
        { className: 'text-3xl font-bold text-white text-center mt-4' },
        'Level Up!',
      ),
      h(
        'p',
        { className: 'text-xl text-blue-300 font-mono text-center' },
        data?.old && data?.new ? `${data.old} \u2192 ${data.new}` : '',
      ),
    );
  } else if (type === 'memory_fade') {
    content = h(
      'div',
      { className: 'flex flex-col items-center gap-5' },
      h(EchoLogo, { size: 'lg' }),
      h(
        'h1',
        { className: 'text-3xl font-bold text-white text-center mt-4' },
        'Memories Fade',
      ),
      h(
        'p',
        { className: 'text-base text-white/60 text-center max-w-sm leading-relaxed' },
        'Words you practice glow brighter. Words you neglect slowly dim.',
      ),
      h(
        'p',
        { className: 'text-sm text-white/40 text-center max-w-sm' },
        'Your AI tutor will naturally bring fading words back into conversation.',
      ),
      h(
        'button',
        {
          className: 'mt-4 px-8 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm uppercase tracking-wider transition-all',
          onClick: onDismiss,
        },
        'Got it',
      ),
    );
  }

  return h(
    AnimatePresence,
    null,
    h(
      motion.div,
      {
        key: `mascot-${type}-${onboardingStep ?? ''}`,
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0.35 },
        className:
          `fixed inset-0 z-[200] flex items-center justify-center cursor-pointer ${type === 'onboarding' ? 'bg-black' : 'bg-black/60 backdrop-blur-2xl'}`,
        onClick: autoDismiss ? onDismiss : undefined,
      },
      h(
        motion.div,
        {
          initial: { opacity: 0, y: 30, scale: 0.92 },
          animate: { opacity: 1, y: 0, scale: 1 },
          exit: { opacity: 0, y: 20, scale: 0.95 },
          transition: { type: 'spring', damping: 22, stiffness: 260 },
          className: 'relative max-w-lg w-full mx-6 px-8 py-10',
          // Only block clicks on content for non-auto-dismiss overlays (onboarding, mission_intro)
          onClick: autoDismiss ? onDismiss : (e: React.MouseEvent) => e.stopPropagation(),
        },
        content,
      ),
    ),
  );
}
