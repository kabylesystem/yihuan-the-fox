/**
 * App — Root component for Neural-Sync Language Lab.
 *
 * Layout: Two-column split.
 *  - Left panel:  Voice controls, transcript display, conversation history
 *  - Right panel: Knowledge Graph visualization, learner progress dashboard
 *
 * Wires together all hooks and components:
 *  - useConversation: manages WebSocket, conversation state, TTS
 *  - useKnowledgeGraph: fetches graph data (auto-refreshes per turn)
 *
 * Components:
 *  - VoiceRecorder: mic button with MediaRecorder / mock advance
 *  - TranscriptDisplay: partial / final transcript display
 *  - ConversationPanel: full conversation turn history
 *  - KnowledgeGraph: D3.js force-directed graph visualization
 *  - LearnerProgress: CEFR level badge, mastery bars, border update
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useConversation } from './hooks/useConversation';
import { useKnowledgeGraph } from './hooks/useKnowledgeGraph';
import VoiceRecorder from './components/VoiceRecorder';
import TranscriptDisplay from './components/TranscriptDisplay';
import ConversationPanel from './components/ConversationPanel';
import KnowledgeGraph from './components/KnowledgeGraph';
import LearnerProgress from './components/LearnerProgress';
import SessionBar from './components/SessionBar';
import './App.css';

function App() {
  // ── Conversation state (WebSocket + turn tracking) ────────────────
  const {
    conversationHistory,
    currentTurn,
    level,
    demoComplete,
    connectionStatus,
    isProcessing,
    error,
    sendMessage,
    resetConversation,
  } = useConversation();

  // ── Knowledge Graph data (auto-refreshes on turn change) ──────────
  const {
    nodes,
    links,
    error: graphError,
    refetch: refetchGraph,
  } = useKnowledgeGraph(currentTurn);

  // ── Transcript state for real-time STT display ────────────────────
  const [transcript, setTranscript] = useState({ status: 'idle', text: '' });
  const prevIsProcessing = useRef(false);

  // Reset transcript to idle when processing completes (turn response received)
  useEffect(() => {
    if (prevIsProcessing.current && !isProcessing) {
      setTranscript({ status: 'idle', text: '' });
    }
    prevIsProcessing.current = isProcessing;
  }, [isProcessing]);

  /**
   * Handle transcript updates from VoiceRecorder.
   */
  const handleTranscriptUpdate = useCallback((update) => {
    setTranscript(update);
  }, []);

  /**
   * Reset the full session — conversation, graph, transcript.
   */
  const handleReset = useCallback(async () => {
    await resetConversation();
    setTranscript({ status: 'idle', text: '' });
    // Refetch graph after backend state is cleared
    refetchGraph();
  }, [resetConversation, refetchGraph]);

  // ── Derive learner progress data from latest turn ─────────────────
  const latestTurn = conversationHistory.length > 0
    ? conversationHistory[conversationHistory.length - 1]
    : null;
  const masteryScores = latestTurn?.response?.mastery_scores || {};
  const borderUpdate = latestTurn?.response?.border_update || '';

  // ── Connection status banner ──────────────────────────────────────
  const showConnectionBanner =
    connectionStatus === 'disconnected' ||
    connectionStatus === 'reconnecting' ||
    connectionStatus === 'error';

  return (
    <div className="app">
      {/* Connection status banner */}
      {showConnectionBanner && (
        <div className={`app__connection-banner app__connection-banner--${connectionStatus}`}>
          <span className="app__connection-icon">
            {connectionStatus === 'reconnecting' ? '🔄' : '⚠️'}
          </span>
          <span className="app__connection-text">
            {connectionStatus === 'reconnecting'
              ? 'Reconnecting to server...'
              : connectionStatus === 'error'
                ? 'Connection error — check if the backend is running on port 8000'
                : 'Disconnected from server'}
          </span>
        </div>
      )}

      {/* Header */}
      <header className="app__header">
        <div className="app__header-content">
          <div className="app__branding">
            <span className="app__logo">🧠</span>
            <h1 className="app__title">Neural-Sync Language Lab</h1>
            <span className="app__subtitle">Adaptive French Tutor</span>
          </div>
          <div className="app__controls">
            {connectionStatus === 'connected' && (
              <span className="app__status-dot app__status-dot--connected" />
            )}
            <button
              className="app__reset-button"
              onClick={handleReset}
              disabled={isProcessing || conversationHistory.length === 0}
            >
              Reset Session
            </button>
          </div>
        </div>
      </header>

      {/* SessionBar */}
      <SessionBar
        connectionStatus={connectionStatus}
        currentTurn={currentTurn}
        onReset={handleReset}
        isProcessing={isProcessing}
        hasConversation={conversationHistory.length > 0}
      />

      {/* Main content — split layout */}
      <main className="app__main">
        {/* Left panel: Conversation */}
        <div className="app__panel app__panel--left">
          {/* Voice controls and transcript */}
          <div className="app__voice-section">
            <VoiceRecorder
              sendMessage={sendMessage}
              isProcessing={isProcessing}
              demoComplete={demoComplete}
              connectionStatus={connectionStatus}
              onTranscriptUpdate={handleTranscriptUpdate}
            />
            <TranscriptDisplay
              transcript={transcript}
              isProcessing={isProcessing}
            />
          </div>

          {/* Conversation history */}
          <div className="app__conversation-section">
            <ConversationPanel
              conversationHistory={conversationHistory}
              isProcessing={isProcessing}
              error={error}
              demoComplete={demoComplete}
            />
          </div>
        </div>

        {/* Right panel: Graph + Progress */}
        <div className="app__panel app__panel--right">
          {/* Knowledge Graph */}
          <div className="app__graph-section">
            <KnowledgeGraph nodes={nodes} links={links} />
            {graphError && (
              <div className="app__graph-error">
                Failed to load graph data
              </div>
            )}
          </div>

          {/* Learner Progress */}
          <div className="app__progress-section">
            <LearnerProgress
              level={level}
              masteryScores={masteryScores}
              borderUpdate={borderUpdate}
              currentTurn={currentTurn}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
