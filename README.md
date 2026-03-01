# Echo — Neural Language Lab

> **Activate Your Voice Hackathon — Feb 28 – Mar 1, 2026**

A voice-first language learning platform where every word you learn becomes a glowing node in a 3D knowledge nebula. Speak, learn, and watch your neural network grow in real time.

## What It Does

You have a natural voice conversation with an AI tutor in any of 15+ languages. The AI adapts to your level using Krashen's i+1 theory — always pushing you just beyond your comfort zone, never drilling.

Every word and sentence you use is mapped into an interactive 3D knowledge graph. Words you practice glow brighter. Words you neglect slowly fade — and the AI naturally brings them back into conversation.

## Sponsor Integrations

### Speechmatics — The Voice Engine

Speechmatics powers **both** sides of the voice pipeline:

- **STT (Speech-to-Text)**: Real-time transcription via WebSocket in `enhanced` mode. Multilingual recognition across 15+ languages with high accuracy, even for learners with accents.
- **TTS (Text-to-Speech)**: Neural voice synthesis via the Preview TTS API (`preview.tts.speechmatics.com`). Natural-sounding voices (Zoe, Sarah, Isabelle) for all supported languages. Primary audio provider — every AI response is spoken back with Speechmatics.

Speechmatics is the **primary and preferred provider** for both STT and TTS. 

### Backboard.io — The Memory Layer

Backboard stores the learner's entire linguistic profile across sessions:

- **Mastery scores** for every word and sentence learned
- **Entity graph** tracking relationships between vocabulary items
- **Decay tracking** — identifies which words are "at risk" of being forgotten
- **Persistent profiles** — switch between learners, resume sessions seamlessly

The AI tutor queries Backboard's memory to decide what to teach next. Without Backboard, the system has no memory — it IS the learning engine.

### OpenAI — The Intelligence Engine

GPT-4o-mini generates adaptive i+1 responses via streaming:

- Evaluates learner level in real time (A0 → C2)
- Generates natural conversation (never drills or quizzes)
- Extracts vocabulary with translations and grammar analysis
- Produces structured JSON for graph updates mid-stream
- TTS fires on the first sentence while the rest of the response still streams — parallel pipeline for minimal latency

## Architecture

```
Frontend (React + Three.js + Vite)
├── 3D Knowledge Nebula — force-directed graph with bloom effects
├── Voice HUD — tap-to-speak, live transcript, AI response
├── Mission system — daily goals that auto-check as you speak
└── Onboarding — language selection, level assessment

Backend (FastAPI + WebSocket)
├── Speechmatics STT (enhanced) — real-time transcription
├── Speechmatics TTS — neural voice synthesis (primary)
├── OpenAI GPT-4o-mini — streaming AI tutor responses
├── Backboard.io — persistent memory + mastery tracking
└── Supabase — session persistence + conversation history
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React, TypeScript, Three.js (R3F), Framer Motion, Tailwind CSS |
| 3D Graph | D3-force-3d, @react-three/fiber, @react-three/postprocessing |
| Backend | Python, FastAPI, WebSocket, asyncio |
| STT | Speechmatics Enhanced (WebSocket real-time) |
| TTS | Speechmatics Preview TTS API |
| AI | OpenAI GPT-4o-mini (streaming) via Backboard.io |
| Memory | Backboard.io SDK |
| Database | Supabase |
| Deploy | Vercel (frontend), Railway (backend) |

## Running Locally

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn backend.main:app --reload

# Frontend
cd frontend
npm install
npm run dev
```

Requires `.env` with: `SPEECHMATICS_API_KEY`, `BACKBOARD_API_KEY`, `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`

## Live Demo

- **App**: https://frontend-puce-kappa-7o1rgv08q5.vercel.app
- **Onboarding**: https://frontend-puce-kappa-7o1rgv08q5.vercel.app/onboarding
