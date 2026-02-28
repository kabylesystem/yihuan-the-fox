/**
 * LearnerProgress component for Neural-Sync Language Lab.
 *
 * Displays the learner's current progress in a compact dashboard:
 *  - CEFR level badge (A1, A1+, A2) with color-coded background
 *  - Mastery score bars for each learned concept (animated width)
 *  - Linguistic border update text describing what the learner can now do
 *
 * The component updates after each conversation turn as the backend
 * returns new mastery_scores, level, and border_update data.
 *
 * When the CEFR level changes (e.g., A1 → A1+), a confetti particle burst
 * animation is triggered around the badge to celebrate the achievement.
 *
 * Props:
 *  - level: string — current CEFR level (e.g., "A1", "A1+", "A2")
 *  - masteryScores: object — { concept: score } where score is 0.0-1.0
 *  - borderUpdate: string — latest linguistic border description
 *  - currentTurn: number — current turn number for context display
 */

import { useState, useEffect, useRef } from 'react';

/**
 * Map icon (SVG) for Linguistic Border section.
 */
function MapIcon() {
  return (
    <svg
      className="learner-progress__section-icon-svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M8 2L2 5V19L8 16L16 19L22 16V2L16 5L8 2Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity="0.9"
      />
      <line x1="8" y1="2" x2="8" y2="16" stroke="currentColor" strokeWidth="2" opacity="0.6" />
      <line x1="16" y1="5" x2="16" y2="19" stroke="currentColor" strokeWidth="2" opacity="0.6" />
    </svg>
  );
}

/**
 * Chart icon (SVG) for Concept Mastery section.
 */
function ChartIcon() {
  return (
    <svg
      className="learner-progress__section-icon-svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="3" y="13" width="4" height="8" rx="1" fill="currentColor" opacity="0.9" />
      <rect x="10" y="8" width="4" height="13" rx="1" fill="currentColor" opacity="0.9" />
      <rect x="17" y="3" width="4" height="18" rx="1" fill="currentColor" opacity="0.9" />
    </svg>
  );
}

/**
 * Trending chart icon (SVG) for empty state.
 */
function TrendingUpIcon() {
  return (
    <svg
      className="learner-progress__empty-icon-svg"
      width="64"
      height="64"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <polyline
        points="23 6 13.5 15.5 8.5 10.5 1 18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.9"
      />
      <polyline
        points="17 6 23 6 23 12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.9"
      />
    </svg>
  );
}

/**
 * Map CEFR levels to badge colors for visual progression.
 */
const LEVEL_COLORS = {
  A1: '#ff6b6b',
  'A1+': '#ffaa00',
  A2: '#44ff44',
  'A2+': '#00ccaa',
  B1: '#4488ff',
  B2: '#6a5aff',
};

/**
 * Mastery bar color scale (matches KnowledgeGraph node coloring).
 * Returns a CSS color string for a given mastery score.
 *
 * @param {number} score - Mastery score 0.0-1.0.
 * @returns {string} CSS color value.
 */
function masteryColor(score) {
  if (score >= 0.75) return '#44ff44';
  if (score >= 0.5) return '#ffaa00';
  return '#ff4444';
}

/**
 * @param {Object} props
 * @param {string} props.level         - Current CEFR level.
 * @param {Object} props.masteryScores - Map of concept name to mastery score (0-1).
 * @param {string} props.borderUpdate  - Latest border update text.
 * @param {number} props.currentTurn   - Current conversation turn number.
 */
export default function LearnerProgress({
  level,
  masteryScores,
  borderUpdate,
  currentTurn,
}) {
  // Track previous level to detect changes
  const prevLevelRef = useRef(level);
  const [showLevelUp, setShowLevelUp] = useState(false);

  const badgeColor = LEVEL_COLORS[level] || LEVEL_COLORS.A1;

  // Detect level-up and trigger confetti animation
  useEffect(() => {
    if (prevLevelRef.current && prevLevelRef.current !== level && level) {
      // Level changed! Trigger confetti burst
      setShowLevelUp(true);
      // Hide confetti after animation completes (2s)
      const timer = setTimeout(() => setShowLevelUp(false), 2000);
      return () => clearTimeout(timer);
    }
    prevLevelRef.current = level;
  }, [level]);

  // Sort mastery entries by score descending for visual clarity
  const sortedEntries = masteryScores
    ? Object.entries(masteryScores).sort(([, a], [, b]) => b - a)
    : [];

  // Calculate overall mastery average
  const averageMastery = sortedEntries.length > 0
    ? sortedEntries.reduce((sum, [, score]) => sum + score, 0) / sortedEntries.length
    : 0;

  return (
    <div className="learner-progress">
      <div className="learner-progress__header">
        <h2 className="learner-progress__title">Learner Progress</h2>
        {currentTurn > 1 && (
          <span className="learner-progress__turn-indicator">
            Turn {currentTurn - 1} / 5
          </span>
        )}
      </div>

      {/* CEFR Level Badge */}
      <div className="learner-progress__level-section">
        <div
          className="learner-progress__level-badge"
          style={{
            borderColor: badgeColor,
            boxShadow: `0 0 16px ${badgeColor}33, 0 0 4px ${badgeColor}66`,
          }}
        >
          <span className="learner-progress__level-label">CEFR Level</span>
          <span
            className="learner-progress__level-value"
            style={{ color: badgeColor }}
          >
            {level || 'A1'}
          </span>

          {/* Confetti particles for level-up animation */}
          {showLevelUp && (
            <div className="learner-progress__confetti-container">
              {[...Array(12)].map((_, i) => (
                <div
                  key={i}
                  className="learner-progress__confetti-particle"
                  style={{
                    '--particle-angle': `${i * 30}deg`,
                    '--particle-delay': `${i * 0.05}s`,
                    '--particle-color': i % 3 === 0 ? badgeColor : i % 3 === 1 ? '#6a9fff' : '#44ff44',
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Overall mastery indicator */}
        {sortedEntries.length > 0 && (
          <div className="learner-progress__overall">
            <span className="learner-progress__overall-label">
              Overall Mastery
            </span>
            <div className="learner-progress__overall-bar-track">
              <div
                className="learner-progress__overall-bar-fill"
                style={{
                  width: `${Math.round(averageMastery * 100)}%`,
                  backgroundColor: masteryColor(averageMastery),
                }}
              />
            </div>
            <span className="learner-progress__overall-pct">
              {Math.round(averageMastery * 100)}%
            </span>
          </div>
        )}
      </div>

      {/* Border Update */}
      {borderUpdate && (
        <div className="learner-progress__border-section">
          <h3 className="learner-progress__section-title">
            <MapIcon />
            Linguistic Border
          </h3>
          <p className="learner-progress__border-text">{borderUpdate}</p>
        </div>
      )}

      {/* Mastery Score Bars */}
      {sortedEntries.length > 0 && (
        <div className="learner-progress__mastery-section">
          <h3 className="learner-progress__section-title">
            <ChartIcon />
            Concept Mastery
          </h3>
          <div className="learner-progress__mastery-grid">
            {sortedEntries.map(([concept, score]) => (
              <div key={concept} className="learner-progress__mastery-card">
                <span className="learner-progress__mastery-card-name">
                  {concept}
                </span>
                <div className="learner-progress__mastery-card-bar-track">
                  <div
                    className="learner-progress__mastery-card-bar-fill"
                    style={{
                      width: `${Math.round(score * 100)}%`,
                      backgroundColor: masteryColor(score),
                    }}
                  />
                </div>
                <span
                  className="learner-progress__mastery-card-pct"
                  style={{ color: masteryColor(score) }}
                >
                  {Math.round(score * 100)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {sortedEntries.length === 0 && (
        <div className="learner-progress__empty">
          <div className="learner-progress__empty-icon">
            <TrendingUpIcon />
          </div>
          <p className="learner-progress__empty-text">
            Your progress will appear here as you converse with the tutor.
          </p>
        </div>
      )}
    </div>
  );
}
