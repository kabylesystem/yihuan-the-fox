# Echo Neural Language Lab - Project Update Log

Last updated: 2026-03-01

## Scope
This log tracks major implementation changes completed so far across backend, frontend, graph logic, voice pipeline, mission system, stability, and UX.

## 1) Reliability and runtime fixes
- Fixed graph link serialization bug by consistently using `model_dump()` before dict access.
- Added frontend safety checks for invalid graph payloads.
- Added `ErrorBoundary` around 3D canvas with explicit reload control.
- Added canvas crash recovery path (`Reload 3D`) and state reset key.
- Fixed repeated localhost startup issues and standardized local run on:
  - Frontend: `http://127.0.0.1:4321`
  - Backend: `http://127.0.0.1:4322`

## 2) Voice/STT/TTS pipeline
- Root-cause fix for STT failure (`Could not understand audio`):
  - Replaced PyAV conversion path from ndarray-based extraction to plane-bytes extraction (no hard numpy dependency in runtime path).
- Added audio failure streak handling in frontend:
  - Auto fallback to text mode after repeated voice failures.
- Kept early text response before TTS (non-blocking TTS in background).
- Added latency telemetry in turn payload (`stt`, `llm`, `total`).

## 3) Reset correctness
- Added hard reset behavior to fully clear session state.
- Ensured reset also clears OpenAI conversation memory so old words do not reappear.
- Wired frontend hard reset button to backend hard reset endpoint.

## 4) Graph source-of-truth cleanup
- Switched graph node creation to user-driven validated units pipeline (no direct tutor-text pollution).
- Reduced noisy link generation strategies to a smaller explainable set.
- Added link metadata for explainability:
  - `reason`
  - `reason_detail`
  - `evidence_units`
- Added link inspector UI panel to show why links exist.

## 5) Pedagogical strict gate (serious mode)
Implemented strict validation flow in `backend/routes/conversation.py`:
- Candidate extraction -> canonicalization -> acceptance/rejection.
- Canonical precedence enforced:
  - `pattern > chunk > word`
- Added accepted/rejected pedagogical unit structure with reasons.
- Added quality scoring and mission progress on each turn.
- Added deterministic mission task payload in websocket response.

### Canonicalization highlights
- Added explicit canonical patterns:
  - `je suis + [noun]`
  - `j'aime + [object]`
  - `j'ai envie de + [infinitive]`
  - `ça va`
- Added reject rules:
  - incomplete pattern fragments (`je suis`, `j'aime`, `j'ai envie de`)
  - too broad chunks
  - stop words / low confidence / off mission / covered by pattern / covered by chunk
- This prevents parallel noisy nodes like `je suis` and `je suis un ...` in core progression.

## 6) Mission engine and gameplay signals
- Added mission hint + mission tasks + mission progress in backend response.
- Added mission panel UI with task checklist and progress bar.
- Added gamification signals:
  - XP
  - combo
  - quality streak
  - CEFR badge
- Reward logic now tied to accepted quality/relevance outcomes rather than raw volume.

## 7) UI/UX improvements
- Removed low-signal graph legend from active screen rendering.
- Redesigned `Your Progress` into a high-signal `Performance Dock`:
  - quality
  - health
  - pace
  - mission completion
  - canonical graph count
  - latency telemetry
- Updated mission copy labels to English.
- HUD now prioritizes accepted canonical units over noisy vocabulary breakdown chips.

## 8) 3D readability and visual stability
- Tuned graph spacing and force parameters to reduce clutter/spaghetti behavior.
- Reduced over-bright rendering conditions that could trigger visual washout/crash.
- Reduced heavy geometry cost for better GPU stability.
- Added recenter behavior and controlled camera interactions.

## 9) Diagnostics and observability
- Added per-turn diagnostics storage in session (rolling window).
- Added backend diagnostics endpoint support for recent turn timings and quality payload context.
- Frontend shows live latency split (`STT`, `AI`, `Total`).

## 10) Current known focus (ongoing iteration)
- Continue refining canonical policy to avoid over-abstracting useful lexical units.
- Continue improving graph readability for both sparse and dense node counts.
- Keep mission feedback actionable and concise for A1-A2 speaking progression.

## 11) Latest iteration (UI clarity + mission game loop + graph readability)
- Removed low-signal legend from active screen rendering (kept off by default).
- Reworked left progress block into a compact, high-signal panel:
  - level, health, quality/combo, XP/session/pace, graph size.
- Changed app icon in header from brain-like symbol to compass-style symbol.
- Differentiated top control icons:
  - `Recenter` uses location/target icon.
  - `Hard Reset` uses trash icon.
  - Chat control now has explicit label (`Chat`) to reduce icon ambiguity.
- Implemented mission engine behavior closer to game loops:
  - task auto-check after each turn,
  - auto mission completion detection,
  - XP bonus on completion,
  - auto-advance to next mission,
  - center-screen completion banner.
- Strengthened canonicalization so raw long chunks are promoted to canonical patterns:
  - `je suis + [noun]`
  - `j'aime + [object]`
  - `j'ai envie de + [infinitive]`
  - `ça va`
- Added stricter graph filtering and readability in backend:
  - low-signal tokens filtered from graph nodes,
  - better derived mastery distribution from confidence/reuse/recency,
  - extra intra-turn cohesion links to reduce isolated nodes.
- Updated 3D node rendering/readability:
  - node color now mixes mastery + unit kind accent (not flat same-color look),
  - small-graph force/layout tuned to reduce excessive spread.

## Files with major edits so far
- `backend/routes/conversation.py`
- `backend/routes/graph.py`
- `backend/routes/session.py`
- `backend/services/openai_service.py`
- `backend/services/speechmatics_service.py`
- `backend/models.py`
- `backend/mock_data.py`
- `frontend/src/App.tsx`
- `frontend/src/components/NebulaCanvas.tsx`
- `frontend/src/components/ErrorBoundary.tsx`
- `frontend/src/services/backendService.ts`
- `frontend/src/services/geminiService.ts`
