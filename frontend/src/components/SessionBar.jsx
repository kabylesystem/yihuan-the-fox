/**
 * SessionBar component for Neural-Sync Language Lab.
 *
 * Displays session metadata and controls in a compact horizontal bar:
 *  - Language pair (French → English) with flag icons
 *  - Current turn count (e.g., "Turn 3/5")
 *  - Session timer counting up from start (MM:SS format)
 *  - WebSocket connection status indicator (green dot when connected)
 *  - Reset session button
 *
 * This component sits below the header and provides quick session context
 * and controls without taking up significant vertical space.
 *
 * Props:
 *  - connectionStatus: string — WebSocket status ('connected', 'disconnected', 'reconnecting', 'error')
 *  - currentTurn: number — Current conversation turn number (1-indexed)
 *  - onReset: function — Callback to reset the session
 *  - isProcessing: boolean — Whether a turn is currently processing (disables reset)
 *  - hasConversation: boolean — Whether any conversation history exists (disables reset if false)
 */

import { useState, useEffect } from 'react';

/**
 * Format elapsed time in seconds to MM:SS string.
 *
 * @param {number} seconds - Elapsed time in seconds.
 * @returns {string} Formatted time string (e.g., "03:45").
 */
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * @param {Object} props
 * @param {string} props.connectionStatus - WebSocket connection status.
 * @param {number} props.currentTurn - Current conversation turn number.
 * @param {function} props.onReset - Reset session callback.
 * @param {boolean} props.isProcessing - Whether currently processing a turn.
 * @param {boolean} props.hasConversation - Whether conversation history exists.
 */
export default function SessionBar({
  connectionStatus,
  currentTurn,
  onReset,
  isProcessing,
  hasConversation,
}) {
  // ── Session timer state ───────────────────────────────────────────
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    // Start timer when component mounts
    const startTime = Date.now();

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      setElapsedSeconds(elapsed);
    }, 1000);

    return () => clearInterval(interval);
  }, []); // Empty deps: timer starts once on mount

  // Reset timer when conversation is reset (currentTurn goes back to 1)
  useEffect(() => {
    if (currentTurn === 1 && !hasConversation) {
      setElapsedSeconds(0);
    }
  }, [currentTurn, hasConversation]);

  // ── Connection status styling ─────────────────────────────────────
  const isConnected = connectionStatus === 'connected';
  const statusClass = isConnected
    ? 'session-bar__status-dot--connected'
    : 'session-bar__status-dot--disconnected';

  return (
    <div className="session-bar">
      <div className="session-bar__content">
        {/* Language Pair */}
        <div className="session-bar__section session-bar__section--language">
          <span className="session-bar__label">Language Pair</span>
          <div className="session-bar__language-display">
            <span className="session-bar__flag" role="img" aria-label="French">🇫🇷</span>
            <span className="session-bar__arrow">→</span>
            <span className="session-bar__flag" role="img" aria-label="English">🇬🇧</span>
          </div>
        </div>

        {/* Turn Counter */}
        <div className="session-bar__section session-bar__section--turns">
          <span className="session-bar__label">Turn</span>
          <span className="session-bar__value">
            {currentTurn > 1 ? currentTurn - 1 : 0} / 5
          </span>
        </div>

        {/* Session Timer */}
        <div className="session-bar__section session-bar__section--timer">
          <span className="session-bar__label">Session Time</span>
          <span className="session-bar__value session-bar__timer">
            {formatTime(elapsedSeconds)}
          </span>
        </div>

        {/* Connection Status */}
        <div className="session-bar__section session-bar__section--status">
          <span className="session-bar__label">Status</span>
          <div className="session-bar__status">
            <span className={`session-bar__status-dot ${statusClass}`} />
            <span className="session-bar__status-text">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>

        {/* Reset Button */}
        <div className="session-bar__section session-bar__section--actions">
          <button
            className="session-bar__reset-button"
            onClick={onReset}
            disabled={isProcessing || !hasConversation}
            title="Reset session and start over"
          >
            <span className="session-bar__reset-icon">↻</span>
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
