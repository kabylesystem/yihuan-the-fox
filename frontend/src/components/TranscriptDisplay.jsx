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
 */
export default function TranscriptDisplay({ transcript, isProcessing }) {
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
          <span className="transcript-display__wave-bar" />
          <span className="transcript-display__wave-bar" />
          <span className="transcript-display__wave-bar" />
          <span className="transcript-display__wave-bar" />
          <span className="transcript-display__wave-bar" />
        </div>
      )}
    </div>
  );
}
