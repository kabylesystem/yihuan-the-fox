/**
 * ConversationPanel component for Neural-Sync Language Lab.
 *
 * Displays the full conversation history between the user and AI tutor.
 * Each turn shows:
 *  - User message (right-aligned, user color)
 *  - Tutor spoken response (left-aligned, tutor color) with:
 *    - Translation hint (English)
 *    - Vocabulary breakdown (word, translation, part of speech)
 *    - New elements introduced this turn (i+1)
 *    - Reactivated elements from previous turns
 *    - CEFR level assessment
 *    - Linguistic border update
 *
 * Auto-scrolls to the latest turn as the conversation progresses.
 *
 * Props:
 *  - conversationHistory: Array of ConversationTurn objects
 *  - isProcessing: boolean — whether a response is in flight
 *  - error: string | null — error message to display
 *  - demoComplete: boolean — whether the mock demo is finished
 */

import { useEffect, useRef, useState } from 'react';

/**
 * User avatar icon (SVG).
 */
function UserIcon() {
  return (
    <svg
      className="conversation-panel__avatar-icon"
      width="32"
      height="32"
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="16" cy="10" r="5" fill="currentColor" opacity="0.9" />
      <path
        d="M8 26C8 21.5817 11.5817 18 16 18C20.4183 18 24 21.5817 24 26"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.9"
      />
    </svg>
  );
}

/**
 * Robot avatar icon (SVG).
 */
function RobotIcon() {
  return (
    <svg
      className="conversation-panel__avatar-icon"
      width="32"
      height="32"
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="8" y="10" width="16" height="14" rx="3" fill="currentColor" opacity="0.2" />
      <rect x="8" y="10" width="16" height="14" rx="3" stroke="currentColor" strokeWidth="2" opacity="0.9" />
      <circle cx="13" cy="16" r="1.5" fill="currentColor" />
      <circle cx="19" cy="16" r="1.5" fill="currentColor" />
      <line x1="11" y1="20" x2="21" y2="20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="14.5" y="6" width="3" height="4" rx="1" fill="currentColor" opacity="0.9" />
      <circle cx="16" cy="6" r="1.5" fill="currentColor" />
    </svg>
  );
}

/**
 * A single user message bubble.
 *
 * @param {Object} props
 * @param {string} props.text - The user's spoken French text.
 * @param {number} props.turnNumber - The turn number.
 */
function UserMessage({ text, turnNumber }) {
  return (
    <div className="conversation-panel__message conversation-panel__message--user">
      <div className="conversation-panel__bubble conversation-panel__bubble--user">
        <div className="conversation-panel__avatar conversation-panel__avatar--user">
          <UserIcon />
        </div>
        <div className="conversation-panel__content">
          <span className="conversation-panel__turn-badge">Turn {turnNumber}</span>
          <p className="conversation-panel__text">{text}</p>
        </div>
      </div>
    </div>
  );
}

/**
 * A single tutor response bubble with expandable detail sections.
 *
 * @param {Object} props
 * @param {Object} props.response - The full TutorResponse object.
 */
function TutorMessage({ response }) {
  const [showDetails, setShowDetails] = useState(false);

  const {
    spoken_response,
    translation_hint,
    vocabulary_breakdown,
    new_elements,
    reactivated_elements,
    user_level_assessment,
    border_update,
  } = response;

  return (
    <div className="conversation-panel__message conversation-panel__message--tutor">
      <div className="conversation-panel__bubble conversation-panel__bubble--tutor">
        <div className="conversation-panel__avatar conversation-panel__avatar--tutor">
          <RobotIcon />
        </div>
        <div className="conversation-panel__content">
          {/* Main spoken response */}
          <p className="conversation-panel__spoken">{spoken_response}</p>

        {/* Translation hint */}
        {translation_hint && (
          <p className="conversation-panel__translation">
            <span className="conversation-panel__hint-icon">💡</span>
            {translation_hint}
          </p>
        )}

        {/* Toggle button for detailed breakdown */}
        <button
          className="conversation-panel__details-toggle"
          onClick={() => setShowDetails((prev) => !prev)}
          aria-expanded={showDetails}
        >
          {showDetails ? '▾ Hide details' : '▸ Show details'}
        </button>

        {/* Expandable details section */}
        {showDetails && (
          <div className="conversation-panel__details">
            {/* Vocabulary breakdown */}
            {vocabulary_breakdown && vocabulary_breakdown.length > 0 && (
              <div className="conversation-panel__section">
                <h4 className="conversation-panel__section-title">Vocabulary</h4>
                <ul className="conversation-panel__vocab-list">
                  {vocabulary_breakdown.map((item, idx) => (
                    <li key={idx} className="conversation-panel__vocab-item">
                      <span className="conversation-panel__vocab-word">{item.word}</span>
                      <span className="conversation-panel__vocab-translation">{item.translation}</span>
                      <span className="conversation-panel__vocab-pos">{item.part_of_speech}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* New elements (i+1) */}
            {new_elements && new_elements.length > 0 && (
              <div className="conversation-panel__section">
                <h4 className="conversation-panel__section-title">
                  New Elements <span className="conversation-panel__badge conversation-panel__badge--new">i+1</span>
                </h4>
                <div className="conversation-panel__tags">
                  {new_elements.map((el, idx) => (
                    <span key={idx} className="conversation-panel__tag conversation-panel__tag--new">
                      {el}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Reactivated elements */}
            {reactivated_elements && reactivated_elements.length > 0 && (
              <div className="conversation-panel__section">
                <h4 className="conversation-panel__section-title">Reactivated</h4>
                <div className="conversation-panel__tags">
                  {reactivated_elements.map((el, idx) => (
                    <span key={idx} className="conversation-panel__tag conversation-panel__tag--reactivated">
                      {el}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* CEFR Level */}
            {user_level_assessment && (
              <div className="conversation-panel__section">
                <h4 className="conversation-panel__section-title">Level</h4>
                <span className="conversation-panel__level-badge">
                  {user_level_assessment}
                </span>
              </div>
            )}

            {/* Border update */}
            {border_update && (
              <div className="conversation-panel__section">
                <h4 className="conversation-panel__section-title">Your Progress</h4>
                <p className="conversation-panel__border-update">{border_update}</p>
              </div>
            )}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

/**
 * Main conversation panel displaying the full turn history.
 *
 * @param {Object} props
 * @param {Array}   props.conversationHistory - Array of ConversationTurn objects.
 * @param {boolean} props.isProcessing        - Whether the backend is processing.
 * @param {string|null} props.error           - Error message to display.
 * @param {boolean} props.demoComplete        - Whether the demo is finished.
 */
export default function ConversationPanel({
  conversationHistory,
  isProcessing,
  error,
  demoComplete,
}) {
  const scrollRef = useRef(null);

  // Auto-scroll to the bottom when conversation updates
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversationHistory, isProcessing]);

  return (
    <div className="conversation-panel">
      <div className="conversation-panel__header">
        <h2 className="conversation-panel__title">Conversation</h2>
      </div>

      <div className="conversation-panel__messages" ref={scrollRef}>
        {/* Empty state */}
        {conversationHistory.length === 0 && !isProcessing && (
          <div className="conversation-panel__empty">
            <p className="conversation-panel__empty-text">
              Press the mic button to start your French conversation!
            </p>
            <p className="conversation-panel__empty-hint">
              The AI tutor will guide you through progressively harder dialogue.
            </p>
          </div>
        )}

        {/* Conversation turns */}
        {conversationHistory.map((turn) => (
          <div key={turn.turn_number} className="conversation-panel__turn">
            <UserMessage
              text={turn.user_said}
              turnNumber={turn.turn_number}
            />
            {turn.response && <TutorMessage response={turn.response} />}
          </div>
        ))}

        {/* Processing indicator */}
        {isProcessing && (
          <div className="conversation-panel__message conversation-panel__message--tutor">
            <div className="conversation-panel__bubble conversation-panel__bubble--tutor conversation-panel__bubble--typing">
              <div className="conversation-panel__avatar conversation-panel__avatar--tutor">
                <RobotIcon />
              </div>
              <div className="conversation-panel__content">
                <span className="conversation-panel__typing-dot" />
                <span className="conversation-panel__typing-dot" />
                <span className="conversation-panel__typing-dot" />
              </div>
            </div>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="conversation-panel__error">
            <span className="conversation-panel__error-icon">⚠️</span>
            <span className="conversation-panel__error-text">{error}</span>
          </div>
        )}

        {/* Demo complete message */}
        {demoComplete && (
          <div className="conversation-panel__demo-complete">
            <p className="conversation-panel__demo-complete-text">
              🎉 Demo complete! You&apos;ve finished all 5 turns.
            </p>
            <p className="conversation-panel__demo-complete-hint">
              Click &quot;Reset&quot; to start a new conversation.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
