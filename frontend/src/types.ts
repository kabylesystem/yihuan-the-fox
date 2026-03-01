export type NeuronType = 'soma' | 'dendrite';
export type Category = 'work' | 'daily' | 'travel' | 'social' | 'academic' | 'coding' | 'other';
export type NodeKind = 'vocab' | 'sentence' | 'grammar';
export type LinkKind = 'semantic' | 'conjugation' | 'prerequisite' | 'reactivation' | 'mission';

export interface Neuron {
  id: string;
  label: string;
  type: NeuronType;
  nodeKind: NodeKind; // original type from backend
  potential: number; // 0 to 1 (current activation)
  strength: number;  // 0 to 1 (long term memory / mastery)
  usageCount: number;
  category: Category;
  grammarDna: string;
  isShadow?: boolean;
  isNew?: boolean;
  justUsed?: boolean; // word was just used by learner in current turn
  lastReviewed: number;
  x?: number;
  y?: number;
  z?: number;
  vx?: number;
  vy?: number;
  vz?: number;
}

export interface Synapse {
  source: string;
  target: string;
  strength: number; // 0 to 1
  linkKind: LinkKind; // semantic meaning of the connection
  reason?: string;
  reasonDetail?: string;
  evidenceUnits?: string[];
  type?: 'logical' | 'derivation'; // kept for backwards compat
  isNew?: boolean;
}

export interface Message {
  id: string;
  role: 'user' | 'ai';
  text: string;
  timestamp: number;
  correctedForm?: string;
  analysis?: {
    vocabulary: { word: string; translation: string; type: string; isNew: boolean }[];
    newElements: string[];
    level: string;
    progress: string;
    qualityScore?: number;
    acceptedUnits?: string[];
    rejectedUnits?: string[];
    canonicalUnits?: { text: string; kind: string; canonicalKey: string }[];
    missionHint?: string;
    missionProgress?: { done: number; total: number; percent: number };
    missionTasks?: { id: string; label: string; done: boolean }[];
    latencyMs?: { stt: number; llm: number; total: number };
  };
}

export interface NebulaState {
  neurons: Neuron[];
  synapses: Synapse[];
  messages: Message[];
}
