/**
 * API service layer for Neural-Sync Language Lab.
 *
 * Provides:
 *  - WebSocket connection manager for real-time conversation at /ws/conversation
 *  - REST fetch wrappers for Knowledge Graph and session endpoints
 *
 * All URLs default to localhost:8000 (the FastAPI backend).
 */

const API_BASE = 'http://localhost:8000';
const WS_URL = 'ws://localhost:8000/ws/conversation';

/** Default reconnect delay in milliseconds. */
const RECONNECT_DELAY_MS = 2000;

// ── WebSocket Connection Manager ─────────────────────────────────────

/**
 * Create a managed WebSocket connection to the conversation endpoint.
 *
 * Automatically reconnects on unexpected disconnects and provides
 * lifecycle callbacks so the UI can react to connection state changes.
 *
 * @param {Object}   callbacks
 * @param {Function} callbacks.onMessage   - Called with parsed JSON for every server message.
 * @param {Function} [callbacks.onOpen]    - Called when the connection is established.
 * @param {Function} [callbacks.onClose]   - Called when the connection closes (with reconnect flag).
 * @param {Function} [callbacks.onError]   - Called on WebSocket errors.
 * @returns {{ send: Function, close: Function }} Control handle.
 */
export function createConversationSocket({
  onMessage,
  onOpen,
  onClose,
  onError,
}) {
  let ws = null;
  let shouldReconnect = true;
  let reconnectTimer = null;

  function connect() {
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      if (onOpen) onOpen();
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage(data);
      } catch {
        // Non-JSON payload — ignore gracefully.
      }
    };

    ws.onerror = (event) => {
      if (onError) onError(event);
    };

    ws.onclose = () => {
      if (onClose) onClose({ willReconnect: shouldReconnect });

      if (shouldReconnect) {
        reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
      }
    };
  }

  connect();

  return {
    /**
     * Send a message to the conversation WebSocket.
     *
     * @param {Object} message - The message payload (will be JSON-serialized).
     *   Expected shapes:
     *     { type: "text",  content: "Bonjour" }
     *     { type: "audio", content: "<base64>" }
     */
    send(message) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    },

    /**
     * Permanently close the WebSocket connection (no auto-reconnect).
     */
    close() {
      shouldReconnect = false;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (ws) {
        ws.close();
        ws = null;
      }
    },
  };
}

// ── REST API Wrappers ────────────────────────────────────────────────

/**
 * Fetch Knowledge Graph data (nodes + links) from the backend.
 *
 * Both requests run in parallel for faster loading.
 *
 * @returns {Promise<{ nodes: Array, links: Array }>}
 */
export async function fetchGraphData() {
  const [nodesRes, linksRes] = await Promise.all([
    fetch(`${API_BASE}/api/graph/nodes`),
    fetch(`${API_BASE}/api/graph/links`),
  ]);

  if (!nodesRes.ok) {
    throw new Error(`Failed to fetch graph nodes: ${nodesRes.status}`);
  }
  if (!linksRes.ok) {
    throw new Error(`Failed to fetch graph links: ${linksRes.status}`);
  }

  const [nodes, links] = await Promise.all([
    nodesRes.json(),
    linksRes.json(),
  ]);

  return { nodes, links };
}

/**
 * Fetch the current session state from the backend.
 *
 * @returns {Promise<{
 *   turn: number,
 *   level: string,
 *   mastery_scores: Object,
 *   conversation_history: Array,
 *   demo_complete: boolean
 * }>}
 */
export async function fetchSessionState() {
  const res = await fetch(`${API_BASE}/api/session/state`);

  if (!res.ok) {
    throw new Error(`Failed to fetch session state: ${res.status}`);
  }

  return res.json();
}

/**
 * Reset the backend session to initial state (turn 1, level A1).
 *
 * @returns {Promise<{ status: string, turn: number }>}
 */
export async function resetSession() {
  const res = await fetch(`${API_BASE}/api/session/reset`, {
    method: 'POST',
  });

  if (!res.ok) {
    throw new Error(`Failed to reset session: ${res.status}`);
  }

  return res.json();
}
