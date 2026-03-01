/**
 * Unified language analysis service for Echo Neural Language Lab.
 *
 * Attempts to use the FastAPI backend first (WebSocket conversation pipeline).
 * Falls back to client-side mock data when no backend is available.
 *
 * The mock data follows the same French learning i+1 progression as the backend.
 */

import { NebulaState, Neuron, Synapse, Category, NodeKind, LinkKind } from '../types';
import * as backend from './backendService';

// Track whether TTS has been played for the latest response
let _ttsPlayed = false;
let _ttsFallbackTimer: ReturnType<typeof setTimeout> | null = null;
let _lastSpokenResponse = '';

// TTS audio playback is handled by App.tsx's onTTS(playTtsPayload) callback.
// Do NOT register a competing onTTS callback here — backendService only keeps one.

/**
 * Schedule a browser TTS fallback if backend TTS doesn't arrive within 4 seconds.
 * NOTE: TTS is now handled by App.tsx's onTTS(playTtsPayload) callback.
 * This fallback is kept as a safety net but the main path is via WebSocket → App.tsx.
 */
function scheduleTTSFallback(_spokenResponse: string) {
  // No-op: TTS playback is handled by App.tsx via the onTTS WebSocket callback.
  // Browser speechSynthesis is unreliable on Linux, so we rely on OpenAI TTS audio.
}

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
        speakWithBrowser(tts.text || _lastSpokenResponse);
      });
    } catch (err) {
      console.warn('Audio decode failed:', err);
      speakWithBrowser(tts.text || _lastSpokenResponse);
    }
  } else if (tts.mode === 'browser') {
    speakWithBrowser(tts.text || _lastSpokenResponse);
  }
}

function speakWithBrowser(text: string) {
  if (!text) return;
  if ('speechSynthesis' in window) {
    // Cancel any ongoing speech first
    window.speechSynthesis.cancel();
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
      border_update: 'You can greet someone! Next: introduce yourself by name.',
      user_vocabulary: ['bonjour'],
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
      border_update: 'You can introduce yourself! Next: talk about where you live.',
      user_vocabulary: ["je m'appelle", 'Marie'],
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
      reactivated_elements: ['bonjour'],
      user_level_assessment: 'A1+',
      border_update: 'You can say where you live! Level up to A1+!',
      user_vocabulary: ["j'habite", 'Paris'],
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
      reactivated_elements: ["j'habite", 'bonjour'],
      user_level_assessment: 'A1+',
      border_update: 'You can express what you like! Next: describe activities.',
      user_vocabulary: ["j'aime", 'beaucoup', 'Paris'],
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
      reactivated_elements: ["j'aime", 'Paris'],
      user_level_assessment: 'A2',
      border_update: "Amazing! You've reached A2 — you can describe activities with detail!",
      user_vocabulary: ['visiter', 'musées', 'manger', 'croissants'],
    },
  },
];

// Graph data — USER-SPOKEN words only (not AI tutor's words)
const MOCK_GRAPH_NODES = [
  { id: 'bonjour', label: 'bonjour', type: 'vocab', mastery: 0.9, level: 'A1', turn_introduced: 1, usage_count: 1 },
  { id: 'je_mappelle', label: "je m'appelle", type: 'sentence', mastery: 0.8, level: 'A1', turn_introduced: 2, usage_count: 1 },
  { id: 'marie', label: 'Marie', type: 'vocab', mastery: 0.7, level: 'A1', turn_introduced: 2, usage_count: 1 },
  { id: 'jhabite', label: "j'habite", type: 'sentence', mastery: 0.7, level: 'A1+', turn_introduced: 3, usage_count: 1 },
  { id: 'paris', label: 'Paris', type: 'vocab', mastery: 0.8, level: 'A1+', turn_introduced: 3, usage_count: 2 },
  { id: 'jaime', label: "j'aime", type: 'sentence', mastery: 0.6, level: 'A1+', turn_introduced: 4, usage_count: 2 },
  { id: 'beaucoup', label: 'beaucoup', type: 'vocab', mastery: 0.5, level: 'A1+', turn_introduced: 4, usage_count: 1 },
  { id: 'visiter', label: 'visiter', type: 'vocab', mastery: 0.3, level: 'A2', turn_introduced: 5, usage_count: 1 },
  { id: 'musees', label: 'musées', type: 'vocab', mastery: 0.3, level: 'A2', turn_introduced: 5, usage_count: 1 },
  { id: 'manger', label: 'manger', type: 'vocab', mastery: 0.3, level: 'A2', turn_introduced: 5, usage_count: 1 },
  { id: 'croissants', label: 'croissants', type: 'vocab', mastery: 0.3, level: 'A2', turn_introduced: 5, usage_count: 1 },
];

const MOCK_GRAPH_LINKS = [
  // Turn chain: learning progression
  { source: 'bonjour', target: 'je_mappelle', relationship: 'prerequisite', turn_introduced: 2 },
  { source: 'marie', target: 'jhabite', relationship: 'prerequisite', turn_introduced: 3 },
  { source: 'paris', target: 'jaime', relationship: 'prerequisite', turn_introduced: 4 },
  { source: 'beaucoup', target: 'visiter', relationship: 'prerequisite', turn_introduced: 5 },
  // Semantic links
  { source: 'jhabite', target: 'paris', relationship: 'semantic', turn_introduced: 3 },
  { source: 'jaime', target: 'beaucoup', relationship: 'semantic', turn_introduced: 4 },
  { source: 'visiter', target: 'musees', relationship: 'semantic', turn_introduced: 5 },
  { source: 'manger', target: 'croissants', relationship: 'semantic', turn_introduced: 5 },
  // Reactivation
  { source: 'bonjour', target: 'jaime', relationship: 'reactivation', turn_introduced: 4 },
];

let mockTurnIndex = 0;

// ── Type mapping constants ───────────────────────────────────────────────

const NODE_TYPE_MAP: Record<string, 'soma' | 'dendrite'> = {
  sentence: 'soma',
  grammar: 'soma',
  vocab: 'dendrite',
};

const NODE_KIND_MAP: Record<string, NodeKind> = {
  sentence: 'sentence',
  grammar: 'grammar',
  vocab: 'vocab',
};

const CATEGORY_MAP: Record<string, Category> = {
  A1: 'daily',
  'A1+': 'social',
  A2: 'academic',
};

const LINK_KIND_MAP: Record<string, LinkKind> = {
  prerequisite: 'prerequisite',
  conjugation: 'conjugation',
  semantic: 'semantic',
  reactivation: 'reactivation',
  mission: 'mission',
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

// ── Client-side link fallback ────────────────────────────────────────────

/**
 * Generate links between neurons when the backend returns 0 links.
 * Connects neurons by proximity in mastery level and by sequential order.
 */
function generateFallbackLinks(neurons: Neuron[]): Synapse[] {
  if (neurons.length < 2) return [];
  const links: Synapse[] = [];
  const seen = new Set<string>();

  function addLink(src: string, tgt: string, kind: LinkKind) {
    const key = [src, tgt].sort().join('-');
    if (seen.has(key) || src === tgt) return;
    seen.add(key);
    links.push({ source: src, target: tgt, strength: 0.7, linkKind: kind, isNew: false });
  }

  // Sort by strength to create a progression chain
  const sorted = [...neurons].sort((a, b) => a.strength - b.strength);

  // Chain: connect each node to the next in mastery progression
  for (let i = 0; i < sorted.length - 1; i++) {
    addLink(sorted[i].id, sorted[i + 1].id, 'prerequisite');
  }

  // Connect nodes with similar mastery (within 0.2)
  for (let i = 0; i < neurons.length; i++) {
    for (let j = i + 1; j < neurons.length; j++) {
      if (Math.abs(neurons[i].strength - neurons[j].strength) < 0.2) {
        addLink(neurons[i].id, neurons[j].id, 'semantic');
      }
    }
  }

  return links;
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
  // Display-friendly text for audio inputs (don't show raw base64)
  const displayText = inputType === 'audio' ? '🎤 [Voice message]' : input;

  // Try backend first
  if (_useBackend && backend.getConnectionStatus() === 'connected') {
    try {
      const response = await backend.sendMessage(input, inputType);

      if (response.type === 'turn_response') {
        // Merge top-level pedagogy/timings into the turn response payload for unified mapping
        if (response.turn?.response) {
          if (response.pedagogy) {
            response.turn.response.quality_score = response.pedagogy.quality_score;
            response.turn.response.validated_user_units = [
              ...(response.pedagogy.accepted_units || []),
              ...(response.pedagogy.rejected_units || []),
            ];
            response.turn.response.canonical_units = response.pedagogy.canonical_units || [];
            response.turn.response.next_mission_hint = response.pedagogy.next_mission_hint || '';
            response.turn.response.mission_progress = response.pedagogy.mission_progress || undefined;
            response.turn.response.mission_tasks = response.pedagogy.mission_tasks || undefined;
          }
          if (response.timings) {
            response.turn.response.latency_ms = response.timings;
          }
        }
        const updatedMessages = backend.mapTurnToMessages(response.turn, currentState.messages);
        // Keep the tutor response snappy: don't block too long on graph refresh.
        const graphData = await Promise.race([
          backend.fetchGraphData(),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 800)),
        ]);
        const neurons = graphData?.neurons ?? currentState.neurons;
        const synapses = graphData?.synapses ?? currentState.synapses;

        // Play TTS if included in the response (legacy).
        // With the new pipeline, TTS arrives as a separate 'tts' message
        // and is handled by the onTTS callback registered above.
        if (response.tts) {
          playTTS(response.tts);
        } else {
          // Schedule fallback: if backend TTS doesn't arrive within 4s, use browser TTS
          const spokenResponse = response.turn?.response?.spoken_response;
          if (spokenResponse) {
            scheduleTTSFallback(spokenResponse);
          }
        }

        // Diff: mark new neurons and synapses
        const prevNodeIds = new Set(currentState.neurons.map(n => n.id));
        const prevSynapseKeys = new Set(currentState.synapses.map(s => `${s.source}-${s.target}`));
        const neuronsWithNew = (neurons.length > 0 ? neurons : currentState.neurons).map(n => ({
          ...n,
          isNew: !prevNodeIds.has(n.id),
        }));
        const synapsesWithNew = (synapses.length > 0 ? synapses : currentState.synapses).map(s => ({
          ...s,
          isNew: !prevSynapseKeys.has(`${s.source}-${s.target}`),
        }));

        // Fallback: generate links client-side if backend returned none
        let finalSynapses: Synapse[] = synapsesWithNew;
        if (finalSynapses.length === 0 && neuronsWithNew.length > 1) {
          console.warn('Backend returned 0 links — generating fallback links client-side');
          finalSynapses = generateFallbackLinks(neuronsWithNew);
        }

        return {
          neurons: neuronsWithNew,
          synapses: finalSynapses,
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
              text: displayText,
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
            text: displayText,
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
  const prevNodeIds = new Set(currentState.neurons.map(n => n.id));
  const neurons = MOCK_GRAPH_NODES.filter((n) => n.turn_introduced <= turnNum).map((n) => ({
    id: n.id,
    label: n.label,
    type: NODE_TYPE_MAP[n.type] || ('dendrite' as const),
    nodeKind: NODE_KIND_MAP[n.type] || ('vocab' as NodeKind),
    potential: n.mastery,
    strength: n.mastery,
    usageCount: n.usage_count ?? 1,
    category: CATEGORY_MAP[n.level] || ('daily' as Category),
    grammarDna: n.type === 'grammar' ? 'Grammar' : n.type === 'sentence' ? 'SVO' : 'Vocab',
    isShadow: n.mastery < 0.3,
    isNew: !prevNodeIds.has(n.id),
    lastReviewed: Date.now(),
  }));

  // Build synapses from graph links up to this turn
  const prevSynapseKeys = new Set(currentState.synapses.map(s => `${s.source}-${s.target}`));
  const synapses = MOCK_GRAPH_LINKS.filter((l) => l.turn_introduced <= turnNum).map((l) => ({
    source: l.source,
    target: l.target,
    strength: 0.7,
    linkKind: LINK_KIND_MAP[l.relationship] || ('semantic' as LinkKind),
    isNew: !prevSynapseKeys.has(`${l.source}-${l.target}`),
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
      qualityScore: 0.78,
      acceptedUnits: resp.user_vocabulary || [],
      rejectedUnits: [],
      missionHint: 'Mission A1-A2: Describe your favorite activity in one sentence.',
      latencyMs: { stt: 0, llm: 0, total: 0 },
    },
  };

  // Play the AI response via browser TTS in mock mode
  speakWithBrowser(resp.spoken_response);

  return {
    neurons,
    synapses,
    messages: [...currentState.messages, userMsg, aiMsg],
  };
}
