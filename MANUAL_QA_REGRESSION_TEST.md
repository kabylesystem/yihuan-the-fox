# Manual QA Regression Test - Phase 5 UI/UX Polish

**Test Date:** 2026-02-28
**Subtask:** subtask-9-3
**Objective:** Verify no regressions in core functionality after UI/UX enhancements

## Test Environment

- **Backend:** http://localhost:8000 (MOCK_MODE enabled)
- **Frontend:** http://localhost:5176
- **Mode:** MOCK_MODE (simulated data, no external APIs)

## Prerequisites

✅ Backend running on port 8000
✅ Frontend running on port 5176
✅ Browser: Chrome (recommended) or Firefox
✅ DevTools Console open for error monitoring

---

## Test Plan: 5 Conversation Turns in MOCK_MODE

### Turn 1: Initial Load & Connection

**Actions:**
1. Open http://localhost:5176 in browser
2. Open DevTools Console (F12)
3. Wait for page to load completely

**Verify:**
- [ ] SessionBar shows "Connected" with green dot
- [ ] SessionBar displays FR→EN language pair
- [ ] SessionBar timer shows 00:00
- [ ] Knowledge Graph displays with initial nodes (if any)
- [ ] No console errors (red text in console)
- [ ] WebSocket connection established (check Network > WS tab or console logs)

**Expected Console Messages:**
- "WebSocket connected" or similar success message

---

### Turn 2: First Voice Recording

**Actions:**
1. Click the microphone button (large circular button)
2. Grant microphone permission if prompted
3. Speak for 3-5 seconds (say anything, e.g., "Hello, this is a test")
4. Click stop or release button

**Verify:**
- [ ] Button changes state (shows recording indicator)
- [ ] 3 concentric pulse rings appear during recording
- [ ] Recording timer counts up (00:01, 00:02, 00:03...)
- [ ] Waveform bars animate (respond to audio if real mic, or show CSS animation)
- [ ] After stopping: transcript appears in conversation panel
- [ ] Tutor response appears (MOCK_MODE generates simulated response)
- [ ] Conversation history populates with user + tutor messages
- [ ] Messages have SVG avatars (user icon, robot icon)
- [ ] No console errors

**Expected Behavior:**
- User message bubble (blue background, user avatar)
- Tutor message bubble (purple background, robot avatar)
- Typing indicator appears briefly before tutor response

---

### Turn 3: Graph Updates

**Actions:**
1. Complete another voice recording (or click mic without speaking if in mock mode)
2. Wait for tutor response

**Verify:**
- [ ] New nodes appear in Knowledge Graph
- [ ] New nodes scale in from 0 to 1 (scale-in animation)
- [ ] Nodes show colored glow halos (green/yellow/red based on mastery)
- [ ] Particles travel along edges (small glowing dots moving on lines)
- [ ] Graph remains responsive (can zoom with scroll wheel, pan with drag)
- [ ] Existing nodes/edges remain visible (no disappearing data)
- [ ] No console errors

**Graph Interaction Tests:**
- [ ] Scroll wheel zooms in/out (0.5x to 4x range)
- [ ] Drag on background pans the graph
- [ ] Hover over node shows tooltip or highlight

---

### Turn 4: Conversation History & Vocabulary

**Actions:**
1. Complete third voice recording
2. Wait for tutor response
3. Scroll through conversation panel

**Verify:**
- [ ] Conversation history shows all previous messages in order
- [ ] Message bubbles have 16px padding and 16px border-radius (spacious feel)
- [ ] Vocabulary cards appear (if tutor response includes new vocabulary)
- [ ] Vocabulary cards have badges: "New" (green glow) or "Reactivated" (orange glow)
- [ ] Cards slide in from bottom with staggered animation
- [ ] Auto-scroll to latest message works smoothly (not jumpy)
- [ ] No console errors

**Vocabulary Card Checks:**
- [ ] Each vocabulary item is a separate card
- [ ] Cards show word + translation + badge
- [ ] Hover effect works on cards

---

### Turn 5: Progress Updates

**Actions:**
1. Complete fourth and fifth voice recordings
2. Check LearnerProgress panel (below Knowledge Graph on left side)

**Verify:**
- [ ] CEFR badge displays current level (e.g., A1, A1+)
- [ ] CEFR badge has rotating glow animation (shimmer effect)
- [ ] Overall mastery progress bar shows percentage
- [ ] Progress bar has shimmer effect (left-to-right animation)
- [ ] Concept mastery cards show individual concepts
- [ ] Each concept card displays: name + progress bar + percentage
- [ ] Concept cards have hover effects
- [ ] Progress values update after each turn
- [ ] No console errors

**Level-Up Test (if triggered):**
- [ ] If level changes (e.g., A1 → A1+), confetti/particle burst animation appears
- [ ] Particles radiate from CEFR badge in all directions

---

### Final Checks: WebSocket Stability & Session Reset

**Actions:**
1. Check SessionBar connection status
2. Verify turn counter updated (should show turn 5/5 or similar)
3. Check session timer (should show elapsed time, e.g., 02:45)
4. Click Reset button in SessionBar
5. Confirm reset in dialog

**Verify:**
- [ ] WebSocket stayed connected throughout all 5 turns (green dot)
- [ ] Turn counter incremented correctly (1 → 2 → 3 → 4 → 5)
- [ ] Session timer counted up continuously
- [ ] Reset confirmation dialog appears
- [ ] After reset: graph clears, conversation clears, timer resets to 00:00
- [ ] Turn counter resets to 1
- [ ] No console errors during reset

---

## Console Error Check

**Final Verification:**
1. Review entire DevTools Console log
2. Look for any red error messages

**Acceptable:**
- ⚠️ Warnings (yellow) are acceptable
- ℹ️ Info messages are acceptable

**NOT Acceptable:**
- ❌ JavaScript errors (red)
- ❌ Network errors (failed API calls, WebSocket disconnections)
- ❌ React errors (component rendering failures)

---

## Test Result Summary

| Category | Status | Notes |
|----------|--------|-------|
| WebSocket Connection | ⬜ PASS / FAIL | Green dot throughout all 5 turns |
| Conversation History | ⬜ PASS / FAIL | All messages populate correctly |
| Knowledge Graph Updates | ⬜ PASS / FAIL | New nodes/links appear, animations work |
| Progress Bar Updates | ⬜ PASS / FAIL | Mastery scores update after each turn |
| Console Errors | ⬜ PASS / FAIL | No red errors in console |
| Session Reset | ⬜ PASS / FAIL | Reset clears state and timer |

---

## Additional Visual Checks (Optional)

### Layout Verification:
- [ ] Knowledge Graph + Progress panel on left (60% width)
- [ ] Voice Recorder + Conversation panel on right (40% width)
- [ ] SessionBar below header, spans full width
- [ ] Dot grid background visible behind graph

### Animation Quality:
- [ ] Particle animations run smoothly (30+ FPS)
- [ ] Node glow effects visible (mastery-colored halos)
- [ ] Pulse rings smooth during recording
- [ ] Typing indicator animation smooth (0.8s)
- [ ] Message slide-in transitions smooth

### Responsive Design (Optional):
- [ ] Resize to 1024px: layout adjusts spacing
- [ ] Resize to 768px: switches to single-column stack

---

## Sign-Off

**Tester:** _____________________
**Date:** _____________________
**Result:** ⬜ PASS - No regressions detected
            ⬜ FAIL - Issues found (document below)

**Issues Found:**
```
(List any regressions or problems here)
```

---

## Automated Pre-Check Results

✅ Backend health: OK
✅ Session state endpoint: OK
✅ Graph nodes endpoint: OK
✅ Frontend loads: OK
✅ WebSocket endpoint available: OK
