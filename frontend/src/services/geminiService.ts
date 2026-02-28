/**
 * Unified language analysis service for Echo Neural Language Lab.
 *
 * Attempts to use the FastAPI backend first (WebSocket conversation pipeline).
 * Falls back to client-side mock data when no backend is available.
 *
 * The mock data follows the same French learning i+1 progression as the backend.
 */

import { NebulaState, Category } from '../types';
import * as backend from './backendService';

// ── TTS Audio Playback ──────────────────────────────────────────────────

function playTTS(tts: { mode: string; audio_base64?: string; text?: string; content_type?: string }) {
  if (tts.mode === 'audio' && tts.audio_base64) {
    try {
      const audioData = atob(tts.audio_base64);
      const bytes = new Uint8Array(audioData.length);
      for (let i = 0; i < audioData.length; i++) bytes[i] = audioData.charCodeAt(i);
      const blob = new Blob([bytes], { type: tts.content_type || 'audio/mp3' });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      audio.play().catch((err) => {
        console.warn('Audio playback failed, falling back to browser TTS:', err);
        if (tts.text) speakWithBrowser(tts.text);
      });
    } catch (err) {
      console.warn('Audio decode failed:', err);
      if (tts.text) speakWithBrowser(tts.text);
    }
  } else if (tts.mode === 'browser' && tts.text) {
    speakWithBrowser(tts.text);
  }
}

function speakWithBrowser(text: string) {
  if ('speechSynthesis' in window) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'fr-FR';
    utterance.rate = 1.1;
    window.speechSynthesis.speak(utterance);
  }
}

// ── Mock data (French learning, matches backend mock_data.py) ────────────

const MOCK_TURNS = [
  {
    turn_number: 1,
    user_said: 'Bonjour',
    response: {
      spoken_response: "Bonjour ! Comment tu t'appelles ?",
      translation_hint: 'Hello! What is your name?',
      vocabulary_breakdown: [
        { word: 'comment', translation: 'how/what', part_of_speech: 'adverb' },
        { word: 'tu', translation: 'you (informal)', part_of_speech: 'pronoun' },
        { word: "t'appelles", translation: 'are called', part_of_speech: "verb (s'appeler)" },
      ],
      new_elements: ['comment', "tu t'appelles"],
      reactivated_elements: ['bonjour'],
      user_level_assessment: 'A1',
      border_update: 'You can greet someone. Next: introduce yourself by name.',
    },
  },
  {
    turn_number: 2,
    user_said: "Je m'appelle Marie",
    response: {
      spoken_response: 'Enchanté, Marie ! Tu habites où ?',
      translation_hint: 'Nice to meet you, Marie! Where do you live?',
      vocabulary_breakdown: [
        { word: 'enchanté', translation: 'nice to meet you', part_of_speech: 'adjective' },
        { word: 'habites', translation: 'live', part_of_speech: 'verb (habiter)' },
        { word: 'où', translation: 'where', part_of_speech: 'adverb' },
      ],
      new_elements: ['enchanté', 'tu habites', 'où'],
      reactivated_elements: ["tu t'appelles", 'bonjour'],
      user_level_assessment: 'A1',
      border_update: 'You can introduce yourself. Next: talk about where you live.',
    },
  },
  {
    turn_number: 3,
    user_said: "J'habite à Paris",
    response: {
      spoken_response: "Ah, Paris ! C'est une belle ville. Tu aimes Paris ?",
      translation_hint: "Ah, Paris! It's a beautiful city. Do you like Paris?",
      vocabulary_breakdown: [
        { word: "c'est", translation: 'it is', part_of_speech: 'pronoun + verb' },
        { word: 'belle', translation: 'beautiful', part_of_speech: 'adjective' },
        { word: 'ville', translation: 'city', part_of_speech: 'noun' },
        { word: 'aimes', translation: 'like/love', part_of_speech: 'verb (aimer)' },
      ],
      new_elements: ["c'est", 'belle', 'ville', 'tu aimes'],
      reactivated_elements: ['tu habites', 'où'],
      user_level_assessment: 'A1+',
      border_update: 'You can say where you live. Next: express preferences and opinions.',
    },
  },
  {
    turn_number: 4,
    user_said: "Oui, j'aime beaucoup Paris",
    response: {
      spoken_response: "Moi aussi ! Qu'est-ce que tu aimes faire à Paris ?",
      translation_hint: 'Me too! What do you like to do in Paris?',
      vocabulary_breakdown: [
        { word: 'moi aussi', translation: 'me too', part_of_speech: 'pronoun + adverb' },
        { word: "qu'est-ce que", translation: 'what (question form)', part_of_speech: 'interrogative' },
        { word: 'faire', translation: 'to do', part_of_speech: 'verb (infinitive)' },
      ],
      new_elements: ["qu'est-ce que", 'faire'],
      reactivated_elements: ['tu aimes', "j'habite", 'bonjour'],
      user_level_assessment: 'A1+',
      border_update: 'You can express what you like. Next: describe activities and hobbies.',
    },
  },
  {
    turn_number: 5,
    user_said: "J'aime visiter les musées et manger des croissants",
    response: {
      spoken_response: 'Excellent ! Tu parles déjà très bien. Les musées de Paris sont magnifiques !',
      translation_hint: 'Excellent! You already speak very well. The museums of Paris are magnificent!',
      vocabulary_breakdown: [
        { word: 'parles', translation: 'speak', part_of_speech: 'verb (parler)' },
        { word: 'déjà', translation: 'already', part_of_speech: 'adverb' },
        { word: 'très bien', translation: 'very well', part_of_speech: 'adverb' },
        { word: 'magnifiques', translation: 'magnificent', part_of_speech: 'adjective' },
      ],
      new_elements: ['tu parles', 'déjà', 'magnifiques'],
      reactivated_elements: ['tu aimes', 'faire', 'belle', 'ville'],
      user_level_assessment: 'A2',
      border_update: "You can describe activities and preferences with detail. You've reached A2!",
    },
  },
];

// Graph data matching backend mock_data.py
const MOCK_GRAPH_NODES = [
  { id: 'bonjour', label: 'bonjour', type: 'vocab', mastery: 1.0, level: 'A1', turn_introduced: 1 },
  { id: 'comment', label: 'comment', type: 'vocab', mastery: 0.5, level: 'A1', turn_introduced: 1 },
  { id: 'tu_tappelles', label: "tu t'appelles", type: 'sentence', mastery: 0.85, level: 'A1', turn_introduced: 1 },
  { id: 'je_mappelle', label: "je m'appelle", type: 'sentence', mastery: 0.9, level: 'A1', turn_introduced: 2 },
  { id: 'enchante', label: 'enchanté', type: 'vocab', mastery: 0.3, level: 'A1', turn_introduced: 2 },
  { id: 'tu_habites', label: 'tu habites', type: 'sentence', mastery: 0.8, level: 'A1', turn_introduced: 2 },
  { id: 'jhabite', label: "j'habite", type: 'sentence', mastery: 0.85, level: 'A1', turn_introduced: 3 },
  { id: 'cest', label: "c'est", type: 'grammar', mastery: 0.3, level: 'A1+', turn_introduced: 3 },
  { id: 'tu_aimes', label: 'tu aimes', type: 'sentence', mastery: 0.75, level: 'A1+', turn_introduced: 3 },
  { id: 'faire', label: 'faire', type: 'vocab', mastery: 0.5, level: 'A1+', turn_introduced: 4 },
  { id: 'visiter', label: 'visiter', type: 'vocab', mastery: 0.6, level: 'A2', turn_introduced: 5 },
  { id: 'tu_parles', label: 'tu parles', type: 'sentence', mastery: 0.3, level: 'A2', turn_introduced: 5 },
];

const MOCK_GRAPH_LINKS = [
  { source: 'bonjour', target: 'comment', relationship: 'semantic', turn_introduced: 1 },
  { source: 'comment', target: 'tu_tappelles', relationship: 'prerequisite', turn_introduced: 1 },
  { source: 'tu_tappelles', target: 'je_mappelle', relationship: 'conjugation', turn_introduced: 2 },
  { source: 'je_mappelle', target: 'enchante', relationship: 'semantic', turn_introduced: 2 },
  { source: 'bonjour', target: 'tu_habites', relationship: 'reactivation', turn_introduced: 2 },
  { source: 'tu_habites', target: 'jhabite', relationship: 'conjugation', turn_introduced: 3 },
  { source: 'jhabite', target: 'cest', relationship: 'semantic', turn_introduced: 3 },
  { source: 'cest', target: 'tu_aimes', relationship: 'prerequisite', turn_introduced: 3 },
  { source: 'tu_aimes', target: 'faire', relationship: 'prerequisite', turn_introduced: 4 },
  { source: 'faire', target: 'visiter', relationship: 'semantic', turn_introduced: 5 },
  { source: 'tu_aimes', target: 'tu_parles', relationship: 'reactivation', turn_introduced: 5 },
];

let mockTurnIndex = 0;

// ── Type mapping constants ───────────────────────────────────────────────

const NODE_TYPE_MAP: Record<string, 'soma' | 'dendrite'> = {
  sentence: 'soma',
  grammar: 'soma',
  vocab: 'dendrite',
};

const CATEGORY_MAP: Record<string, Category> = {
  A1: 'daily',
  'A1+': 'social',
  A2: 'academic',
};

const SYNAPSE_TYPE_MAP: Record<string, 'logical' | 'derivation'> = {
  prerequisite: 'logical',
  conjugation: 'logical',
  semantic: 'derivation',
  reactivation: 'derivation',
};

// ── Backend detection ────────────────────────────────────────────────────

let _useBackend: boolean | null = null;

export async function checkBackend(): Promise<boolean> {
  if (_useBackend !== null) return _useBackend;
  _useBackend = await backend.isBackendAvailable();
  if (_useBackend) {
    const connected = await backend.connect();
    _useBackend = connected;
  }
  return _useBackend;
}

export function isUsingBackend(): boolean {
  return _useBackend === true;
}

export function resetMockState() {
  mockTurnIndex = 0;
}

export function getMockTurnIndex(): number {
  return mockTurnIndex;
}

export function getTotalMockTurns(): number {
  return MOCK_TURNS.length;
}

// ── Core API ─────────────────────────────────────────────────────────────

/**
 * Process user input and return an updated NebulaState.
 *
 * Tries the backend pipeline first, falls back to mock data.
 */
export async function analyzeInput(
  input: string,
  currentState: NebulaState,
  isFlying: boolean = false,
  inputType: 'text' | 'audio' = 'text'
): Promise<NebulaState> {
  // Try backend first
  if (_useBackend && backend.getConnectionStatus() === 'connected') {
    try {
      const response = await backend.sendMessage(input, inputType);

      if (response.type === 'turn_response') {
        const updatedMessages = backend.mapTurnToMessages(response.turn, currentState.messages);
        const { neurons, synapses } = await backend.fetchGraphData();

        // Play TTS audio if available
        if (response.tts) {
          playTTS(response.tts);
        }

        return {
          neurons: neurons.length > 0 ? neurons : currentState.neurons,
          synapses: synapses.length > 0 ? synapses : currentState.synapses,
          messages: updatedMessages,
        };
      } else if (response.type === 'demo_complete') {
        return {
          ...currentState,
          messages: [
            ...currentState.messages,
            {
              id: `system-${Date.now()}`,
              role: 'ai' as const,
              text: 'Demo complete! Reset to try again.',
              timestamp: Date.now(),
            },
          ],
        };
      } else if (response.type === 'error') {
        // Show the error to the user instead of silently falling back
        return {
          ...currentState,
          messages: [
            ...currentState.messages,
            {
              id: `user-${Date.now()}`,
              role: 'user' as const,
              text: input,
              timestamp: Date.now(),
            },
            {
              id: `error-${Date.now()}`,
              role: 'ai' as const,
              text: `Error: ${response.message}. Please try again.`,
              timestamp: Date.now() + 1,
            },
          ],
        };
      }
    } catch (err) {
      console.error('Backend request failed:', err);
      // Show error instead of silently falling back to mock
      return {
        ...currentState,
        messages: [
          ...currentState.messages,
          {
            id: `user-${Date.now()}`,
            role: 'user' as const,
            text: input,
            timestamp: Date.now(),
          },
          {
            id: `error-${Date.now()}`,
            role: 'ai' as const,
            text: `Connection error: ${err instanceof Error ? err.message : 'Unknown error'}. Retrying...`,
            timestamp: Date.now() + 1,
          },
        ],
      };
    }
  }

  // ── Mock mode (only when no backend) ──────────────────────────────
  return processMockTurn(currentState, input);
}

function processMockTurn(currentState: NebulaState, userInput?: string): NebulaState {
  if (mockTurnIndex >= MOCK_TURNS.length) {
    return {
      ...currentState,
      messages: [
        ...currentState.messages,
        {
          id: `system-${Date.now()}`,
          role: 'ai' as const,
          text: "Demo complete! You've progressed from A1 to A2 in French. Reset to try again.",
          timestamp: Date.now(),
        },
      ],
    };
  }

  const turn = MOCK_TURNS[mockTurnIndex];
  const turnNum = turn.turn_number;
  mockTurnIndex++;

  // Build neurons from graph nodes up to this turn
  const neurons = MOCK_GRAPH_NODES.filter((n) => n.turn_introduced <= turnNum).map((n) => ({
    id: n.id,
    label: n.label,
    type: NODE_TYPE_MAP[n.type] || ('dendrite' as const),
    potential: n.mastery,
    strength: n.mastery,
    usageCount: Math.ceil(n.mastery * 5),
    category: CATEGORY_MAP[n.level] || ('daily' as Category),
    grammarDna: n.type === 'grammar' ? 'Grammar' : n.type === 'sentence' ? 'SVO' : 'Vocab',
    isShadow: n.mastery < 0.3,
    lastReviewed: Date.now(),
  }));

  // Build synapses from graph links up to this turn
  const synapses = MOCK_GRAPH_LINKS.filter((l) => l.turn_introduced <= turnNum).map((l) => ({
    source: l.source,
    target: l.target,
    strength: 0.7,
    type: SYNAPSE_TYPE_MAP[l.relationship] || ('logical' as const),
  }));

  // Build messages
  const ts = Date.now();
  const resp = turn.response;

  const userMsg = {
    id: `user-${ts}`,
    role: 'user' as const,
    text: userInput || turn.user_said,
    timestamp: ts,
  };

  const aiMsg = {
    id: `ai-${ts}`,
    role: 'ai' as const,
    text: resp.spoken_response,
    timestamp: ts + 1,
    analysis: {
      vocabulary: resp.vocabulary_breakdown.map((v) => ({
        word: v.word,
        translation: v.translation,
        type: v.part_of_speech,
        isNew: resp.new_elements.some((e) => v.word.includes(e) || e.includes(v.word)),
      })),
      newElements: resp.new_elements,
      level: resp.user_level_assessment,
      progress: resp.border_update,
    },
  };

  return {
    neurons,
    synapses,
    messages: [...currentState.messages, userMsg, aiMsg],
  };
}
