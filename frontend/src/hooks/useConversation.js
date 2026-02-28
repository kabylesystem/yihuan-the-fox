/**
 * Custom hook managing real-time conversation with the AI tutor.
 *
 * Responsibilities:
 *  - Opens and manages the WebSocket connection via createConversationSocket
 *  - Tracks conversation history (array of ConversationTurn objects)
 *  - Tracks current turn number, CEFR level, and demo-complete state
 *  - Exposes sendMessage() to push user text into the conversation pipeline
 *  - Plays tutor TTS responses via the browser SpeechSynthesis wrapper
 *  - Handles connection state (connected, reconnecting, error)
 *  - Provides resetConversation() to clear state and hit the reset endpoint
 *
 * Data shapes (from backend):
 *   turn_response  -> { type, turn: ConversationTurn, tts, session }
 *   demo_complete  -> { type, message }
 *   error          -> { type, message }
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { createConversationSocket, resetSession, fetchSessionState } from '../services/api';
import { speak, stopSpeaking } from '../services/tts';

/**
 * @typedef {'disconnected' | 'connected' | 'reconnecting' | 'error'} ConnectionStatus
 */

/**
 * Custom hook for managing the conversation lifecycle.
 *
 * @returns {{
 *   conversationHistory: Array,
 *   currentTurn: number,
 *   level: string,
 *   demoComplete: boolean,
 *   connectionStatus: ConnectionStatus,
 *   isProcessing: boolean,
 *   error: string | null,
 *   sendMessage: (text: string) => void,
 *   resetConversation: () => Promise<void>,
 * }}
 */
export function useConversation() {
  // ── State ──────────────────────────────────────────────────────────
  const [conversationHistory, setConversationHistory] = useState([]);
  const [currentTurn, setCurrentTurn] = useState(1);
  const [level, setLevel] = useState('A1');
  const [demoComplete, setDemoComplete] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);

  // ── Refs (stable across renders) ───────────────────────────────────
  const socketRef = useRef(null);

  // ── WebSocket lifecycle ────────────────────────────────────────────
  useEffect(() => {
    const socket = createConversationSocket({
      onOpen() {
        setConnectionStatus('connected');
        setError(null);
      },

      onMessage(data) {
        handleServerMessage(data);
      },

      onClose({ willReconnect }) {
        setConnectionStatus(willReconnect ? 'reconnecting' : 'disconnected');
      },

      onError() {
        setConnectionStatus('error');
      },
    });

    socketRef.current = socket;

    // Hydrate from existing session state in case of page refresh
    fetchSessionState()
      .then((state) => {
        if (state.conversation_history && state.conversation_history.length > 0) {
          setConversationHistory(state.conversation_history);
          setCurrentTurn(state.turn);
          setLevel(state.level);
          setDemoComplete(state.demo_complete);
        }
      })
      .catch(() => {
        // Backend may not be available yet — socket will auto-reconnect.
      });

    return () => {
      stopSpeaking();
      socket.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Server message handler ─────────────────────────────────────────

  /**
   * Route incoming WebSocket messages to the appropriate state update.
   *
   * @param {Object} data - Parsed JSON message from the server.
   */
  function handleServerMessage(data) {
    switch (data.type) {
      case 'turn_response':
        handleTurnResponse(data);
        break;

      case 'demo_complete':
        setDemoComplete(true);
        setIsProcessing(false);
        break;

      case 'error':
        setError(data.message || 'An error occurred');
        setIsProcessing(false);
        break;

      default:
        break;
    }
  }

  /**
   * Handle a successful turn response from the server.
   *
   * Updates conversation history, session metadata, and triggers TTS
   * playback of the tutor's spoken response.
   *
   * @param {Object} data - The full turn_response payload.
   */
  function handleTurnResponse(data) {
    const { turn, tts, session } = data;

    // Append the completed turn to history
    setConversationHistory((prev) => [...prev, turn]);

    // Update session metadata
    if (session) {
      setCurrentTurn(session.turn);
      setLevel(session.level);
      if (session.demo_complete) {
        setDemoComplete(true);
      }
    }

    setIsProcessing(false);
    setError(null);

    // ── TTS playback ─────────────────────────────────────────────
    // In mock mode the backend returns { mode: "browser", text: "..." }
    // telling us to use browser SpeechSynthesis. In real mode it would
    // return { mode: "audio", audio_base64: "..." } — handled later.
    if (tts && tts.mode === 'browser' && tts.text) {
      speak(tts.text);
    }
  }

  // ── Public API ─────────────────────────────────────────────────────

  /**
   * Send a user message to the conversation WebSocket.
   *
   * @param {string} text - The user's French text (or any text in mock mode).
   */
  const sendMessage = useCallback((text) => {
    if (!text || typeof text !== 'string' || text.trim().length === 0) return;

    // Guard: only send if the socket is available
    if (!socketRef.current) {
      setError('Not connected to server');
      return;
    }

    setIsProcessing(true);
    setError(null);

    // Stop any in-progress TTS from the previous turn
    stopSpeaking();

    socketRef.current.send({ type: 'text', content: text.trim() });
  }, []);

  /**
   * Reset the conversation to initial state.
   *
   * Hits the backend reset endpoint and clears all local state.
   */
  const resetConversation = useCallback(async () => {
    try {
      stopSpeaking();
      await resetSession();

      setConversationHistory([]);
      setCurrentTurn(1);
      setLevel('A1');
      setDemoComplete(false);
      setIsProcessing(false);
      setError(null);
    } catch (err) {
      setError('Failed to reset session');
    }
  }, []);

  return {
    conversationHistory,
    currentTurn,
    level,
    demoComplete,
    connectionStatus,
    isProcessing,
    error,
    sendMessage,
    resetConversation,
  };
}
