// ── missions.ts ─────────────────────────────────────────────────────────────
// Mission system, daily selector, task evaluator, and MascotOverlay for Echo.
// Drop-in replacement for the hardcoded missionDeck in App.tsx.
// ---------------------------------------------------------------------------

import * as React from 'react';
import { useEffect, useRef } from 'react';
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

// ── MISSION_POOL (15 missions) ─────────────────────────────────────────────

export const MISSION_POOL: MissionDef[] = [
  // -- Identity --
  {
    id: 'id_name',
    title: 'Who Even Are You?',
    objective: 'Introduce yourself: name, age, or nationality.',
    humor: 'Existential crisis, but make it French.',
    mainTask: 'Say your name or introduce yourself.',
    keywords: ["je m'appelle", 'je suis', 'mon nom', 'appelle'],
  },
  {
    id: 'id_origin',
    title: 'Citizen of Somewhere',
    objective: 'Say where you are from or where you live.',
    humor: 'Geography class, oui oui edition.',
    mainTask: 'Say where you live or where you are from.',
    keywords: ["j'habite", 'je viens de', 'je vis', 'en france', 'a paris', 'habite'],
  },

  // -- Food --
  {
    id: 'food_like',
    title: 'Foodie Confessions',
    objective: 'Talk about a food you love and why.',
    humor: 'Cheese is always the right answer.',
    mainTask: 'Mention a food you like.',
    keywords: [
      "j'aime", 'je mange', 'fromage', 'pain', 'pizza', 'poulet',
      'salade', 'chocolat', 'croissant', 'pates', 'riz', 'sushi',
      'burger', 'fruit', 'poisson', 'viande', 'gateau',
    ],
  },
  {
    id: 'food_order',
    title: 'Waiter, S\'il Vous Plait!',
    objective: 'Order something at a restaurant or cafe.',
    humor: 'One baguette to rule them all.',
    mainTask: 'Order food or a drink.',
    keywords: [
      'je voudrais', "s'il vous plait", 'la carte', 'commander',
      'un cafe', 'un verre', "l'addition", 'manger', 'boire',
    ],
  },

  // -- Daily Life --
  {
    id: 'daily_morning',
    title: 'Rise & Grind (en francais)',
    objective: 'Describe your morning routine.',
    humor: 'Snooze button not available in French.',
    mainTask: 'Describe a morning activity.',
    keywords: [
      'se lever', 'petit-dejeuner', 'matin', 'douche', 'reveil',
      'cafe', 'lever', 'habiller', 'brosser',
    ],
  },
  {
    id: 'daily_today',
    title: 'Today in Review',
    objective: 'Describe what you did today using past tense.',
    humor: 'Living in the past, linguistically.',
    mainTask: 'Use a time anchor (today, this morning, tonight).',
    keywords: [
      "aujourd'hui", 'aujourdhui', 'ce matin', 'ce soir',
      'cet apres', 'cette nuit', 'hier',
    ],
    detailKeywords: ['puis', 'ensuite', 'apres', 'et puis', 'then'],
  },

  // -- People --
  {
    id: 'people_family',
    title: 'Family Tree Speedrun',
    objective: 'Talk about a family member.',
    humor: 'Thanksgiving dinner, French edition.',
    mainTask: 'Mention a family member.',
    keywords: [
      'famille', 'mere', 'pere', 'frere', 'soeur', 'maman',
      'papa', 'cousin', 'oncle', 'tante', 'grand', 'enfant',
      'fils', 'fille', 'parents',
    ],
  },
  {
    id: 'people_friend',
    title: 'BFF Material',
    objective: 'Describe a friend — what they look like or what you do together.',
    humor: 'Friendship is magic. So is verb conjugation.',
    mainTask: 'Talk about a friend.',
    keywords: [
      'ami', 'amie', 'copain', 'copine', 'ensemble', 'meilleur',
      'connais', 'rencontre',
    ],
  },

  // -- Places --
  {
    id: 'places_city',
    title: 'City Slicker',
    objective: 'Describe a city or place you know.',
    humor: 'Tour guide energy activated.',
    mainTask: 'Name or describe a city or place.',
    keywords: [
      'ville', 'paris', 'lyon', 'quartier', 'rue', 'batiment',
      'centre', 'place', 'parc', 'jardin', 'musee', 'monument',
    ],
  },
  {
    id: 'places_travel',
    title: 'Passport Stamp Collector',
    objective: 'Talk about a trip you took or want to take.',
    humor: 'Turbulence expected in grammar zone.',
    mainTask: 'Talk about traveling somewhere.',
    keywords: [
      'voyage', 'voyager', 'avion', 'train', 'hotel', 'vacances',
      'visiter', 'billet', 'passeport', 'valise', 'gare', 'aeroport',
    ],
  },

  // -- Hobbies --
  {
    id: 'hobby_sport',
    title: 'Sweat in Two Languages',
    objective: 'Talk about a sport or physical activity you enjoy.',
    humor: 'Leg day, but for your vocabulary.',
    mainTask: 'Mention a sport or exercise.',
    keywords: [
      'sport', 'jouer', 'football', 'nager', 'courir', 'tennis',
      'velo', 'marcher', 'gymnastique', 'equipe', 'match', 'faire du sport',
    ],
  },
  {
    id: 'hobby_music',
    title: 'Main Character Playlist',
    objective: 'Talk about music you like or an instrument you play.',
    humor: 'Auto-tune won\'t help your accent.',
    mainTask: 'Talk about music or an instrument.',
    keywords: [
      'musique', 'chanson', 'chanter', 'guitare', 'piano', 'ecouter',
      'concert', 'artiste', 'groupe', 'jouer',
    ],
  },

  // -- Deeper Topics --
  {
    id: 'deep_dream',
    title: 'Dream Big (en francais)',
    objective: 'Talk about a dream, goal, or ambition.',
    humor: 'Manifesting in the subjunctive mood.',
    mainTask: 'Describe a dream or goal.',
    keywords: [
      'reve', 'rever', 'vouloir', 'je veux', 'esperer', 'objectif',
      'avenir', 'futur', 'devenir', 'souhaite', 'aimerais',
    ],
  },
  {
    id: 'deep_opinion',
    title: 'Hot Take Central',
    objective: 'Give your opinion on something — agree or disagree.',
    humor: 'Controversy is great for vocabulary retention.',
    mainTask: 'Express an opinion.',
    keywords: [
      'je pense', 'je crois', 'a mon avis', 'selon moi', 'important',
      'interessant', "d'accord", 'pas d\'accord', 'opinion', 'prefere',
    ],
  },
  {
    id: 'deep_weather',
    title: 'Small Talk Champion',
    objective: 'Talk about the weather or seasons.',
    humor: 'Peak adult conversation unlocked.',
    mainTask: 'Describe the weather or a season.',
    keywords: [
      'temps', 'il fait', 'soleil', 'pluie', 'neige', 'chaud', 'froid',
      'beau', 'nuage', 'vent', 'printemps', 'ete', 'automne', 'hiver',
      'il pleut', 'il neige',
    ],
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
): MissionWithTasks[] {
  const count = Math.max(1, Math.floor(dailyMinutes / 5));

  // Deterministic shuffle by today's date
  const rand = mulberry32(dateSeed());
  const pool = [...MISSION_POOL];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const selected = pool.slice(0, Math.min(count, pool.length));

  return selected.map((def, idx) => {
    const fadingWord = fadingTargets[idx % Math.max(1, fadingTargets.length)] || '';
    const reuseLabel = fadingWord
      ? `Reuse this fading word: "${fadingWord}".`
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
        { id: `${def.id}_detail`, label: 'Add a detail or reason.' },
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

  // Main task: check mission keywords
  if (taskId.endsWith('_main')) {
    return containsAny(mission.keywords);
  }

  // Detail task: quality OR enough accepted units
  if (taskId.endsWith('_detail')) {
    return acceptedUnits.length >= 2 || qualityScore >= 0.65;
  }

  // Reuse task: check if any fading target appears
  if (taskId.endsWith('_reuse')) {
    if (fadingTargets.length === 0) {
      // No fading targets yet; pass if any accepted unit
      return acceptedUnits.length >= 1;
    }
    return fadingTargets.some((t) => containsTarget(t));
  }

  return false;
}

// ── MascotOverlay ──────────────────────────────────────────────────────────

export interface MascotOverlayProps {
  type: 'onboarding' | 'mission_intro' | 'mission_complete' | 'daily_done' | 'level_up';
  data?: any;
  onDismiss: () => void;
  onboardingStep?: number;
  onSelectMinutes?: (minutes: number) => void;
}

// We build the component with React.createElement to avoid needing JSX in a .ts file.
const h = React.createElement;

function EchoLogo(props: { size?: 'sm' | 'lg' }) {
  const sz = props.size === 'lg' ? 'w-20 h-20' : 'w-10 h-10';
  return h(
    motion.div,
    {
      animate: { scale: [1, 1.06, 1] },
      transition: { duration: 4.8, repeat: Infinity, ease: 'easeInOut' },
      className: `relative ${sz} rounded-full mx-auto`,
      style: {
        background:
          'radial-gradient(circle, #000 28%, #001a66 42%, #0040dd 56%, #1a6aff 70%, #2060e0 85%, #1848b0 100%)',
        boxShadow:
          '0 0 18px 4px rgba(30,80,240,0.45), 0 0 40px 8px rgba(20,60,200,0.2)',
      },
    },
    null,
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
  sessionDate: 'echo_session_date',
  missionsCompleted: 'echo_missions_completed',
  missionDone: 'echo_mission_done',
  missionIndex: 'echo_mission_index',
} as const;

export function loadDailyState() {
  const today = new Date().toISOString().slice(0, 10);
  const onboarded = localStorage.getItem(STORAGE.onboarded) === 'true';
  const dailyMinutes = parseInt(localStorage.getItem(STORAGE.dailyMinutes) || '15', 10);
  const savedDate = localStorage.getItem(STORAGE.sessionDate) || '';
  const isNewDay = savedDate !== today;

  if (isNewDay) {
    localStorage.setItem(STORAGE.sessionDate, today);
    localStorage.setItem(STORAGE.missionsCompleted, '0');
    localStorage.setItem(STORAGE.missionDone, '{}');
    localStorage.setItem(STORAGE.missionIndex, '0');
    return { onboarded, dailyMinutes, missionsCompletedToday: 0, missionDone: {} as Record<string, boolean>, missionIndex: 0, isNewDay: true };
  }

  return {
    onboarded,
    dailyMinutes,
    missionsCompletedToday: parseInt(localStorage.getItem(STORAGE.missionsCompleted) || '0', 10),
    missionDone: JSON.parse(localStorage.getItem(STORAGE.missionDone) || '{}') as Record<string, boolean>,
    missionIndex: parseInt(localStorage.getItem(STORAGE.missionIndex) || '0', 10),
    isNewDay: false,
  };
}

export function saveOnboarding(dailyMinutes: number) {
  localStorage.setItem(STORAGE.onboarded, 'true');
  localStorage.setItem(STORAGE.dailyMinutes, String(dailyMinutes));
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
  const { type, data, onDismiss, onboardingStep, onSelectMinutes } = props;
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
          "I'll help you learn French \u2014 just by talking.",
        ),
        h(PillButton, { label: 'Continue', onClick: onDismiss, accent: true }),
      );
    } else if (onboardingStep === 2) {
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
    } else if (onboardingStep === 3) {
      const mins = data?.minutes ?? 10;
      const n = Math.max(1, Math.floor(mins / 5));
      content = h(
        'div',
        { className: 'flex flex-col items-center gap-6' },
        h(EchoLogo, { size: 'lg' }),
        h(
          'h1',
          { className: 'text-2xl font-bold text-white text-center mt-4' },
          `Perfect! ${mins} minutes = ${n} mission${n > 1 ? 's' : ''} per day.`,
        ),
        h(
          'p',
          { className: 'text-base text-white/50 text-center' },
          "Let's go!",
        ),
        h(PillButton, { label: 'Start', onClick: onDismiss, accent: true }),
      );
    }
  } else if (type === 'mission_intro') {
    content = h(
      'div',
      { className: 'flex flex-col items-center gap-5' },
      h(EchoLogo, { size: 'lg' }),
      h(
        'h1',
        { className: 'text-3xl font-bold text-white text-center mt-4' },
        data?.title ?? 'New Mission',
      ),
      h(
        'p',
        { className: 'text-base text-white/50 italic text-center max-w-md' },
        data?.humor ?? '',
      ),
      h(
        'p',
        { className: 'text-lg text-white/70 text-center max-w-md mt-1' },
        data?.objective ?? '',
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
          'fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-2xl cursor-pointer',
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
