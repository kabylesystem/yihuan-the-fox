/**
 * Backend integration service for Echo Neural Language Lab.
 *
 * Connects to the FastAPI backend via:
 *  - WebSocket at /ws/conversation for real-time conversation turns
 *  - REST endpoints for graph data and session management
 *
 * Handles status messages from the backend during processing.
 */

import { Neuron, Synapse, Message, Category } from '../types';

// ── Configuration ────────────────────────────────────────────────────────

function getBaseUrl(): string {
  return import.meta.env.VITE_BACKEND_URL || '';
}

function getWsUrl(): string {
  const base = getBaseUrl();
  if (base) {
    return base.replace(/^http/, 'ws') + '/ws/conversation';
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws/conversation`;
}

// ── Data Mapping: Backend → Frontend types ───────────────────────────────

function mapNodeToNeuron(node: any): Neuron {
  const typeMap: Record<string, 'soma' | 'dendrite'> = {
    sentence: 'soma',
    grammar: 'soma',
    vocab: 'dendrite',
  };
  const categoryFromLevel: Record<string, Category> = {
    A1: 'daily',
    'A1+': 'social',
    A2: 'academic',
    B1: 'work',
    B2: 'travel',
  };

  return {
    id: node.id,
    label: node.label,
    type: typeMap[node.type] || 'dendrite',
    potential: node.mastery,
    strength: node.mastery,
    usageCount: Math.ceil(node.mastery * 5),
    category: categoryFromLevel[node.level] || 'daily',
    grammarDna: node.type === 'grammar' ? 'Grammar' : node.type === 'sentence' ? 'SVO' : 'Vocab',
    isShadow: node.mastery < 0.3,
    lastReviewed: Date.now(),
  };
}

function mapLinkToSynapse(link: any): Synapse {
  const typeMap: Record<string, 'logical' | 'derivation'> = {
    prerequisite: 'logical',
    conjugation: 'logical',
    semantic: 'derivation',
    reactivation: 'derivation',
  };

  return {
    source: link.source,
    target: link.target,
    strength: 0.7,
    type: typeMap[link.relationship] || 'logical',
  };
}

export function mapTurnToMessages(turn: any, existingMessages: Message[]): Message[] {
  const ts = Date.now();
  const resp = turn.response;

  const userMsg: Message = {
    id: `user-${ts}`,
    role: 'user',
    text: turn.user_said,
    timestamp: ts,
  };

  const aiMsg: Message = {
    id: `ai-${ts}`,
    role: 'ai',
    text: resp.spoken_response,
    timestamp: ts + 1,
    analysis: {
      vocabulary: (resp.vocabulary_breakdown || []).map((v: any) => ({
        word: v.word,
        translation: v.translation,
        type: v.part_of_speech,
        isNew: (resp.new_elements || []).some(
          (e: string) => v.word.includes(e) || e.includes(v.word)
        ),
      })),
      newElements: resp.new_elements || [],
      level: resp.user_level_assessment || 'A1',
      progress: resp.border_update || '',
    },
  };

  return [...existingMessages, userMsg, aiMsg];
}

// ── WebSocket management ─────────────────────────────────────────────────

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'failed';

type PendingResolve = {
  resolve: (data: any) => void;
  reject: (err: Error) => void;
};

let ws: WebSocket | null = null;
let reconnectAttempts = 0;
let connectionStatus: ConnectionStatus = 'disconnected';
let statusCallback: ((s: ConnectionStatus) => void) | null = null;
let statusStepCallback: ((step: string) => void) | null = null;
let ttsCallback: ((tts: any) => void) | null = null;
let pendingRequest: PendingResolve | null = null;

const MAX_RECONNECTS = 5;

function setStatus(s: ConnectionStatus) {
  connectionStatus = s;
  statusCallback?.(s);
}

export function onConnectionStatusChange(cb: (s: ConnectionStatus) => void) {
  statusCallback = cb;
}

/** Register a callback for backend processing status updates (transcribing/thinking/speaking). */
export function onStatusStep(cb: (step: string) => void) {
  statusStepCallback = cb;
}

/** Register a callback for TTS audio that arrives after the text response. */
export function onTTS(cb: (tts: any) => void) {
  ttsCallback = cb;
}

export function getConnectionStatus(): ConnectionStatus {
  return connectionStatus;
}

export function connect(): Promise<boolean> {
  return new Promise((resolve) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      resolve(true);
      return;
    }
    if (ws && ws.readyState === WebSocket.CONNECTING) {
      const check = setInterval(() => {
        if (!ws || ws.readyState === WebSocket.OPEN) {
          clearInterval(check);
          resolve(ws?.readyState === WebSocket.OPEN || false);
        } else if (ws.readyState >= WebSocket.CLOSING) {
          clearInterval(check);
          resolve(false);
        }
      }, 100);
      return;
    }

    setStatus('connecting');
    const url = getWsUrl();

    try {
      ws = new WebSocket(url);
    } catch {
      setStatus('failed');
      resolve(false);
      return;
    }

    const timeout = setTimeout(() => {
      if (ws && ws.readyState !== WebSocket.OPEN) {
        ws.close();
        setStatus('failed');
        resolve(false);
      }
    }, 5000);

    ws.onopen = () => {
      clearTimeout(timeout);
      reconnectAttempts = 0;
      setStatus('connected');
      resolve(true);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // Status messages are progress updates — don't resolve the pending request
        if (data.type === 'status') {
          statusStepCallback?.(data.step || '');
          return;
        }

        // TTS audio arrives after the text response — play it via callback
        if (data.type === 'tts') {
          ttsCallback?.(data.tts);
          return;
        }

        // All other messages resolve the pending request
        if (pendingRequest) {
          const { resolve: res } = pendingRequest;
          pendingRequest = null;
          res(data);
        }
      } catch {
        if (pendingRequest) {
          pendingRequest.reject(new Error('Failed to parse server response'));
          pendingRequest = null;
        }
      }
    };

    ws.onclose = () => {
      clearTimeout(timeout);
      ws = null;
      if (pendingRequest) {
        pendingRequest.reject(new Error('WebSocket closed'));
        pendingRequest = null;
      }
      if (reconnectAttempts < MAX_RECONNECTS && connectionStatus !== 'failed') {
        reconnectAttempts++;
        setStatus('reconnecting');
        setTimeout(() => connect(), 1000 * reconnectAttempts);
      } else {
        setStatus('disconnected');
      }
    };

    ws.onerror = () => {
      // onclose will fire after this
    };
  });
}

export function disconnect() {
  reconnectAttempts = MAX_RECONNECTS;
  if (ws) {
    ws.close();
    ws = null;
  }
  setStatus('disconnected');
}

/**
 * Send a message through the WebSocket and wait for a response.
 * Auto-reconnects if the WebSocket is not open.
 */
export async function sendMessage(content: string, type: 'text' | 'audio' = 'text'): Promise<any> {
  // Auto-reconnect if needed
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    const reconnected = await connect();
    if (!reconnected) {
      throw new Error('Cannot connect to backend');
    }
  }

  return new Promise((resolve, reject) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      reject(new Error('Not connected'));
      return;
    }
    pendingRequest = { resolve, reject };
    ws.send(JSON.stringify({ type, content }));

    // Timeout after 20s
    setTimeout(() => {
      if (pendingRequest) {
        pendingRequest.reject(new Error('Request timeout — backend took too long'));
        pendingRequest = null;
      }
    }, 20000);
  });
}

// ── REST API ─────────────────────────────────────────────────────────────

export async function fetchGraphData(): Promise<{ neurons: Neuron[]; synapses: Synapse[] }> {
  const base = getBaseUrl();
  try {
    const [nodesRes, linksRes] = await Promise.all([
      fetch(`${base}/api/graph/nodes`),
      fetch(`${base}/api/graph/links`),
    ]);

    if (!nodesRes.ok || !linksRes.ok) throw new Error('API error');

    const nodes = await nodesRes.json();
    const links = await linksRes.json();

    return {
      neurons: nodes.map(mapNodeToNeuron),
      synapses: links.map(mapLinkToSynapse),
    };
  } catch {
    return { neurons: [], synapses: [] };
  }
}

export async function fetchSessionState(): Promise<any> {
  const base = getBaseUrl();
  try {
    const res = await fetch(`${base}/api/session/state`);
    if (!res.ok) throw new Error('API error');
    return await res.json();
  } catch {
    return null;
  }
}

export async function resetSession(): Promise<boolean> {
  const base = getBaseUrl();
  try {
    const res = await fetch(`${base}/api/session/reset`, { method: 'POST' });
    return res.ok;
  } catch {
    return false;
  }
}

export async function isBackendAvailable(): Promise<boolean> {
  const base = getBaseUrl();
  try {
    const res = await fetch(`${base}/api/session/state`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}
