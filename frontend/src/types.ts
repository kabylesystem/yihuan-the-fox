export type NeuronType = 'soma' | 'dendrite';
export type Category = 'work' | 'daily' | 'travel' | 'social' | 'academic' | 'coding' | 'other';

export interface Neuron {
  id: string;
  label: string;
  type: NeuronType;
  potential: number; // 0 to 1 (current activation)
  strength: number;  // 0 to 1 (long term memory)
  usageCount: number; // How many times this phrase has been used
  category: Category;
  grammarDna: string; // e.g., "SVO", "Modal+Verb"
  isShadow?: boolean; // i+1 potential expansion
  lastReviewed: number; // timestamp
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
  type?: 'logical' | 'derivation';
}

export interface Message {
  id: string;
  role: 'user' | 'ai';
  text: string;
  timestamp: number;
  analysis?: {
    vocabulary: { word: string; translation: string; type: string; isNew: boolean }[];
    newElements: string[];
    level: string;
    progress: string;
  };
}

export interface NebulaState {
  neurons: Neuron[];
  synapses: Synapse[];
  messages: Message[];
}
