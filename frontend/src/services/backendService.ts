/**
 * Backend integration service for Echo Neural Language Lab.
 *
 * Connects to the FastAPI backend via:
 *  - WebSocket at /ws/conversation for real-time conversation turns
 *  - REST endpoints for graph data and session management
 *
 * Handles status messages from the backend during processing.
 */

import { Neuron, Synapse, Message, Category, NodeKind, LinkKind } from '../types';

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

function normalizeToken(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferCategoryFromLabel(label: string, nodeKind: NodeKind): Category {
  const t = normalizeToken(label);
  if (!t) return 'other';
  if (nodeKind === 'grammar') return 'academic';

  const social = ['bonjour', 'salut', 'ca va', 'comment ca va', 'merci', 'au revoir', "je m'appelle", 'mon prenom'];
  const travel = ['hotel', 'gare', 'aeroport', 'voyage', 'train', 'metro', 'bus', 'avion', 'ticket', 'paris', 'ville', 'pays'];
  const work = ['travail', 'bureau', 'reunion', 'projet', 'client', 'manager', 'job', 'metier', 'collegue', 'entreprise'];
  const coding = ['code', 'coder', 'bug', 'api', 'javascript', 'python', 'git', 'frontend', 'backend', 'devops'];
  const academic = ['ecole', 'universite', 'professeur', 'classe', 'devoir', 'examen', 'etudier', 'cours', 'grammaire'];
  const daily = ['manger', 'boire', 'dormir', 'famille', 'maison', 'cuisine', 'sport', "j'aime", "j'ai envie", "j'habite", "je suis"];

  const hasAny = (list: string[]) => list.some((w) => t.includes(w));
  if (hasAny(coding)) return 'coding';
  if (hasAny(work)) return 'work';
  if (hasAny(travel)) return 'travel';
  if (hasAny(academic)) return 'academic';
  if (hasAny(social)) return 'social';
  if (hasAny(daily)) return 'daily';
  return 'other';
}

function mapNodeToNeuron(node: any): Neuron {
  const typeMap: Record<string, 'soma' | 'dendrite'> = {
    sentence: 'soma',
    grammar: 'soma',
    vocab: 'dendrite',
  };
  const kindMap: Record<string, NodeKind> = {
    sentence: 'sentence',
    grammar: 'grammar',
    vocab: 'vocab',
  };
  const kind = kindMap[node.type] || 'vocab';

  return {
    id: node.id,
    label: node.label,
    type: typeMap[node.type] || 'dendrite',
    nodeKind: kind,
    potential: node.mastery,
    strength: node.mastery,
    usageCount: node.usage_count ?? 1,
    category: inferCategoryFromLabel(node.label, kind),
    grammarDna: node.type === 'grammar' ? 'Grammar' : node.type === 'sentence' ? 'SVO' : 'Vocab',
    isShadow: node.mastery < 0.3,
    lastReviewed: Date.now() - Math.max(0, (1 - node.mastery) * 1000 * 60 * 60 * 6),
  };
}

function mapLinkToSynapse(link: any): Synapse {
  const kindMap: Record<string, LinkKind> = {
    prerequisite: 'prerequisite',
    conjugation: 'conjugation',
    semantic: 'semantic',
    reactivation: 'reactivation',
    mission: 'mission',
  };

  return {
    source: link.source,
    target: link.target,
    strength: 0.7,
    linkKind: kindMap[link.relationship] || 'semantic',
    reason: link.reason || link.relationship || 'semantic',
    reasonDetail: link.reason_detail || '',
    evidenceUnits: Array.isArray(link.evidence_units) ? link.evidence_units : [],
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
    correctedForm: resp.corrected_form || '',
    analysis: {
      vocabulary: ((resp.validated_user_units || []).filter((u: any) => u?.is_accepted)).map((u: any) => {
        const matched = (resp.vocabulary_breakdown || []).find((v: any) => (v?.word || '').toLowerCase() === (u?.text || '').toLowerCase());
        return {
          word: u.text,
          translation: matched?.translation || '',
          type: u.kind || 'unit',
          isNew: true,
        };
      }),
      newElements: resp.new_elements || [],
      level: resp.user_level_assessment || 'A1',
      progress: resp.border_update || '',
      qualityScore: typeof resp.quality_score === 'number' ? resp.quality_score : undefined,
      acceptedUnits: (resp.validated_user_units || []).filter((u: any) => u?.is_accepted).map((u: any) => u.text),
      rejectedUnits: (resp.validated_user_units || []).filter((u: any) => !u?.is_accepted).map((u: any) => u.text),
      canonicalUnits: (resp.validated_user_units || [])
        .filter((u: any) => u?.is_accepted)
        .map((u: any) => ({ text: u.text, kind: u.kind, canonicalKey: u.canonical_key || '' })),
      missionHint: resp.next_mission_hint || '',
      missionProgress: resp.mission_progress || undefined,
      missionTasks: resp.mission_tasks || undefined,
      latencyMs: resp.latency_ms || undefined,
    },
  };

  return [...existingMessages, userMsg, aiMsg];
}

// ── WebSocket management ─────────────────────────────────────────────────

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'failed';

type PendingResolve = {
  resolve: (data: any) => void;
  reject: (err: Error) => void;
  requestId: number;
  timeoutId: ReturnType<typeof setTimeout> | null;
};

let ws: WebSocket | null = null;
let reconnectAttempts = 0;
let connectionStatus: ConnectionStatus = 'disconnected';
let statusCallback: ((s: ConnectionStatus) => void) | null = null;
let statusStepCallback: ((step: string) => void) | null = null;
let ttsCallback: ((tts: any) => void) | null = null;
let pendingRequest: PendingResolve | null = null;
let requestSeq = 0;

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
          const { resolve: res, timeoutId } = pendingRequest;
          if (timeoutId) clearTimeout(timeoutId);
          pendingRequest = null;
          res(data);
        }
      } catch {
        if (pendingRequest) {
          if (pendingRequest.timeoutId) clearTimeout(pendingRequest.timeoutId);
          pendingRequest.reject(new Error('Failed to parse server response'));
          pendingRequest = null;
        }
      }
    };

    ws.onclose = () => {
      clearTimeout(timeout);
      ws = null;
      if (pendingRequest) {
        if (pendingRequest.timeoutId) clearTimeout(pendingRequest.timeoutId);
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
    const requestId = ++requestSeq;
    const timeoutMs = type === 'audio' ? 60000 : 30000;
    pendingRequest = { resolve, reject, requestId, timeoutId: null };
    ws.send(JSON.stringify({ type, content, mission_context: (window as any).__echeMissionContext || undefined }));

    // Per-request timeout guarded by requestId to avoid old timers cancelling new requests.
    const timeoutId = setTimeout(() => {
      if (pendingRequest && pendingRequest.requestId === requestId) {
        pendingRequest.reject(new Error('Request timeout — backend took too long'));
        pendingRequest = null;
      }
    }, timeoutMs);
    pendingRequest.timeoutId = timeoutId;
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

export async function hardResetSession(): Promise<boolean> {
  const base = getBaseUrl();
  try {
    const res = await fetch(`${base}/api/session/reset-hard`, { method: 'POST' });
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
