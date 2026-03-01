import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { NebulaCanvas } from './components/NebulaCanvas';
import { Dashboard } from './components/Dashboard';
import { Neuron, Synapse, NebulaState, Category, Message } from './types';
import { analyzeInput, checkBackend, isUsingBackend, resetMockState, getMockTurnIndex, getTotalMockTurns } from './services/geminiService';
import { onConnectionStatusChange, ConnectionStatus, resetSession } from './services/backendService';
import { Send, Brain, Zap, Info, Loader2, Search, Filter, Mic, Clock, X, MessageSquare, User, Bot, ChevronDown, ChevronUp, Plane, RefreshCw, Wifi, WifiOff, BarChart3, XCircle, FlaskConical } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

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

// ── Bulk test data generator ─────────────────────────────────────────────
// Pool covers 7 categories × many sentences. When count > pool size we
// cycle through with small label variants so we can go up to 1000.

type PoolEntry = { label: string; category: Category; grammarDna: string; type: 'soma' | 'dendrite'; strength: number };

const BASE_POOL: PoolEntry[] = [
  // Daily (16)
  { label: "Bonjour, comment ça va ?",            category: 'daily',    grammarDna: 'Greeting',     type: 'soma',     strength: 0.95 },
  { label: "Je vais bien, merci !",               category: 'daily',    grammarDna: 'Greeting',     type: 'soma',     strength: 0.90 },
  { label: "Tu habites où ?",                     category: 'daily',    grammarDna: 'Location-Q&A', type: 'soma',     strength: 0.80 },
  { label: "J'habite à Paris.",                   category: 'daily',    grammarDna: 'Location-Q&A', type: 'soma',     strength: 0.85 },
  { label: "C'est une belle ville.",              category: 'daily',    grammarDna: 'Description',  type: 'dendrite', strength: 0.60 },
  { label: "Il fait beau aujourd'hui.",           category: 'daily',    grammarDna: 'Description',  type: 'dendrite', strength: 0.55 },
  { label: "Je prends le métro.",                 category: 'daily',    grammarDna: 'Activity-Ext', type: 'dendrite', strength: 0.50 },
  { label: "Où est la boulangerie ?",             category: 'daily',    grammarDna: 'Location-Q&A', type: 'soma',     strength: 0.65 },
  { label: "Je bois un café le matin.",           category: 'daily',    grammarDna: 'Activity-Ext', type: 'dendrite', strength: 0.58 },
  { label: "La rue est animée.",                  category: 'daily',    grammarDna: 'Description',  type: 'dendrite', strength: 0.48 },
  { label: "Je préfère le café au thé.",          category: 'daily',    grammarDna: 'Opinion-Inf',  type: 'dendrite', strength: 0.58 },
  { label: "J'aime manger des croissants.",       category: 'daily',    grammarDna: 'Activity-Ext', type: 'dendrite', strength: 0.58 },
  { label: "On fait les courses ensemble.",       category: 'daily',    grammarDna: 'Activity-Ext', type: 'dendrite', strength: 0.52 },
  { label: "Le supermarché est fermé.",           category: 'daily',    grammarDna: 'Description',  type: 'dendrite', strength: 0.44 },
  { label: "À demain !",                          category: 'daily',    grammarDna: 'Greeting',     type: 'soma',     strength: 0.72 },
  { label: "Bonne journée !",                     category: 'daily',    grammarDna: 'Greeting',     type: 'soma',     strength: 0.70 },
  // Social (16)
  { label: "Comment tu t'appelles ?",             category: 'social',   grammarDna: 'Identity-Q&A', type: 'soma',     strength: 0.88 },
  { label: "Je m'appelle Marie.",                 category: 'social',   grammarDna: 'Identity-Q&A', type: 'soma',     strength: 0.92 },
  { label: "Enchanté(e) !",                       category: 'social',   grammarDna: 'Greeting',     type: 'soma',     strength: 0.75 },
  { label: "Moi aussi, j'adore ça !",             category: 'social',   grammarDna: 'Opinion-Inf',  type: 'dendrite', strength: 0.55 },
  { label: "On se retrouve à quelle heure ?",     category: 'social',   grammarDna: 'Time-Q&A',     type: 'soma',     strength: 0.45 },
  { label: "Je suis libre ce soir.",              category: 'social',   grammarDna: 'Time-Q&A',     type: 'dendrite', strength: 0.40 },
  { label: "J'aime beaucoup le cinéma.",          category: 'social',   grammarDna: 'Opinion-Inf',  type: 'soma',     strength: 0.82 },
  { label: "Qu'est-ce que tu aimes faire ?",      category: 'social',   grammarDna: 'Opinion-Inf',  type: 'soma',     strength: 0.76 },
  { label: "Tu veux venir à la fête ?",           category: 'social',   grammarDna: 'Opinion-Inf',  type: 'soma',     strength: 0.68 },
  { label: "On est de bons amis.",                category: 'social',   grammarDna: 'Description',  type: 'dendrite', strength: 0.50 },
  { label: "Je t'envoie un message.",             category: 'social',   grammarDna: 'Activity-Ext', type: 'dendrite', strength: 0.45 },
  { label: "C'était une super soirée !",          category: 'social',   grammarDna: 'Past-Tense',   type: 'dendrite', strength: 0.55 },
  { label: "Tu as l'air fatigué.",                category: 'social',   grammarDna: 'Description',  type: 'dendrite', strength: 0.40 },
  { label: "On se connaît depuis longtemps.",     category: 'social',   grammarDna: 'Past-Tense',   type: 'dendrite', strength: 0.42 },
  { label: "À bientôt !",                         category: 'social',   grammarDna: 'Greeting',     type: 'soma',     strength: 0.78 },
  { label: "Merci beaucoup !",                    category: 'social',   grammarDna: 'Greeting',     type: 'soma',     strength: 0.85 },
  // Travel (16)
  { label: "Où est la gare ?",                    category: 'travel',   grammarDna: 'Location-Q&A', type: 'soma',     strength: 0.78 },
  { label: "Un billet pour Lyon, s'il vous plaît.", category: 'travel', grammarDna: 'Request',      type: 'soma',     strength: 0.70 },
  { label: "À quelle heure part le train ?",      category: 'travel',   grammarDna: 'Time-Q&A',     type: 'soma',     strength: 0.65 },
  { label: "J'ai réservé une chambre.",           category: 'travel',   grammarDna: 'Past-Tense',   type: 'dendrite', strength: 0.48 },
  { label: "C'est combien la nuit ?",             category: 'travel',   grammarDna: 'Request',      type: 'dendrite', strength: 0.42 },
  { label: "Je voudrais visiter le Louvre.",      category: 'travel',   grammarDna: 'Opinion-Inf',  type: 'soma',     strength: 0.60 },
  { label: "J'aime visiter les musées.",          category: 'travel',   grammarDna: 'Activity-Ext', type: 'dendrite', strength: 0.62 },
  { label: "Le vol est à 14h.",                   category: 'travel',   grammarDna: 'Time-Q&A',     type: 'soma',     strength: 0.58 },
  { label: "L'hôtel est très confortable.",       category: 'travel',   grammarDna: 'Description',  type: 'dendrite', strength: 0.52 },
  { label: "Je cherche un restaurant.",           category: 'travel',   grammarDna: 'Activity-Ext', type: 'soma',     strength: 0.66 },
  { label: "La carte, s'il vous plaît.",          category: 'travel',   grammarDna: 'Request',      type: 'soma',     strength: 0.72 },
  { label: "C'est magnifique ici !",              category: 'travel',   grammarDna: 'Description',  type: 'dendrite', strength: 0.70 },
  { label: "Je suis perdu(e).",                   category: 'travel',   grammarDna: 'Description',  type: 'soma',     strength: 0.55 },
  { label: "Pouvez-vous m'aider ?",               category: 'travel',   grammarDna: 'Request',      type: 'soma',     strength: 0.65 },
  { label: "Combien de temps dure le trajet ?",   category: 'travel',   grammarDna: 'Time-Q&A',     type: 'soma',     strength: 0.60 },
  { label: "Je reviens dans une semaine.",        category: 'travel',   grammarDna: 'Time-Q&A',     type: 'dendrite', strength: 0.45 },
  // Work (16)
  { label: "J'ai une réunion à 10h.",             category: 'work',     grammarDna: 'Time-Q&A',     type: 'soma',     strength: 0.72 },
  { label: "Pouvez-vous m'envoyer le rapport ?",  category: 'work',     grammarDna: 'Request',      type: 'soma',     strength: 0.68 },
  { label: "Je travaille en télétravail.",        category: 'work',     grammarDna: 'Activity-Ext', type: 'dendrite', strength: 0.55 },
  { label: "Le projet est en bonne voie.",        category: 'work',     grammarDna: 'Description',  type: 'dendrite', strength: 0.45 },
  { label: "On a atteint nos objectifs.",         category: 'work',     grammarDna: 'Past-Tense',   type: 'dendrite', strength: 0.38 },
  { label: "Je dois finir avant vendredi.",       category: 'work',     grammarDna: 'Time-Q&A',     type: 'soma',     strength: 0.62 },
  { label: "La présentation est prête.",          category: 'work',     grammarDna: 'Description',  type: 'soma',     strength: 0.58 },
  { label: "On manque de ressources.",            category: 'work',     grammarDna: 'Description',  type: 'dendrite', strength: 0.42 },
  { label: "Je prends des congés la semaine prochaine.", category: 'work', grammarDna: 'Time-Q&A', type: 'dendrite', strength: 0.40 },
  { label: "Le client est satisfait.",            category: 'work',     grammarDna: 'Description',  type: 'dendrite', strength: 0.50 },
  { label: "On travaille en équipe.",             category: 'work',     grammarDna: 'Activity-Ext', type: 'soma',     strength: 0.60 },
  { label: "Il faut revoir le budget.",           category: 'work',     grammarDna: 'Opinion-Inf',  type: 'soma',     strength: 0.52 },
  { label: "La réunion est reportée.",            category: 'work',     grammarDna: 'Past-Tense',   type: 'dendrite', strength: 0.38 },
  { label: "Bonne continuation !",               category: 'work',     grammarDna: 'Greeting',     type: 'soma',     strength: 0.65 },
  { label: "Je suis en déplacement.",             category: 'work',     grammarDna: 'Activity-Ext', type: 'dendrite', strength: 0.48 },
  { label: "Le délai est serré.",                 category: 'work',     grammarDna: 'Description',  type: 'dendrite', strength: 0.45 },
  // Academic (16)
  { label: "Je comprends la grammaire.",          category: 'academic', grammarDna: 'Opinion-Inf',  type: 'soma',     strength: 0.70 },
  { label: "Qu'est-ce que ça veut dire ?",        category: 'academic', grammarDna: 'Identity-Q&A', type: 'soma',     strength: 0.65 },
  { label: "Je dois réviser mes notes.",          category: 'academic', grammarDna: 'Activity-Ext', type: 'dendrite', strength: 0.50 },
  { label: "L'examen est difficile.",             category: 'academic', grammarDna: 'Description',  type: 'dendrite', strength: 0.42 },
  { label: "Je voudrais apprendre le piano.",     category: 'academic', grammarDna: 'Opinion-Inf',  type: 'dendrite', strength: 0.44 },
  { label: "Le professeur explique bien.",        category: 'academic', grammarDna: 'Description',  type: 'dendrite', strength: 0.55 },
  { label: "Je lis beaucoup de livres.",          category: 'academic', grammarDna: 'Activity-Ext', type: 'soma',     strength: 0.62 },
  { label: "On a un contrôle demain.",            category: 'academic', grammarDna: 'Time-Q&A',     type: 'soma',     strength: 0.58 },
  { label: "J'ai besoin d'aide.",                 category: 'academic', grammarDna: 'Request',      type: 'soma',     strength: 0.60 },
  { label: "C'est une bonne question.",           category: 'academic', grammarDna: 'Description',  type: 'dendrite', strength: 0.48 },
  { label: "Je prends des cours particuliers.",   category: 'academic', grammarDna: 'Activity-Ext', type: 'dendrite', strength: 0.45 },
  { label: "La bibliothèque est ouverte.",        category: 'academic', grammarDna: 'Description',  type: 'dendrite', strength: 0.40 },
  { label: "Je cherche des ressources en ligne.", category: 'academic', grammarDna: 'Activity-Ext', type: 'soma',     strength: 0.52 },
  { label: "Mon niveau s'améliore.",              category: 'academic', grammarDna: 'Past-Tense',   type: 'dendrite', strength: 0.55 },
  { label: "Je participe en classe.",             category: 'academic', grammarDna: 'Activity-Ext', type: 'dendrite', strength: 0.50 },
  { label: "L'apprentissage prend du temps.",     category: 'academic', grammarDna: 'Description',  type: 'dendrite', strength: 0.42 },
  // Coding (16)
  { label: "J'écris du code en Python.",          category: 'coding',   grammarDna: 'Activity-Ext', type: 'soma',     strength: 0.80 },
  { label: "Il y a un bug dans le programme.",    category: 'coding',   grammarDna: 'Description',  type: 'soma',     strength: 0.75 },
  { label: "Je fais une pull request.",           category: 'coding',   grammarDna: 'Activity-Ext', type: 'dendrite', strength: 0.60 },
  { label: "Le déploiement est en cours.",        category: 'coding',   grammarDna: 'Past-Tense',   type: 'dendrite', strength: 0.50 },
  { label: "J'utilise React et TypeScript.",      category: 'coding',   grammarDna: 'Activity-Ext', type: 'dendrite', strength: 0.55 },
  { label: "Les tests passent au vert.",          category: 'coding',   grammarDna: 'Past-Tense',   type: 'dendrite', strength: 0.62 },
  { label: "Je revois le code.",                  category: 'coding',   grammarDna: 'Activity-Ext', type: 'soma',     strength: 0.68 },
  { label: "La documentation est à jour.",        category: 'coding',   grammarDna: 'Description',  type: 'dendrite', strength: 0.48 },
  { label: "On refactorise l'architecture.",      category: 'coding',   grammarDna: 'Activity-Ext', type: 'soma',     strength: 0.72 },
  { label: "Il faut optimiser les requêtes.",     category: 'coding',   grammarDna: 'Opinion-Inf',  type: 'soma',     strength: 0.65 },
  { label: "Le serveur répond en 50ms.",          category: 'coding',   grammarDna: 'Description',  type: 'dendrite', strength: 0.58 },
  { label: "Je configure l'environnement.",       category: 'coding',   grammarDna: 'Activity-Ext', type: 'dendrite', strength: 0.52 },
  { label: "L'API renvoie une erreur 404.",       category: 'coding',   grammarDna: 'Description',  type: 'soma',     strength: 0.70 },
  { label: "On automatise les déploiements.",     category: 'coding',   grammarDna: 'Activity-Ext', type: 'soma',     strength: 0.75 },
  { label: "Le code est bien structuré.",         category: 'coding',   grammarDna: 'Description',  type: 'dendrite', strength: 0.55 },
  { label: "Je fais du pair programming.",        category: 'coding',   grammarDna: 'Activity-Ext', type: 'dendrite', strength: 0.60 },
  // Other (16)
  { label: "Quelle belle journée !",              category: 'other',    grammarDna: 'Description',  type: 'soma',     strength: 0.68 },
  { label: "Je ne comprends pas.",                category: 'other',    grammarDna: 'Identity-Q&A', type: 'soma',     strength: 0.72 },
  { label: "Pouvez-vous répéter ?",               category: 'other',    grammarDna: 'Request',      type: 'soma',     strength: 0.75 },
  { label: "C'est intéressant.",                  category: 'other',    grammarDna: 'Description',  type: 'dendrite', strength: 0.55 },
  { label: "Je suis d'accord.",                   category: 'other',    grammarDna: 'Opinion-Inf',  type: 'dendrite', strength: 0.50 },
  { label: "Pas de problème !",                   category: 'other',    grammarDna: 'Greeting',     type: 'soma',     strength: 0.65 },
  { label: "Il y a quelque chose qui ne va pas.", category: 'other',    grammarDna: 'Description',  type: 'soma',     strength: 0.60 },
  { label: "Je dois y aller.",                    category: 'other',    grammarDna: 'Activity-Ext', type: 'dendrite', strength: 0.48 },
  { label: "C'est difficile à expliquer.",        category: 'other',    grammarDna: 'Description',  type: 'dendrite', strength: 0.42 },
  { label: "On verra plus tard.",                 category: 'other',    grammarDna: 'Time-Q&A',     type: 'dendrite', strength: 0.38 },
  { label: "Je ne sais pas encore.",              category: 'other',    grammarDna: 'Identity-Q&A', type: 'dendrite', strength: 0.40 },
  { label: "Ça dépend du contexte.",              category: 'other',    grammarDna: 'Description',  type: 'dendrite', strength: 0.45 },
  { label: "C'est à voir.",                       category: 'other',    grammarDna: 'Opinion-Inf',  type: 'dendrite', strength: 0.35 },
  { label: "Bonne chance !",                      category: 'other',    grammarDna: 'Greeting',     type: 'soma',     strength: 0.62 },
  { label: "Je réfléchis.",                       category: 'other',    grammarDna: 'Activity-Ext', type: 'dendrite', strength: 0.38 },
  { label: "D'accord, je comprends.",             category: 'other',    grammarDna: 'Greeting',     type: 'soma',     strength: 0.58 },
];

// Max count for the test generator
const TEST_POOL_MAX = 1000;

// Build a pool up to `count` entries by cycling BASE_POOL.
// Entries are interleaved across categories (round-robin deal) so the
// streaming animation looks like a real mixed conversation — not one
// category finishing before the next starts.
function buildTestPool(count: number): PoolEntry[] {
  // Group BASE_POOL by category and shuffle each group independently
  const byCategory = new Map<string, PoolEntry[]>();
  for (const entry of BASE_POOL) {
    if (!byCategory.has(entry.category)) byCategory.set(entry.category, []);
    byCategory.get(entry.category)!.push({ ...entry });
  }

  // Fisher-Yates shuffle each category deck
  function shuffleDeck<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  for (const deck of byCategory.values()) shuffleDeck(deck);

  // Round-robin interleave: deal one card from each category in turn.
  // When a deck runs out on repeated passes, vary strength to simulate
  // spaced-repetition re-encounters (no label suffixes).
  const decks = [...byCategory.values()];
  const cursors = new Array(decks.length).fill(0);
  const passes  = new Array(decks.length).fill(0);
  const result: PoolEntry[] = [];

  while (result.length < count) {
    for (let d = 0; d < decks.length; d++) {
      if (result.length >= count) break;
      if (cursors[d] >= decks[d].length) {
        // Deck exhausted — reshuffle and start another pass
        shuffleDeck(decks[d]);
        cursors[d] = 0;
        passes[d]++;
      }
      const entry = decks[d][cursors[d]++];
      const jitter = (Math.random() - 0.5) * 0.15;
      result.push({
        ...entry,
        strength: Math.min(1, Math.max(0.1, entry.strength + jitter - passes[d] * 0.05)),
      });
    }
  }
  return result;
}

// ── Chat message templates per category for streaming simulation ─────────
const CHAT_TEMPLATES: Record<string, string[]> = {
  daily:    ["J'ai dit « {label} » ce matin.", "Aujourd'hui j'ai pratiqué : « {label} »", "Phrase du jour : « {label} »"],
  social:   ["En conversation j'ai utilisé « {label} ».", "Nouveau pattern social : « {label} »", "Discussion sympa avec « {label} »"],
  travel:   ["En voyage j'ai dit « {label} ».", "Utile à l'aéroport : « {label} »", "À la gare : « {label} »"],
  work:     ["Au bureau : « {label} »", "En réunion j'ai dit « {label} ».", "Email professionnel : « {label} »"],
  academic: ["En cours : « {label} »", "Pour les études : « {label} »", "À l'examen : « {label} »"],
  coding:   ["En code review : « {label} »", "Au stand-up : « {label} »", "Dans le README : « {label} »"],
  other:    ["J'ai appris : « {label} »", "Nouvelle expression : « {label} »", "À retenir : « {label} »"],
};

function generateTestData(count: number): { neurons: Neuron[]; synapses: Synapse[] } {
  const pool = buildTestPool(count);

  const neurons: Neuron[] = pool.map((n, i) => ({
    id: `test_${i}_${i}`,
    label: n.label,
    type: n.type,
    potential: n.strength,
    strength: n.strength,
    usageCount: Math.ceil(n.strength * 8),
    category: n.category,
    grammarDna: n.grammarDna,
    isShadow: n.strength < 0.3,
    lastReviewed: Date.now() - Math.floor(Math.random() * 86400000),
  }));

  // ── Neural-web synapses (random graph, not ring/chain) ───────────────
  // Each node randomly connects to a handful of others in its category
  // (like real neural dendrites reaching out), plus a few cross-category
  // "long-range" bridges between soma anchor nodes.
  const byCategory = new Map<string, Neuron[]>();
  for (const n of neurons) {
    if (!byCategory.has(n.category)) byCategory.set(n.category, []);
    byCategory.get(n.category)!.push(n);
  }

  const synSet = new Set<string>();
  const synapses: Synapse[] = [];

  function addSyn(src: string, tgt: string, type: 'logical' | 'derivation', str: number) {
    if (src === tgt) return;
    const key = src < tgt ? `${src}|${tgt}` : `${tgt}|${src}`;
    if (synSet.has(key)) return;
    synSet.add(key);
    synapses.push({ source: src, target: tgt, strength: str, type });
  }

  // Fisher-Yates shuffle (pure random, no index-wrap ring)
  function shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  for (const [, group] of byCategory) {
    const g = group.length;
    // Each node connects to 2–5 randomly chosen peers (not positional neighbours)
    const degree = Math.min(5, Math.max(2, Math.round(Math.log2(g) + 1)));
    for (const node of group) {
      const candidates = shuffle(group.filter(n => n.id !== node.id)).slice(0, degree);
      for (const peer of candidates) {
        // soma→dendrite = logical, dendrite→dendrite = derivation
        const type: 'logical' | 'derivation' =
          node.type === 'soma' && peer.type === 'dendrite' ? 'logical' : 'derivation';
        addSyn(node.id, peer.id, type, 0.4 + Math.random() * 0.6);
      }
    }
  }

  // Cross-category long-range bridges (soma → random soma in another category)
  const allCats = [...byCategory.keys()];
  for (const cat of allCats) {
    const somas = byCategory.get(cat)!.filter(n => n.type === 'soma');
    const otherCats = allCats.filter(c => c !== cat);
    if (otherCats.length === 0 || somas.length === 0) continue;
    const bridgeCount = Math.max(1, Math.ceil(somas.length * 0.15));
    for (let b = 0; b < bridgeCount; b++) {
      const src = somas[Math.floor(Math.random() * somas.length)];
      const tgtCat = otherCats[Math.floor(Math.random() * otherCats.length)];
      const tgtGroup = byCategory.get(tgtCat)!;
      const tgt = tgtGroup[Math.floor(Math.random() * tgtGroup.length)];
      addSyn(src.id, tgt.id, 'derivation', 0.2 + Math.random() * 0.35);
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
  const [isDemoMode, setIsDemoMode] = useState(true);
  const [demoComplete, setDemoComplete] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [showTestPanel, setShowTestPanel] = useState(false);
  const [testCount, setTestCount] = useState(50);
  const [isStreaming, setIsStreaming] = useState(false);
  const streamIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // IDs of neurons that were just added this tick (start dimmed)
  const [streamingNewIds, setStreamingNewIds] = useState<Set<string>>(new Set());
  // IDs of already-existing neurons that are referenced by a brand-new synapse (lit up)
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set());
  const highlightClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // ── Dynamic categories derived from actual neurons ───────────────────
  const dynamicCategories = useMemo<('all' | Category)[]>(() => {
    if (state.neurons.length === 0) return ['all'];
    const found = [...new Set(state.neurons.map(n => n.category))] as Category[];
    // Sort by frequency descending
    const freq = found.sort((a, b) =>
      state.neurons.filter(n => n.category === b).length -
      state.neurons.filter(n => n.category === a).length
    );
    return ['all', ...freq];
  }, [state.neurons]);

  // ── Generate bulk test data with streaming animation ─────────────────
  const handleGenerateTest = useCallback((count: number) => {
    // Stop any previous stream
    if (streamIntervalRef.current) {
      clearInterval(streamIntervalRef.current);
      streamIntervalRef.current = null;
    }
    resetMockState();
    setDemoComplete(false);
    setShowTestPanel(false);
    setShowChat(true);
    setFilterCategory('all');
    setIsStreaming(true);

    const { neurons: allNeurons, synapses: allSynapses } = generateTestData(count);

    // Kick off with initial AI message
    const startMsg: Message = {
      id: `stream-start-${Date.now()}`,
      role: 'ai',
      text: `⚡ Starting simulation — generating ${allNeurons.length} neurons across ${[...new Set(allNeurons.map(n => n.category))].join(', ')}…`,
      timestamp: Date.now(),
    };
    setState({ neurons: [], synapses: [], messages: [...INITIAL_STATE.messages, startMsg] });

    // Stream: add a batch of neurons every interval
    // Larger counts get bigger batches to finish in reasonable time
    const batchSize = Math.max(1, Math.ceil(count / 80));  // ~80 steps total
    const intervalMs = count <= 100 ? 80 : count <= 300 ? 60 : 40;
    let cursor = 0;

    streamIntervalRef.current = setInterval(() => {
      cursor += batchSize;
      const prevSlice = allNeurons.slice(0, Math.min(cursor - batchSize, allNeurons.length));
      const prevIds = new Set(prevSlice.map(n => n.id));
      const slice = allNeurons.slice(0, Math.min(cursor, allNeurons.length));
      const sliceIds = new Set(slice.map(n => n.id));
      const synSlice = allSynapses.filter(s => sliceIds.has(s.source) && sliceIds.has(s.target));

      // New neurons added this tick
      const newBatch = allNeurons.slice(cursor - batchSize, Math.min(cursor, allNeurons.length));
      const newBatchIds = new Set(newBatch.map(n => n.id));

      // Old neurons that are referenced by a new synapse (source or target was already existing)
      const highlighted = new Set<string>();
      for (const s of synSlice) {
        const srcIsNew = newBatchIds.has(s.source);
        const tgtIsNew = newBatchIds.has(s.target);
        // Cross-batch synapse: one end is old, one is new → light up the old end
        if (srcIsNew && prevIds.has(s.target)) highlighted.add(s.target);
        if (tgtIsNew && prevIds.has(s.source)) highlighted.add(s.source);
      }

      setStreamingNewIds(newBatchIds);
      setHighlightedIds(highlighted);

      // Clear the highlight flash after 1.2× the interval so it fades before the next tick
      if (highlightClearRef.current) clearTimeout(highlightClearRef.current);
      highlightClearRef.current = setTimeout(() => {
        setStreamingNewIds(new Set());
        setHighlightedIds(new Set());
      }, intervalMs * 1.5);

      // Generate a chat message for the newly added batch
      const sampleNode = newBatch[0];
      const templates = CHAT_TEMPLATES[sampleNode?.category ?? 'other'] ?? CHAT_TEMPLATES['other'];
      const tpl = templates[Math.floor(Math.random() * templates.length)];
      const chatText = tpl.replace('{label}', sampleNode?.label ?? '');

      const newMsg: Message = {
        id: `stream-${cursor}-${Date.now()}`,
        role: cursor % 6 < 3 ? 'ai' : 'user',
        text: chatText,
        timestamp: Date.now(),
        analysis: cursor % 3 === 0 ? {
          vocabulary: newBatch.slice(0, 3).map(n => ({ word: n.label, translation: '', type: n.grammarDna, isNew: true })),
          newElements: [...new Set(newBatch.map(n => n.category))],
          level: 'A1–A2',
          progress: `${slice.length}/${allNeurons.length} neurons connected, ${synSlice.length} synapses active.`,
        } : undefined,
      };

      setState(prev => ({
        neurons: slice,
        synapses: synSlice,
        messages: [...prev.messages, newMsg],
      }));

      if (cursor >= allNeurons.length) {
        clearInterval(streamIntervalRef.current!);
        streamIntervalRef.current = null;
        setIsStreaming(false);
        setStreamingNewIds(new Set());
        setHighlightedIds(new Set());
        const doneMsg: Message = {
          id: `stream-done-${Date.now()}`,
          role: 'ai',
          text: `✓ Nebula complete — ${allNeurons.length} neurons, ${allSynapses.length} synapses across ${[...new Set(allNeurons.map(n => n.category))].length} categories. Explore & filter!`,
          timestamp: Date.now(),
        };
        setState(prev => ({ ...prev, messages: [...prev.messages, doneMsg] }));
      }
    }, intervalMs);
  }, []);

  // Stop streaming on unmount
  useEffect(() => {
    return () => {
      if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);
      if (highlightClearRef.current) clearTimeout(highlightClearRef.current);
    };
  }, []);

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
        ? `Neural Navigator reporting for duty! I notice your memory of "${dimmingNeurons[0].label}" is dimming. Shall we fly there for a quick review?`
        : "Neural Navigator online. All systems green. Where shall we explore today?";

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

        // In demo mode the mic is decorative — don't consume a turn on stop
        if (isDemoMode) {
          handleSend('[mock-advance]');
          return;
        }

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
      // Mic not available — in demo mode just advance the turn directly
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

  // ── Reset session ────────────────────────────────────────────────────
  const handleReset = async () => {
    // Stop any active streaming
    if (streamIntervalRef.current) {
      clearInterval(streamIntervalRef.current);
      streamIntervalRef.current = null;
      setIsStreaming(false);
    }
    // Stop any active recording first
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setIsListening(false);

    if (isUsingBackend()) {
      await resetSession();
    }
    resetMockState();
    setState(INITIAL_STATE);
    setDemoComplete(false);
    setSelectedNeuron(null);
    setSearchQuery('');
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
          streamingNewIds={streamingNewIds}
          highlightedIds={highlightedIds}
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
                        {dynamicCategories.map(cat => (
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
                  <button
                    onClick={() => setShowDashboard(!showDashboard)}
                    className={`p-2 rounded-full border transition-all ${
                      showDashboard
                        ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                        : 'bg-black/40 border-white/10 text-white/60 hover:bg-white/10'
                    }`}
                    title="View Holo-Galaxy Dashboard"
                  >
                    <BarChart3 size={20} />
                  </button>
                  {/* Test Data Generator button */}
                  <div className="relative">
                    <button
                      onClick={() => setShowTestPanel(p => !p)}
                      className={`p-2 rounded-full border transition-all ${
                        showTestPanel
                          ? 'bg-violet-500/20 border-violet-500/50 text-violet-400'
                          : 'bg-black/40 border-white/10 text-white/60 hover:bg-white/10'
                      }`}
                      title="Generate test data"
                    >
                      <FlaskConical size={20} />
                    </button>
                    <AnimatePresence>
                      {showTestPanel && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.9, y: -8 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.9, y: -8 }}
                          className="absolute right-0 top-12 w-64 bg-black/90 backdrop-blur-xl border border-violet-500/30 rounded-2xl p-4 shadow-2xl z-50"
                        >
                          <div className="flex items-center gap-2 mb-3">
                            <FlaskConical size={14} className="text-violet-400" />
                            <span className="text-xs font-bold uppercase tracking-widest text-violet-300">Test Data Generator</span>
                          </div>
                          <p className="text-[10px] text-white/40 mb-4 leading-relaxed">
                            Auto-generate realistic French learning neurons across multiple categories. Context Filter will update dynamically.
                          </p>
                          {isStreaming && (
                            <div className="flex items-center gap-2 mb-3 text-[10px] text-violet-300">
                              <span className="animate-pulse">●</span> Streaming in progress…
                            </div>
                          )}
                          <div className="mb-4">
                            <div className="flex justify-between text-[10px] text-white/50 mb-2 uppercase tracking-wider">
                              <span>Neuron count</span>
                              <span className="text-violet-400 font-mono font-bold">{testCount}</span>
                            </div>
                            <input
                              type="range" min={10} max={TEST_POOL_MAX} step={10}
                              value={testCount}
                              onChange={e => setTestCount(+e.target.value)}
                              className="w-full accent-violet-500 h-1 bg-white/10 rounded-full appearance-none cursor-pointer"
                            />
                            <div className="flex justify-between text-[9px] text-white/20 mt-1">
                              <span>10</span><span>{TEST_POOL_MAX} (max)</span>
                            </div>
                          </div>
                          {/* Quick presets */}
                          <div className="grid grid-cols-4 gap-1.5 mb-4">
                            {[50, 200, 500, TEST_POOL_MAX].map(n => (
                              <button key={n}
                                onClick={() => setTestCount(n)}
                                className={`text-[9px] py-1 rounded-lg border transition-all uppercase tracking-wider font-bold ${
                                  testCount === n
                                    ? 'bg-violet-500/20 border-violet-500/40 text-violet-300'
                                    : 'bg-white/5 border-white/10 text-white/30 hover:bg-white/10'
                                }`}
                              >
                                {n === TEST_POOL_MAX ? '1k' : n}
                              </button>
                            ))}
                          </div>
                          <button
                            onClick={() => handleGenerateTest(testCount)}
                            disabled={isStreaming}
                            className="w-full py-2.5 bg-violet-500 hover:bg-violet-400 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-all shadow-[0_0_20px_rgba(139,92,246,0.3)]"
                          >
                            {isStreaming ? '⏳ Generating…' : '✦ Generate Nebula'}
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <button
                    onClick={handleReset}
                    className="p-2 rounded-full border transition-all bg-black/40 border-white/10 text-white/60 hover:bg-white/10"
                    title="Reset session"
                  >
                    <RefreshCw size={18} />
                  </button>
                </div>
              </div>
            </div>
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
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] pointer-events-auto"
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

      {/* Chat Interface (Right 1/3) */}
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
                  isFlying ? 'bg-blue-500/20 border-blue-500/30' : 'bg-emerald-500/20 border-emerald-500/30'
                }`}>
                  {isFlying ? <Plane className="text-blue-400" size={18} /> : <MessageSquare className="text-emerald-400" size={18} />}
                </div>
                <h2 className="font-bold text-lg">{isFlying ? 'Neural Navigator' : 'Neural Dialogue'}</h2>
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

            {/* Chat Input Area */}
            <div className="p-6 bg-white/5 border-t border-white/10">
              <div className="flex flex-col gap-3">
                {/* Text input */}
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

                {/* Voice button */}
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
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dashboard Modal */}
      <Dashboard isOpen={showDashboard} onClose={() => setShowDashboard(false)} />
    </div>
  );
}
