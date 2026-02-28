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
 * Props:
 *  - level: string — current CEFR level (e.g., "A1", "A1+", "A2")
 *  - masteryScores: object — { concept: score } where score is 0.0-1.0
 *  - borderUpdate: string — latest linguistic border description
 *  - currentTurn: number — current turn number for context display
 */

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
  const badgeColor = LEVEL_COLORS[level] || LEVEL_COLORS.A1;

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
            <span className="learner-progress__section-icon">🗺</span>
            Linguistic Border
          </h3>
          <p className="learner-progress__border-text">{borderUpdate}</p>
        </div>
      )}

      {/* Mastery Score Bars */}
      {sortedEntries.length > 0 && (
        <div className="learner-progress__mastery-section">
          <h3 className="learner-progress__section-title">
            <span className="learner-progress__section-icon">📊</span>
            Concept Mastery
          </h3>
          <div className="learner-progress__mastery-list">
            {sortedEntries.map(([concept, score]) => (
              <div key={concept} className="learner-progress__mastery-item">
                <div className="learner-progress__mastery-info">
                  <span className="learner-progress__mastery-concept">
                    {concept}
                  </span>
                  <span
                    className="learner-progress__mastery-pct"
                    style={{ color: masteryColor(score) }}
                  >
                    {Math.round(score * 100)}%
                  </span>
                </div>
                <div className="learner-progress__mastery-bar-track">
                  <div
                    className="learner-progress__mastery-bar-fill"
                    style={{
                      width: `${Math.round(score * 100)}%`,
                      backgroundColor: masteryColor(score),
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {sortedEntries.length === 0 && (
        <div className="learner-progress__empty">
          <div className="learner-progress__empty-icon">📈</div>
          <p className="learner-progress__empty-text">
            Your progress will appear here as you converse with the tutor.
          </p>
        </div>
      )}
    </div>
  );
}
