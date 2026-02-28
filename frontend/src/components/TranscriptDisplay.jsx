/**
 * TranscriptDisplay component for Neural-Sync Language Lab.
 *
 * Shows the real-time speech-to-text transcript as the user speaks.
 * Displays two states:
 *  - Partial transcript: faded/italic text that updates in real time
 *    as the STT service produces interim results.
 *  - Final transcript: solid text once the STT service confirms the
 *    completed transcription.
 *
 * In mock mode the partial transcript phase is brief (simulated)
 * and the final transcript comes from the pre-scripted conversation.
 *
 * Props:
 *  - transcript (object) — { status, text }
 *    - status: 'idle' | 'recording' | 'partial' | 'final' | 'processing'
 *    - text: the transcript text to display
 *  - isProcessing (bool) — whether the backend is processing the turn
 */

/**
 * @param {Object} props
 * @param {{ status: string, text: string }} props.transcript
 *   Current transcript state. Shapes:
 *     { status: 'idle',       text: '' }
 *     { status: 'recording',  text: '' }
 *     { status: 'partial',    text: 'Bonj...' }
 *     { status: 'final',      text: 'Bonjour' }
 *     { status: 'processing', text: '' }
 * @param {boolean} props.isProcessing - Whether the backend is processing.
 * @param {number[]} [props.audioLevels] - Optional array of 5 audio levels (0-1 range).
 */
export default function TranscriptDisplay({ transcript, isProcessing, audioLevels }) {
  const { status = 'idle', text = '' } = transcript || {};

  // Nothing to show when idle and not processing
  if (status === 'idle' && !isProcessing && !text) {
    return null;
  }

  // ── Determine display text and CSS modifier ──────────────────────

  let displayText = text;
  let statusLabel = '';
  let className = 'transcript-display';

  switch (status) {
    case 'recording':
      statusLabel = 'Listening...';
      className += ' transcript-display--recording';
      break;

    case 'partial':
      displayText = text;
      statusLabel = 'Transcribing...';
      className += ' transcript-display--partial';
      break;

    case 'final':
      displayText = text;
      statusLabel = 'You said:';
      className += ' transcript-display--final';
      break;

    case 'processing':
      statusLabel = 'Processing...';
      className += ' transcript-display--processing';
      break;

    default:
      break;
  }

  // Override with processing state if backend is working
  if (isProcessing && status !== 'final') {
    statusLabel = 'Tutor is thinking...';
    className = 'transcript-display transcript-display--processing';
  }

  return (
    <div className={className}>
      {statusLabel && (
        <span className="transcript-display__status">{statusLabel}</span>
      )}
      {displayText && (
        <p className="transcript-display__text">{displayText}</p>
      )}
      {(status === 'recording' || status === 'partial') && (
        <div className="transcript-display__wave">
          {audioLevels && audioLevels.length === 5 ? (
            // Real-time audio levels from microphone
            audioLevels.map((level, index) => {
              // Map level (0-1) to height percentage (20%-100%)
              const height = Math.max(20, Math.min(100, 20 + level * 80));
              return (
                <span
                  key={index}
                  className="transcript-display__wave-bar"
                  style={{ height: `${height}%` }}
                />
              );
            })
          ) : (
            // Fallback to CSS animation when no audio levels available
            <>
              <span className="transcript-display__wave-bar" />
              <span className="transcript-display__wave-bar" />
              <span className="transcript-display__wave-bar" />
              <span className="transcript-display__wave-bar" />
              <span className="transcript-display__wave-bar" />
            </>
          )}
        </div>
      )}
    </div>
  );
}
