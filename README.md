# 🧠 Neural-Sync Language Lab

> **Activate Your Voice Hackathon — Feb 28 – Mar 1, 2026**
> Track 1: Communication & Human Experience

---

## 🎯 Vision

Neural-Sync Language Lab reimagines language learning by shifting focus from isolated vocabulary to a **dynamic, sentence-based neural ecosystem**.

Utilizing a real-time AI voice interface, the platform maps your **"linguistic borders"** — the edge of what you can express — and provides **i+1 adaptive input** (Krashen's theory), forcing the active retrieval of past sentences to prevent decay.

Through a stunning, interactive **Knowledge Graph**, users visually track their growing neural network as simple greetings evolve into complex fluency, ensuring that every learned structure is **permanently hardwired through contextual activation**.

---

## 💡 How It Aligns With the Hackathon Mission

| Hackathon Criteria | Neural-Sync Implementation |
|---|---|
| **Intelligent Actions** | i+1 adaptive input that pushes the learner just beyond their current level — not passive flashcards, but proactive sentence generation |
| **Deep Memory** | Persistent memory of every sentence learned, mastery level, and decay risk via Backboard.io's stateful memory layer |
| **Adaptive Behavior Intelligence** | Real-time mapping of "linguistic borders" that evolves per user — the system personalizes its approach based on strengths, weaknesses, and learning velocity |
| **Continuous Improvement** | Spaced retrieval forcing reactivation of past structures; the Knowledge Graph densifies with every conversation, and the system gets smarter over time |

---

## 🏗️ Architecture Overview

```
│                    FRONTEND                          │
│  React App + D3.js Knowledge Graph + Voice UI        │
│  - Mic capture & audio streaming                     │
│  - Interactive neural graph visualization            │
│  - Session dashboard & progress metrics              │
└──────────────┬──────────────────┬────────────────────┘
               │                  │
               ▼                  ▼
┌──────────────────────┐  ┌────────────────────────────┐
│   SPEECHMATICS API   │  │      VOICE SYNTHESIS       │
│  Real-time STT       │  │  (Web Speech API / OpenAI  │
│  - Multilingual      │  │   TTS for responses)       │
│  - Pronunciation     │  │                            │
│    confidence scores  │  │                            │
└──────────┬───────────┘  └────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────┐
│                 ORCHESTRATION LAYER                   │
│  Python/Node backend                                 │
│                                                      │
│  ┌─────────────────┐    ┌──────────────────────────┐ │
│  │  BACKBOARD.IO    │    │  OPENAI GPT-5.3          │ │
│  │  Memory Layer    │    │  Intelligence Engine     │ │
│  │                  │    │                          │ │
│  │ - User profile   │◄──►│ - i+1 sentence gen      │ │
│  │ - Learned items  │    │ - Level assessment       │ │
│  │ - Mastery scores │    │ - Border mapping         │ │
│  │ - Decay tracking │    │ - Retrieval scheduling   │ │
│  │ - Entity graph   │    │ - Conversation flow      │ │
│  └─────────────────┘    └──────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

---

## 🔧 Tech Stack

### Core Sponsors (all three integrated)

| Tool | Role | Why |
|---|---|---|
| **Speechmatics** | Real-time Speech-to-Text | Multilingual recognition, pronunciation confidence scoring, language detection. The "ear" of the system. |
| **Backboard.io** | Persistent AI Memory | Stores learner profiles, sentence mastery, decay timers, entity relationships across sessions. The "long-term brain." SDK: `pip install backboard-sdk` / `npm install backboard-sdk` |
| **OpenAI GPT-5.3** | Adaptive Intelligence | Generates i+1 sentences, evaluates learner level, manages pedagogical logic, orchestrates retrieval. The "reasoning engine." |

### Frontend

| Tool | Role |
|---|---|
| **React** (or Next.js) | Main application shell |
| **D3.js** / **vis.js** | Interactive Knowledge Graph visualization |
| **Web Audio API** | Mic capture + audio streaming to Speechmatics |
| **Web Speech API** / **OpenAI TTS** | Voice output for the tutor |

### Backend

| Tool | Role |
|---|---|
| **Python (FastAPI)** or **Node.js (Express)** | Orchestration server |
| **WebSocket** | Real-time bidirectional audio/text streaming |

---

## 🧪 Core Features (MVP Scope for 24h)

### 1. Voice Conversation Loop (Priority 1 — MUST HAVE)
- User speaks in target language via microphone
- Speechmatics transcribes in real-time
- GPT evaluates the sentence, identifies level, generates the next i+1 prompt
- Backboard stores the interaction with mastery metadata
- TTS speaks the response back to the user

### 2. Linguistic Border Mapping (Priority 1 — MUST HAVE)
- After a few exchanges, the system identifies what the user CAN and CANNOT express
- Builds an internal "border map" of linguistic competence
- Uses this map to always push i+1 — not too easy, not too hard

### 3. Active Retrieval & Decay Prevention (Priority 2 — SHOULD HAVE)
- Backboard tracks when each sentence was last activated
- System periodically forces retrieval of "at-risk" structures in new contexts
- Example: user learned "Je voudrais un café" 30 min ago → system generates a new situation requiring "Je voudrais..." in a different context

### 4. Knowledge Graph Visualization (Priority 2 — SHOULD HAVE)
- Interactive D3.js graph showing:
  - Nodes = learned sentences/structures
  - Edges = shared vocabulary/grammar links
  - Color = mastery level (green = solid, yellow = at risk, red = decaying)
  - Size = usage frequency
- Real-time updates as the user learns

### 5. Session Dashboard (Priority 3 — NICE TO HAVE)
- Stats: sentences learned, mastery %, session duration
- Progress over time
- Linguistic border expansion visualization

---

## 🗺️ 24-Hour Roadmap

### Phase 1: Foundation 
- [ ] Project scaffolding (frontend + backend)
- [ ] Speechmatics WebSocket integration — mic → STT working
- [ ] Backboard.io setup — assistant + thread creation
- [ ] OpenAI API connection — basic prompt/response
- [ ] **Checkpoint: can speak into mic and get a text transcription + AI response**

### Phase 2: Core Loop
- [ ] Full voice conversation loop: speak → transcribe → GPT process → TTS respond
- [ ] Backboard memory integration: store each sentence with metadata (mastery, timestamp, grammar tags)
- [ ] i+1 logic: GPT system prompt that uses Backboard memory to generate the next appropriate sentence
- [ ] Linguistic border detection: after 5+ exchanges, system builds a competence profile
- [ ] **Checkpoint: full voice learning session works end-to-end**

### Phase 3: Intelligence & Memory 
- [ ] Decay tracking: tag sentences with "last activated" timestamps in Backboard
- [ ] Retrieval forcing: system weaves old structures into new prompts
- [ ] Refine i+1 adaptation based on accumulated border data
- [ ] Error correction flow: detect pronunciation/grammar issues and provide feedback
- [ ] **Checkpoint: system demonstrates memory and adaptation across a multi-turn session**

### Phase 4: Knowledge Graph & Polish
- [ ] D3.js Knowledge Graph: nodes, edges, color coding
- [ ] Real-time graph updates during conversation
- [ ] Session dashboard with key metrics
- [ ] UI/UX polish — make it demo-ready
- [ ] **Checkpoint: visually stunning, demo-ready product**

### Phase 5: Demo Prep
- [ ] Prepare demo script (2-3 min live demo)
- [ ] Edge case testing
- [ ] Pitch deck / slides if needed
- [ ] Record backup demo video

---

## 📂 Project Structure (Proposed)

```
neural-sync/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── VoiceInterface.jsx      # Mic + audio controls
│   │   │   ├── KnowledgeGraph.jsx      # D3.js graph
│   │   │   ├── ConversationPanel.jsx   # Live transcript
│   │   │   └── Dashboard.jsx           # Stats & progress
│   │   ├── hooks/
│   │   │   ├── useSpeechmatics.js      # Speechmatics WebSocket
│   │   │   └── useAudioCapture.js      # Mic stream
│   │   ├── services/
│   │   │   └── api.js                  # Backend API calls
│   │   └── App.jsx
│   └── package.json
├── backend/
│   ├── main.py                         # FastAPI server
│   ├── services/
│   │   ├── speechmatics_service.py     # STT integration
│   │   ├── backboard_service.py        # Memory layer
│   │   ├── openai_service.py           # GPT intelligence
│   │   └── orchestrator.py             # Core learning loop
│   ├── models/
│   │   └── schemas.py                  # Data models
│   └── requirements.txt
├── .env                                # API keys (DO NOT COMMIT)
├── .env.example
└── README.md
```

---

## 🔑 Environment Variables

```env
# Speechmatics
SPEECHMATICS_API_KEY=your_key_here

# Backboard.io
BACKBOARD_API_KEY=bk_your_key_here

# OpenAI
OPENAI_API_KEY=sk-your_key_here
OPENAI_ORG_ID=org-your_org_here
```

---

## 🏆 Why We Win

1. **All 3 sponsors deeply integrated** — not token usage, real architectural dependency
2. **Voice-first by design** — not a text app with a mic bolted on
3. **Memory is the product** — Backboard isn't a nice-to-have, it IS the learning engine
4. **Visually striking** — the Knowledge Graph is an instant "wow" for judges
5. **Grounded in real science** — Krashen's i+1, spaced retrieval, active recall
6. **Real-world utility** — language learning is a massive market, this is a credible product

---
