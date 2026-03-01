# Echo Neural Language Lab — Execution Log

This file tracks all major implementation work done so far.
Update this file after each significant change batch.

## 1) Product Direction (locked)

- Target users: A1–A2 learners (not absolute beginners).
- Core principle: **Speak better, not just more**.
- Graph must represent **validated canonical learning units**, not noisy raw tokens.
- UX language for guidance/mission/instructions: English.

## 2) Major Work Completed (chronological summary)

## A. Stability + compilation fixes

- Fixed TypeScript mismatch in graph link processing (`Synapse[]` typing issue).
- Verified frontend build output and bundle integrity.
- Improved runtime error handling around Canvas crashes (recoverability path).

## B. Voice pipeline incident (critical bug fix)

- Root cause found for “Could not understand audio”:
  - audio conversion path used `to_ndarray()` (required numpy) in backend STT conversion.
  - numpy was absent in runtime environment.
- Fixed conversion path to avoid numpy dependency.
- Result: voice transcription pipeline no longer fails for that reason.

## C. Reset and persistence correctness

- Added real reset behavior, including model conversation memory reset.
- Implemented hard reset endpoint and frontend wiring:
  - clears session state,
  - clears model context,
  - clears memory cache (Backboard reset path).
- Ensured graph starts empty after reset in mock mode when history is empty.

## D. Graph source cleanup (user vs AI words)

- Moved graph node creation away from AI response vocabulary artifacts.
- Introduced and used user-focused extraction fields.
- Progressively shifted graph source toward strict validated units.

## E. Link explosion (“spaghetti”) reduction

- Reduced noisy all-pairs linking strategies.
- Kept explainable relation strategies and removed high-noise heuristics.
- Added clearer relationship typing and color semantics.

## F. Layout + readability improvements

- Improved force layout spacing for small/medium graphs.
- Added clustering/normalization passes for better compact readability.
- Added `Recenter` control.
- Increased max zoom distance and reduced camera conflicts.

## G. Mission/game layer (V2)

- Added mission panel and progress framing.
- Added quality-based progression fields (quality, accepted/rejected units, latency).
- Added combo/streak/XP behaviors tied to quality and accepted units.
- Added richer mission card UI with progress indicators.

## H. English consistency pass

- Converted mission and instructional strings to English in backend/frontend guidance paths.
- Corrected mixed-language guidance text that was still appearing in UI instructions.

## I. V3 “Serious Learning System” implementation pass

- Extended backend models:
  - `ValidatedUnit` enriched with canonical fields,
  - mission progress fields,
  - graph link explainability fields.
- Added diagnostics endpoint for latency/quality observability.
- Reworked strict validator pipeline:
  - canonicalization pass with precedence intent (`pattern > chunk > word`),
  - mission relevance scoring,
  - rejection reasons (`stop_word`, `covered_by_chunk`, `low_confidence`, `off_mission`, `grammar_invalid`),
  - quality score computation from accepted canonical units + correction penalty.
- Graph generation hardened:
  - nodes from accepted validated units only,
  - links include reason + detail + evidence units,
  - mission progression link strategy.
- Frontend mapping updated for new pedagogy/mission fields.
- Link explanation moved from tiny toast to a proper explanation panel.
- Added rejected-units transparency in HUD.
- Added voice fail-safe mode (fallback to text after repeated audio failures).

## 3) Test and Validation Status

Latest validated runs:

- Backend tests: `138 passed`.
- Frontend production build: success.

Notes:

- Some bundle-size warnings remain (non-blocking for functionality).

## 4) Current Known Gaps / Risks

1. Canonical semantics still need tighter linguistic intent mapping in edge cases.
2. Mission relevance scoring is deterministic but still heuristic (not semantic parser-grade).
3. Graph pedagogy for long utterances may still over-promote full chunks in some cases.
4. Visual declutter can still improve when few nodes are on screen.
5. Runtime process boot/reload robustness is improved but still environment-sensitive.

## 5) Definition of “Good Final State” (target)

For an utterance like:

- `Salut, je suis un ours.`

Expected serious behavior:

1. Transcript stores raw sentence.
2. Correction feedback remains concise.
3. Graph stores one canonical representation for the concept (no duplicate overlapping units).
4. Links are explainable in plain language with evidence.
5. Mission progress updates deterministically.

## 6) Recommended Next Actions

1. Finalize canonicalization policy for “identity / preference / location” pattern families.
2. Add dedicated tests for the exact problematic utterance families.
3. Tighten mission relevance scoring against mission intent keywords and accepted patterns.
4. Add one-click “Serious Mode Debug” overlay (accepted/rejected/canonical trace per turn).
5. Run full end-to-end smoke script (10-turn voice scenario) before release demo.

## 7) Update Protocol (for ongoing maintenance)

When updating this file, append to:

- “Major Work Completed”
- “Test and Validation Status”
- “Current Known Gaps / Risks”

and include:

- files changed,
- test commands run,
- pass/fail outcome,
- residual risk.
