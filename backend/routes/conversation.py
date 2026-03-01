"""
Conversation WebSocket endpoint for Echo Neural Language Lab.

Handles real-time voice conversation flow over WebSocket at /ws/conversation.
Orchestrates the STT -> OpenAI -> Backboard -> TTS pipeline for each turn.
Sends progress status messages during processing so the frontend can show updates.

Frontend sends:
    {"type": "text", "content": "Bonjour"}       — text input
    {"type": "audio", "content": "<base64>"}      — audio input (webm/opus)

Backend responds:
    {"type": "status", "step": "..."}             — progress update
    {"type": "turn_response", "turn": {...}}       — full conversation turn
    {"type": "demo_complete", "message": "..."}    — all mock turns exhausted
    {"type": "error", "message": "..."}            — error during processing
"""

import asyncio
import json
import logging
import re
import time

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from backend.config import MOCK_MODE
from backend.mock_data import MOCK_CONVERSATION
from backend.models import ConversationTurn, TutorResponse
from backend.routes.session import get_session_state
from backend.services.backboard_service import BackboardService
from backend.services.openai_service import OpenAIService
from backend.services.speechmatics_service import SpeechmaticsService
from backend.services.tts_service import TTSService

logger = logging.getLogger(__name__)

# French stop words to exclude from fallback vocabulary extraction
_STOP_WORDS = {
    "je", "tu", "il", "elle", "on", "nous", "vous", "ils", "elles",
    "le", "la", "les", "un", "une", "des", "du", "de", "d",
    "à", "au", "aux", "en", "et", "ou", "mais", "donc", "car",
    "que", "qui", "ne", "pas", "est", "a", "ont", "sont", "c",
    "ce", "se", "y", "l", "s", "n", "oui", "non", "très",
    "suis", "es", "sommes", "etes", "êtes", "vais", "va", "vont",
    "ai", "as", "avons", "avez", "fait", "faire", "ca", "ça",
    "euh", "um", "ben", "bah", "hein",
}


def _extract_user_vocabulary(user_text: str) -> list[str]:
    """Extract meaningful French words/phrases from user's spoken text.

    Used as a fallback when OpenAI doesn't return user_vocabulary.
    Handles contractions like j'habite, j'aime as single units.
    """
    text = user_text.strip()
    if not text:
        return []

    # Split on spaces but keep contractions together (j'habite, l'école, etc.)
    tokens = re.findall(r"[a-zA-ZàâäéèêëïîôùûüÿçœæÀÂÄÉÈÊËÏÎÔÙÛÜŸÇŒÆ]+(?:'[a-zA-ZàâäéèêëïîôùûüÿçœæÀÂÄÉÈÊËÏÎÔÙÛÜŸÇŒÆ]+)?", text)

    result = []
    for token in tokens:
        lower = token.lower()
        # Skip stop words and very short tokens
        if lower in _STOP_WORDS or len(lower) < 2:
            continue
        result.append(token)

    # If everything was filtered out, keep the original text as-is
    if not result and text:
        result = [text]

    return result


def _normalize_text(value: str) -> str:
    return " ".join((value or "").strip().lower().replace("\u2019", "'").split())


def _contains_space(value: str) -> bool:
    return " " in _normalize_text(value)


def _tokenize(value: str) -> list[str]:
    return re.findall(r"[a-zA-Zàâäéèêëïîôùûüÿçœæ]+", _normalize_text(value))


def _extract_pattern_candidates(corrected_text: str) -> list[dict]:
    candidates: list[dict] = []
    if re.search(r"\bje suis\s+\w+", corrected_text):
        candidates.append({
            "text": "je suis + [noun]",
            "kind": "pattern",
            "source": "corrected",
            "canonical_key": "pattern:identity_je_suis_noun",
        })
    if re.search(r"\bj'aime\s+.+", corrected_text):
        candidates.append({
            "text": "j'aime + [object]",
            "kind": "pattern",
            "source": "corrected",
            "canonical_key": "pattern:preference_jaime_object",
        })
    if re.search(r"\bj'ai envie de\s+\w+", corrected_text):
        candidates.append({
            "text": "j'ai envie de + [infinitive]",
            "kind": "pattern",
            "source": "corrected",
            "canonical_key": "pattern:desire_jai_envie_de_infinitive",
        })
    if re.search(r"\b(?:ça va|ca va)\b", corrected_text):
        candidates.append({
            "text": "ça va",
            "kind": "pattern",
            "source": "corrected",
            "canonical_key": "pattern:greeting_ca_va",
        })
    return candidates


def _mission_keywords(mission_hint: str) -> set[str]:
    words = _tokenize(mission_hint)
    return {w for w in words if len(w) >= 4 and w not in _STOP_WORDS}


def _canonicalize_candidates(raw_units: list[str], corrected_text: str, source_text: str) -> list[dict]:
    """Canonicalize candidates with precedence pattern > chunk > word."""
    items: list[dict] = _extract_pattern_candidates(corrected_text)
    seen_norm: set[str] = set()

    for raw in raw_units:
        text = _normalize_text(raw)
        if not text or text in seen_norm:
            continue
        seen_norm.add(text)
        kind = "chunk" if _contains_space(text) else "word"
        canonical_key = f"{kind}:{text}"
        if text.startswith("je suis "):
            canonical_key = "pattern:identity_je_suis_noun"
            kind = "pattern"
            text = "je suis + [noun]"
        elif text.startswith("j'aime "):
            canonical_key = "pattern:preference_jaime_object"
            kind = "pattern"
            text = "j'aime + [object]"
        elif text.startswith("j'ai envie de "):
            canonical_key = "pattern:desire_jai_envie_de_infinitive"
            kind = "pattern"
            text = "j'ai envie de + [infinitive]"
        elif text in {"ca va", "ça va"}:
            canonical_key = "pattern:greeting_ca_va"
            kind = "pattern"
            text = "ça va"
        items.append({
            "text": text,
            "kind": kind,
            "source": "as_said" if text in source_text else "corrected",
            "canonical_key": canonical_key,
        })

    # Add words from corrected text as fallback lexical candidates
    for tok in _tokenize(corrected_text):
        if tok in _STOP_WORDS or len(tok) <= 1:
            continue
        key = f"word:{tok}"
        if any(i.get("canonical_key") == key for i in items):
            continue
        items.append({
            "text": tok,
            "kind": "word",
            "source": "corrected",
            "canonical_key": key,
        })

    # Group by canonical key and keep best by precedence.
    rank = {"pattern": 3, "chunk": 2, "word": 1}
    grouped: dict[str, dict] = {}
    for item in items:
        key = item["canonical_key"]
        if key not in grouped or rank[item["kind"]] > rank[grouped[key]["kind"]]:
            grouped[key] = item
    return list(grouped.values())


def _strict_validate_units(
    user_text: str,
    corrected_form: str,
    raw_units: list[str],
    mission_hint: str,
) -> tuple[list[dict], list[dict], float]:
    source_text = _normalize_text(user_text)
    corrected_text = _normalize_text(corrected_form) if corrected_form else source_text
    candidates = raw_units or _extract_user_vocabulary(user_text)
    canonical_items = _canonicalize_candidates(candidates, corrected_text, source_text)
    mission_kw = _mission_keywords(mission_hint)

    accepted: list[dict] = []
    rejected: list[dict] = []
    selected_token_sets: list[set[str]] = []
    selected_pattern_token_sets: list[set[str]] = []

    for item in canonical_items:
        text = item["text"]
        kind = item["kind"]
        canonical_key = item["canonical_key"]
        tokens = set(_tokenize(text))

        if kind != "pattern":
            if kind == "chunk" and text in {"je suis", "j'aime", "j'ai envie de", "jai envie de"}:
                rejected.append({
                    "text": text, "kind": kind, "source": item["source"],
                    "confidence": 0.45, "is_accepted": False, "reject_reason": "incomplete_pattern",
                    "canonical_key": canonical_key, "mission_relevance": 0.0,
                })
                continue
            if kind == "chunk" and len(tokens) >= 5 and not canonical_key.startswith("pattern:"):
                rejected.append({
                    "text": text, "kind": kind, "source": item["source"],
                    "confidence": 0.5, "is_accepted": False, "reject_reason": "too_broad",
                    "canonical_key": canonical_key, "mission_relevance": 0.0,
                })
                continue
            if len(text) <= 1:
                rejected.append({
                    "text": text, "kind": kind, "source": item["source"],
                    "confidence": 0.3, "is_accepted": False, "reject_reason": "too_short",
                    "canonical_key": canonical_key, "mission_relevance": 0.0,
                })
                continue
            if text in _STOP_WORDS:
                rejected.append({
                    "text": text, "kind": kind, "source": item["source"],
                    "confidence": 0.35, "is_accepted": False, "reject_reason": "stop_word",
                    "canonical_key": canonical_key, "mission_relevance": 0.0,
                })
                continue

        mission_relevance = 0.0
        if mission_kw:
            overlap = len(tokens.intersection(mission_kw))
            mission_relevance = min(1.0, overlap / max(1, len(mission_kw)))
        if kind == "pattern":
            mission_relevance = max(mission_relevance, 0.7)

        in_corrected = text in corrected_text or canonical_key.startswith("pattern:")
        in_source = text in source_text
        if corrected_form and not in_corrected and kind in ("chunk", "word"):
            rejected.append({
                "text": text, "kind": kind, "source": item["source"],
                "confidence": 0.5, "is_accepted": False, "reject_reason": "grammar_invalid",
                "canonical_key": canonical_key, "mission_relevance": mission_relevance,
            })
            continue
        confidence = 0.9 if (in_source and in_corrected) else (0.75 if (in_source or in_corrected) else 0.55)
        if kind == "pattern":
            confidence = max(confidence, 0.82)

        # Borderline confidence needs mission relevance.
        if confidence < 0.6:
            rejected.append({
                "text": text, "kind": kind, "source": item["source"],
                "confidence": confidence, "is_accepted": False, "reject_reason": "low_confidence",
                "canonical_key": canonical_key, "mission_relevance": mission_relevance,
            })
            continue
        if confidence < 0.72 and mission_relevance < 0.5:
            rejected.append({
                "text": text, "kind": kind, "source": item["source"],
                "confidence": confidence, "is_accepted": False, "reject_reason": "off_mission",
                "canonical_key": canonical_key, "mission_relevance": mission_relevance,
            })
            continue

        if kind in ("chunk", "word") and any(tokens and tokens.issubset(p) for p in selected_pattern_token_sets):
            rejected.append({
                "text": text, "kind": kind, "source": item["source"],
                "confidence": confidence, "is_accepted": False, "reject_reason": "covered_by_pattern",
                "canonical_key": canonical_key, "mission_relevance": mission_relevance,
            })
            continue

        # Reject words fully covered by accepted chunks/patterns unless mission-critical.
        if kind == "word" and any(tokens.issubset(s) for s in selected_token_sets) and mission_relevance < 0.8:
            rejected.append({
                "text": text, "kind": kind, "source": item["source"],
                "confidence": confidence, "is_accepted": False, "reject_reason": "covered_by_chunk",
                "canonical_key": canonical_key, "mission_relevance": mission_relevance,
            })
            continue

        accepted.append({
            "text": text,
            "kind": kind,
            "source": item["source"],
            "confidence": confidence,
            "is_accepted": True,
            "reject_reason": None,
            "canonical_key": canonical_key,
            "mission_relevance": mission_relevance,
        })
        selected_token_sets.append(tokens)
        if kind == "pattern":
            selected_pattern_token_sets.append(tokens)

    accepted_ratio = (len(accepted) / max(1, len(canonical_items)))
    correction_penalty = 0.2 if corrected_form and _normalize_text(corrected_form) != source_text else 0.0
    quality = max(0.0, min(1.0, accepted_ratio * 0.7 + (0.3 if accepted else 0.0) - correction_penalty))
    return accepted, rejected, quality


def _build_mission_hint(turn_number: int, level: str) -> str:
    missions = [
        "Introduce yourself in two short sentences.",
        "Say where you live and why you like that place.",
        "Talk about a favorite activity using 'I like... because...'.",
        "Describe your plan for tonight in two sentences.",
        "Ask one simple question to your conversation partner.",
    ]
    idx = min(len(missions) - 1, max(0, turn_number - 1))
    prefix = "Mission A1-A2"
    if level.startswith("A2"):
        prefix = "Mission A2+"
    return f"{prefix}: {missions[idx]}"


router = APIRouter(tags=["conversation"])

# Shared service instances — single-user demo, instantiated once.
_stt_service = SpeechmaticsService()
_openai_service = OpenAIService()
_backboard_service = BackboardService()
_tts_service = TTSService()


@router.websocket("/ws/conversation")
async def conversation_ws(websocket: WebSocket) -> None:
    """WebSocket endpoint for real-time conversation with the AI tutor."""
    await websocket.accept()

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json(
                    {"type": "error", "message": "Invalid JSON"}
                )
                continue

            msg_type = message.get("type", "")
            content = message.get("content", "")
            mission_context = message.get("mission_context")

            if msg_type not in ("text", "audio"):
                await websocket.send_json(
                    {"type": "error", "message": f"Unknown message type: {msg_type}"}
                )
                continue

            state = get_session_state()
            if state.demo_complete:
                await websocket.send_json({
                    "type": "demo_complete",
                    "message": "Demo complete! Reset to try again.",
                })
                continue

            try:
                result = await _process_turn(
                    websocket=websocket,
                    msg_type=msg_type,
                    content=content,
                    state=state,
                    mission_context=mission_context,
                )
                # _process_turn sends turn_response directly via websocket.
                # If it returns a dict (e.g. error), send it.
                if result is not None:
                    await websocket.send_json(result)
            except Exception as exc:
                logger.exception("Error processing conversation turn")
                await websocket.send_json(
                    {"type": "error", "message": str(exc)}
                )

    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")


async def _process_turn(
    websocket: WebSocket,
    msg_type: str,
    content: str,
    state: "SessionState",
    mission_context: dict | None = None,
) -> dict:
    """Process a single conversation turn through the full pipeline.

    Sends status messages via WebSocket during processing so the
    frontend can show progress updates to the user.
    """
    turn_index = state.turn - 1
    total_mock_turns = len(MOCK_CONVERSATION)
    t0 = time.perf_counter()
    stt_ms = 0
    llm_ms = 0

    # ── Step 1: STT ──────────────────────────────────────────────────
    if msg_type == "audio":
        await websocket.send_json({"type": "status", "step": "transcribing"})
        import base64

        audio_bytes = base64.b64decode(content)
        stt_start = time.perf_counter()
        user_text = await _stt_service.transcribe(audio_bytes, turn_index)
        stt_ms = int((time.perf_counter() - stt_start) * 1000)
    else:
        if _stt_service.mock_mode:
            user_text = _stt_service._mock_transcribe(turn_index)
        else:
            user_text = content

    if not user_text:
        return {"type": "error", "message": "Could not understand audio — try again or type instead."}

    # ── Build conversational context for the AI (i+1 style) ─────────
    # The AI should use this to shape the TOPIC of conversation, not to drill.
    # Missions are passive detectors — the AI creates natural context.
    mission_prompt_part = ""
    if mission_context:
        todo_topics = [
            t.get("label", "")
            for t in (mission_context.get("tasks") or [])
            if not t.get("done")
        ]
        done_topics = [
            t.get("label", "")
            for t in (mission_context.get("tasks") or [])
            if t.get("done")
        ]
        topics_str = ", ".join(todo_topics) if todo_topics else "free conversation"
        mission_prompt_part = (
            f"\n[CONVERSATION THEME: {mission_context.get('title', '')}]\n"
            f"Topics the learner hasn't touched yet: {topics_str}\n"
        )
        if done_topics:
            mission_prompt_part += f"Topics already covered: {', '.join(done_topics)}\n"
        mission_prompt_part += (
            "REMEMBER: Do NOT instruct or drill. Create a natural conversational situation "
            "where the learner might spontaneously use language related to these topics. "
            "Ask genuine questions about THEIR life. Follow their lead if they go elsewhere.\n"
        )

    # ── Step 2: OpenAI (i+1 response generation) ─────────────────────
    await websocket.send_json({"type": "status", "step": "thinking"})
    llm_start = time.perf_counter()
    response_data = await _openai_service.generate_response(
        user_text, turn_index, mission_context=mission_prompt_part
    )
    llm_ms = int((time.perf_counter() - llm_start) * 1000)
    tutor_response = TutorResponse(**response_data)

    # ── Fallback: if AI didn't return user_vocabulary, extract from user_said ──
    if not tutor_response.user_vocabulary and user_text:
        tutor_response.user_vocabulary = _extract_user_vocabulary(user_text)
        logger.info("Fallback user_vocabulary: %s", tutor_response.user_vocabulary)

    # ── Step 2.5: strict pedagogical validation gate ────────────────
    current_hint = state.mission_state.get("current_hint") or _build_mission_hint(state.turn, tutor_response.user_level_assessment)
    accepted_units, rejected_units, quality = _strict_validate_units(
        user_text=user_text,
        corrected_form=tutor_response.corrected_form,
        raw_units=tutor_response.user_vocabulary,
        mission_hint=current_hint,
    )
    tutor_response.validated_user_units = accepted_units + rejected_units
    tutor_response.user_vocabulary = [u["text"] for u in accepted_units]
    tutor_response.quality_score = quality
    tutor_response.next_mission_hint = _build_mission_hint(state.turn, tutor_response.user_level_assessment)
    tutor_response.corrections = tutor_response.corrections or (
        [{
            "as_said": user_text,
            "corrected": tutor_response.corrected_form,
            "rule": "Use the correct infinitive structure after modal verbs.",
            "severity": "major",
        }] if tutor_response.corrected_form and _normalize_text(tutor_response.corrected_form) != _normalize_text(user_text) else []
    )
    total_ms = int((time.perf_counter() - t0) * 1000)
    tutor_response.latency_ms = {"stt": stt_ms, "llm": llm_ms, "total": total_ms}

    # Mission progress (3 deterministic tasks max)
    mission_tasks = [
        {"id": "quality", "label": "Reach at least 70% quality", "done": quality >= 0.7},
        {"id": "units", "label": "Validate at least 2 useful units", "done": len(accepted_units) >= 2},
        {"id": "turns", "label": "Complete 2 turns in this session", "done": state.turn >= 2},
    ]
    done_count = len([t for t in mission_tasks if t["done"]])
    mission_progress = {"done": done_count, "total": 3, "percent": int((done_count / 3) * 100)}
    tutor_response.mission_progress = mission_progress

    # ── Step 3: Update session state immediately ────────────────────
    turn = ConversationTurn(
        turn_number=state.turn,
        user_said=user_text,
        response=tutor_response,
    )
    state.conversation_history.append(turn)
    state.level = tutor_response.user_level_assessment
    state.mastery_scores.update(tutor_response.mastery_scores)
    state.mission_state = {
        "current_hint": tutor_response.next_mission_hint,
        "tasks": mission_tasks,
        **mission_progress,
    }
    state.turn += 1
    state.diagnostics.append({
        "turn": turn.turn_number,
        "latency_ms": tutor_response.latency_ms,
        "quality_score": tutor_response.quality_score,
        "accepted_count": len(accepted_units),
        "rejected_count": len(rejected_units),
        "mission_progress": mission_progress,
    })
    state.diagnostics = state.diagnostics[-20:]

    if MOCK_MODE and state.turn > total_mock_turns:
        state.demo_complete = True

    # ── Step 4: Send text response NOW (don't wait for TTS) ────────
    response_payload = {
        "type": "turn_response",
        "turn": turn.model_dump(),
        "pedagogy": {
            "quality_score": tutor_response.quality_score,
            "accepted_units": accepted_units,
            "rejected_units": rejected_units,
            "canonical_units": [u for u in accepted_units if u.get("canonical_key")],
            "next_mission_hint": tutor_response.next_mission_hint,
            "mission_progress": mission_progress,
            "mission_tasks": mission_tasks,
        },
        "timings": tutor_response.latency_ms,
        "tts": None,
        "session": {
            "turn": state.turn,
            "level": state.level,
            "demo_complete": state.demo_complete,
        },
    }
    await websocket.send_json(response_payload)

    # ── Step 5: TTS + Backboard in background ──────────────────────
    async def _background_tasks():
        # TTS — send audio as follow-up message
        try:
            tts_result = await _tts_service.synthesize(
                tutor_response.spoken_response
            )
            await websocket.send_json({"type": "tts", "tts": tts_result})
        except Exception as exc:
            logger.error("TTS failed (non-fatal): %s", exc)

        # Backboard — persist memory
        try:
            await _backboard_service.update_mastery(tutor_response.mastery_scores)
            await _backboard_service.update_profile(
                level=tutor_response.user_level_assessment,
                turn=state.turn - 1,
                border_update=tutor_response.border_update,
            )
        except Exception as exc:
            logger.error("Backboard update failed (non-fatal): %s", exc)

    asyncio.create_task(_background_tasks())

    # Return None — response already sent via websocket above
    return None
