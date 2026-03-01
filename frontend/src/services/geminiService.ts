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

// ── Mock data (French learning — sentence/phrase level nodes) ─────────────
//
// Design principles:
//  • Every node is a FULL SENTENCE or PHRASE, never an isolated word.
//  • Soma nodes  = core sentence patterns the user is actively building.
//  • Dendrite nodes = scenario extensions / derivations from a soma.
//  • Link types:
//      prerequisite       – B cannot exist without knowing A first
//      conjugation_pair   – question ↔ answer mirror (tu habites / j'habite)
//      semantic_extension – same topic, new scenario (park → café → museum)
//      reactivation       – old structure recycled in a new context
//  • grammarDna drives the 3-D clustering:
//      "Greeting"         – social openers
//      "Identity-Q&A"     – name / origin question-answer pairs
//      "Location-Q&A"     – where question-answer pairs
//      "Opinion-Inf"      – j'aime / je voudrais + infinitive patterns
//      "Activity-Ext"     – concrete activity extensions

const MOCK_TURNS = [
  {
    turn_number: 1,
    user_said: 'Bonjour !',
    response: {
      spoken_response: "Bonjour ! Comment tu t'appelles ?",
      translation_hint: "Hello! What's your name?",
      vocabulary_breakdown: [
        { word: 'Bonjour !', translation: 'Hello!', part_of_speech: 'greeting phrase' },
        { word: "Comment tu t'appelles ?", translation: "What's your name?", part_of_speech: 'question phrase (s\'appeler)' },
      ],
      new_elements: ['Bonjour !', "Comment tu t'appelles ?"],
      reactivated_elements: [],
      user_level_assessment: 'A1',
      border_update: 'You can open a conversation. Next border: introduce yourself by name.',
    },
  },
  {
    turn_number: 2,
    user_said: "Je m'appelle Marie.",
    response: {
      spoken_response: "Enchanté, Marie ! Tu habites où ?",
      translation_hint: 'Nice to meet you, Marie! Where do you live?',
      vocabulary_breakdown: [
        { word: "Je m'appelle Marie.", translation: 'My name is Marie.', part_of_speech: 'identity sentence (s\'appeler)' },
        { word: 'Enchanté !', translation: 'Nice to meet you!', part_of_speech: 'social phrase' },
        { word: 'Tu habites où ?', translation: 'Where do you live?', part_of_speech: 'question phrase (habiter)' },
      ],
      new_elements: ["Je m'appelle [prénom].", 'Enchanté !', 'Tu habites où ?'],
      reactivated_elements: ['Bonjour !'],
      user_level_assessment: 'A1',
      border_update: 'You can introduce yourself. Next border: describe where you live.',
    },
  },
  {
    turn_number: 3,
    user_said: "J'habite à Paris.",
    response: {
      spoken_response: "Ah, Paris ! C'est une belle ville. Tu aimes Paris ?",
      translation_hint: "Ah, Paris! It's a beautiful city. Do you like Paris?",
      vocabulary_breakdown: [
        { word: "J'habite à Paris.", translation: 'I live in Paris.', part_of_speech: 'location sentence (habiter)' },
        { word: "C'est une belle ville.", translation: "It's a beautiful city.", part_of_speech: 'description sentence (être)' },
        { word: 'Tu aimes Paris ?', translation: 'Do you like Paris?', part_of_speech: 'opinion question (aimer)' },
      ],
      new_elements: ["J'habite à [lieu].", "C'est une belle ville.", 'Tu aimes [lieu] ?'],
      reactivated_elements: ['Tu habites où ?'],
      user_level_assessment: 'A1+',
      border_update: 'You can say where you live. Next border: express opinions and preferences.',
    },
  },
  {
    turn_number: 4,
    user_said: "Oui, j'aime beaucoup Paris !",
    response: {
      spoken_response: "Moi aussi ! Qu'est-ce que tu aimes faire à Paris ?",
      translation_hint: 'Me too! What do you like to do in Paris?',
      vocabulary_breakdown: [
        { word: "J'aime beaucoup [lieu/chose].", translation: 'I really like [place/thing].', part_of_speech: 'opinion sentence (aimer)' },
        { word: "Qu'est-ce que tu aimes faire ?", translation: 'What do you like to do?', part_of_speech: 'activity question (aimer + inf.)' },
        { word: 'Moi aussi !', translation: 'Me too!', part_of_speech: 'agreement phrase' },
      ],
      new_elements: ["J'aime beaucoup [lieu/chose].", "Qu'est-ce que tu aimes faire ?", 'Moi aussi !'],
      reactivated_elements: ["J'habite à [lieu].", 'Tu aimes [lieu] ?'],
      user_level_assessment: 'A1+',
      border_update: 'You can express likes. Next border: describe specific activities.',
    },
  },
  {
    turn_number: 5,
    user_said: "J'aime visiter les musées et manger des croissants.",
    response: {
      spoken_response: "Excellent ! Tu parles déjà très bien. Les musées de Paris sont magnifiques !",
      translation_hint: 'Excellent! You already speak very well. The museums in Paris are magnificent!',
      vocabulary_breakdown: [
        { word: "J'aime visiter les musées.", translation: 'I like visiting museums.', part_of_speech: 'activity sentence (aimer + inf.)' },
        { word: "J'aime manger des croissants.", translation: 'I like eating croissants.', part_of_speech: 'activity sentence (aimer + inf.)' },
        { word: 'Tu parles déjà très bien !', translation: 'You already speak very well!', part_of_speech: 'compliment sentence (parler)' },
      ],
      new_elements: ["J'aime visiter [lieu].", "J'aime manger [nourriture].", 'Tu parles très bien !'],
      reactivated_elements: ["J'aime beaucoup [lieu/chose].", "Qu'est-ce que tu aimes faire ?", "C'est une belle ville."],
      user_level_assessment: 'A2',
      border_update: "You can describe activities and chain preferences. You've crossed into A2!",
    },
  },
];

// ── Sentence-level graph nodes ───────────────────────────────────────────
//  type: 'sentence' → soma (core pattern)
//  type: 'extension' → dendrite (scenario extension of a soma)
//  type: 'social'   → soma (fixed social phrase)
const MOCK_GRAPH_NODES = [
  // ── Turn 1: Greeting cluster ──────────────────────────────────────────
  { id: 'greet_bonjour',     label: 'Bonjour !',                    type: 'social',    mastery: 1.0,  level: 'A1',  grammarDna: 'Greeting', turn_introduced: 1, category: 'social' },
  { id: 'q_comment_appelles',label: "Comment tu t'appelles ?",      type: 'sentence',  mastery: 0.85, level: 'A1',  grammarDna: 'Identity-Q&A', turn_introduced: 1, category: 'social' },

  // ── Turn 2: Identity cluster ───────────────────────────────────────────
  { id: 'r_je_mappelle',     label: "Je m'appelle [prénom].",        type: 'sentence',  mastery: 0.9,  level: 'A1',  grammarDna: 'Identity-Q&A', turn_introduced: 2, category: 'social' },
  { id: 'social_enchante',   label: 'Enchanté !',                   type: 'social',    mastery: 0.75, level: 'A1',  grammarDna: 'Greeting', turn_introduced: 2, category: 'social' },
  { id: 'q_tu_habites',      label: 'Tu habites où ?',              type: 'sentence',  mastery: 0.8,  level: 'A1',  grammarDna: 'Location-Q&A', turn_introduced: 2, category: 'daily' },

  // ── Turn 3: Location cluster ───────────────────────────────────────────
  { id: 'r_jhabite_paris',   label: "J'habite à Paris.",             type: 'sentence',  mastery: 0.85, level: 'A1',  grammarDna: 'Location-Q&A', turn_introduced: 3, category: 'daily' },
  { id: 'desc_belle_ville',  label: "C'est une belle ville.",        type: 'sentence',  mastery: 0.6,  level: 'A1+', grammarDna: 'Description', turn_introduced: 3, category: 'daily' },
  { id: 'q_tu_aimes_lieu',   label: 'Tu aimes [lieu] ?',            type: 'sentence',  mastery: 0.7,  level: 'A1+', grammarDna: 'Opinion-Inf', turn_introduced: 3, category: 'daily' },

  // ── Turn 4: Opinion + Activity question cluster ────────────────────────
  { id: 'r_jaime_bcp',       label: "J'aime beaucoup [lieu/chose].", type: 'sentence',  mastery: 0.8,  level: 'A1+', grammarDna: 'Opinion-Inf', turn_introduced: 4, category: 'daily' },
  { id: 'q_aimes_faire',     label: "Qu'est-ce que tu aimes faire ?",type: 'sentence',  mastery: 0.65, level: 'A1+', grammarDna: 'Opinion-Inf', turn_introduced: 4, category: 'daily' },
  { id: 'social_moi_aussi',  label: 'Moi aussi !',                  type: 'social',    mastery: 0.55, level: 'A1+', grammarDna: 'Greeting',    turn_introduced: 4, category: 'social' },

  // ── Turn 5: Activity extensions (dendrites of j'aime faire) ───────────
  { id: 'act_visiter_musees',label: "J'aime visiter les musées.",    type: 'extension', mastery: 0.7,  level: 'A2',  grammarDna: 'Activity-Ext', turn_introduced: 5, category: 'travel' },
  { id: 'act_manger_crois',  label: "J'aime manger des croissants.", type: 'extension', mastery: 0.65, level: 'A2',  grammarDna: 'Activity-Ext', turn_introduced: 5, category: 'daily' },
  { id: 'comp_tu_parles',    label: 'Tu parles très bien !',         type: 'sentence',  mastery: 0.4,  level: 'A2',  grammarDna: 'Description',  turn_introduced: 5, category: 'social' },
];

// ── Semantic link graph ──────────────────────────────────────────────────
//  prerequisite       = "you must know A before B makes sense"
//  conjugation_pair   = question ↔ answer mirror
//  semantic_extension = same topic, new scenario
//  reactivation       = old pattern recycled in new context
const MOCK_GRAPH_LINKS = [
  // Greeting → Identity question (you greet, then ask name)
  { source: 'greet_bonjour',     target: 'q_comment_appelles', relationship: 'prerequisite',       turn_introduced: 1 },
  // Question ↔ Answer mirror pair
  { source: 'q_comment_appelles',target: 'r_je_mappelle',      relationship: 'conjugation_pair',   turn_introduced: 2 },
  // Answering name → social phrase "Enchanté"
  { source: 'r_je_mappelle',     target: 'social_enchante',    relationship: 'semantic_extension', turn_introduced: 2 },
  // After name → ask where they live
  { source: 'social_enchante',   target: 'q_tu_habites',       relationship: 'prerequisite',       turn_introduced: 2 },
  // Question ↔ Answer mirror pair
  { source: 'q_tu_habites',      target: 'r_jhabite_paris',    relationship: 'conjugation_pair',   turn_introduced: 3 },
  // Location → description of that place
  { source: 'r_jhabite_paris',   target: 'desc_belle_ville',   relationship: 'semantic_extension', turn_introduced: 3 },
  // Description → opinion question about the place
  { source: 'desc_belle_ville',  target: 'q_tu_aimes_lieu',    relationship: 'prerequisite',       turn_introduced: 3 },
  // Opinion question ↔ answer mirror
  { source: 'q_tu_aimes_lieu',   target: 'r_jaime_bcp',        relationship: 'conjugation_pair',   turn_introduced: 4 },
  // "I like X" → "what do you like TO DO?" (adds infinitive verb)
  { source: 'r_jaime_bcp',       target: 'q_aimes_faire',      relationship: 'prerequisite',       turn_introduced: 4 },
  // Agreement phrase reuses earlier greeting cluster
  { source: 'greet_bonjour',     target: 'social_moi_aussi',   relationship: 'reactivation',       turn_introduced: 4 },
  // "What do you like to do?" branches into concrete activities
  { source: 'q_aimes_faire',     target: 'act_visiter_musees', relationship: 'semantic_extension', turn_introduced: 5 },
  { source: 'q_aimes_faire',     target: 'act_manger_crois',   relationship: 'semantic_extension', turn_introduced: 5 },
  // Activities reactivate the base "j'aime beaucoup" structure
  { source: 'act_visiter_musees',target: 'r_jaime_bcp',        relationship: 'reactivation',       turn_introduced: 5 },
  // Compliment reactivates the description cluster
  { source: 'desc_belle_ville',  target: 'comp_tu_parles',     relationship: 'reactivation',       turn_introduced: 5 },
];

let mockTurnIndex = 0;

// ── Type mapping constants ───────────────────────────────────────────────

const NODE_TYPE_MAP: Record<string, 'soma' | 'dendrite'> = {
  sentence:  'soma',      // core patterns → large glowing sphere
  social:    'soma',      // fixed social phrases → large sphere
  extension: 'dendrite',  // scenario extensions → small satellite sphere
};

const CATEGORY_MAP: Record<string, Category> = {
  social:   'social',
  daily:    'daily',
  travel:   'travel',
  work:     'work',
  academic: 'academic',
  coding:   'coding',
  other:    'other',
  // CEFR fallbacks (legacy)
  A1:  'daily',
  'A1+': 'social',
  A2:  'academic',
};

const SYNAPSE_TYPE_MAP: Record<string, 'logical' | 'derivation'> = {
  prerequisite:       'logical',    // must know A before B
  conjugation_pair:   'logical',    // question ↔ answer structural mirror
  semantic_extension: 'derivation', // same topic, new scenario branch
  reactivation:       'derivation', // old pattern recycled in new context
  // legacy keys kept for back-compat
  conjugation:        'logical',
  semantic:           'derivation',
};

// ── Backend detection ────────────────────────────────────────────────────

let _useBackend: boolean | null = null;

export async function checkBackend(): Promise<boolean> {
  // Always use mock/demo mode — the FastAPI backend requires live API keys
  // (Speechmatics, OpenAI, Backboard) that are not available in local dev.
  // The rich mock data already provides the full A1→A2 demo experience.
  _useBackend = false;
  mockTurnIndex = 0;
  return false;
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
              text: 'Demo complete! All 5 turns have been played. Reset to try again.',
              timestamp: Date.now(),
            },
          ],
        };
      } else if (response.type === 'error') {
        throw new Error(response.message);
      }
    } catch (err) {
      console.warn('Backend request failed, falling back to mock:', err);
    }
  }

  // ── Mock mode ─────────────────────────────────────────────────────
  // In demo mode, audio blobs and empty strings should NOT consume a turn.
  // Only explicit text submissions or the '[mock-advance]' sentinel advance the demo.
  if (inputType === 'audio' || !input.trim()) {
    return processMockTurn(currentState);
  }
  return processMockTurn(currentState);
}

function processMockTurn(currentState: NebulaState): NebulaState {
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
    // Use explicit category from node data; fall back to level-based mapping
    category: (CATEGORY_MAP[n.category || ''] || CATEGORY_MAP[n.level] || 'daily') as Category,
    grammarDna: n.grammarDna || (n.type === 'extension' ? 'Activity-Ext' : n.type === 'social' ? 'Greeting' : 'Identity-Q&A'),
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
    text: turn.user_said,
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
