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

# Common stop words across supported languages — used to filter out
# function words from fallback vocabulary extraction. This is a best-effort
# set covering the most frequent function words; the AI's user_vocabulary
# field is the primary source of vocabulary units.
_STOP_WORDS = {
    # Filler / interjections (universal)
    "euh", "um", "uh", "ah", "oh", "hm", "hmm", "ben", "bah", "hein",
    # English (interface language)
    "i", "me", "my", "you", "your", "he", "she", "it", "we", "they",
    "the", "a", "an", "is", "am", "are", "was", "were", "be", "been",
    "do", "does", "did", "have", "has", "had", "and", "or", "but", "not",
    "yes", "no", "so", "if", "in", "on", "at", "to", "of", "for",
    # French
    "je", "tu", "il", "elle", "on", "nous", "vous", "ils", "elles",
    "le", "la", "les", "un", "une", "des", "du", "de", "d",
    "à", "au", "aux", "en", "et", "ou", "mais", "donc", "car",
    "que", "qui", "ne", "pas", "est", "ont", "sont", "c",
    "ce", "se", "y", "l", "s", "n", "oui", "non", "très",
    "suis", "es", "sommes", "avons", "avez", "fait", "ca", "ça",
    # Spanish
    "yo", "tú", "él", "ella", "usted", "nosotros", "ellos", "ellas",
    "el", "lo", "las", "los", "es", "son", "sí",
    "que", "de", "en", "y", "no", "por", "con", "para",
    # German
    "ich", "du", "er", "sie", "wir", "ihr", "das", "der", "die",
    "ist", "bin", "sind", "und", "oder", "aber", "nicht", "ja", "nein",
    "ein", "eine", "den", "dem", "des",
    # Italian
    "io", "lui", "lei", "noi", "voi", "loro",
    "è", "sono", "di", "che", "con", "per", "sì",
    # Portuguese
    "eu", "ele", "ela", "nós", "eles", "elas",
    "é", "são", "sim", "não", "com", "para",
    # Chinese / Japanese / Korean — single-char particles
    "的", "了", "是", "在", "我", "你", "他", "她",
    "は", "が", "を", "に", "で", "の", "と",
    "은", "는", "이", "가", "을", "를",
}


def _extract_user_vocabulary(user_text: str) -> list[str]:
    """Extract meaningful words/phrases from user's spoken text (any language).

    Used as a fallback when OpenAI doesn't return user_vocabulary.
    Works with Latin scripts (incl. contractions), CJK, Cyrillic, Arabic, Devanagari.
    """
    text = user_text.strip()
    if not text:
        return []

    # Match word tokens: Latin (with accents + contractions), CJK characters,
    # Cyrillic, Arabic, Devanagari, Hangul
    tokens = re.findall(
        r"[a-zA-ZàâäéèêëïîôùûüÿçœæÀÂÄÉÈÊËÏÎÔÙÛÜŸÇŒÆáíóúñÁÍÓÚÑößÖÜÄ]+"
        r"(?:'[a-zA-ZàâäéèêëïîôùûüÿçœæÀÂÄÉÈÊËÏÎÔÙÛÜŸÇŒÆáíóúñÁÍÓÚÑößÖÜÄ]+)?"
        r"|[\u4e00-\u9fff\u3400-\u4dbf]+"   # CJK
        r"|[\u3040-\u309f\u30a0-\u30ff]+"    # Hiragana + Katakana
        r"|[\uac00-\ud7af\u1100-\u11ff]+"    # Hangul
        r"|[\u0400-\u04ff]+"                 # Cyrillic
        r"|[\u0600-\u06ff\u0750-\u077f]+"    # Arabic
        r"|[\u0900-\u097f]+"                 # Devanagari
        , text
    )

    result = []
    for token in tokens:
        lower = token.lower()
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
    return re.findall(r"\w+", _normalize_text(value))


def _extract_pattern_candidates(corrected_text: str) -> list[dict]:
    """Extract grammar pattern candidates from corrected text.

    Language-agnostic: patterns are detected from multi-word phrases
    that the AI already corrected. Specific pattern detection for
    individual languages can be added here as needed.
    """
    candidates: list[dict] = []
    # French patterns (only fire if text contains French markers)
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
    if re.search(r"\b(?:ça va|ca va)\b", corrected_text):
        candidates.append({
            "text": "ça va",
            "kind": "pattern",
            "source": "corrected",
            "canonical_key": "pattern:greeting_ca_va",
        })
    # Spanish patterns
    if re.search(r"\bme llamo\s+\w+", corrected_text):
        candidates.append({
            "text": "me llamo + [name]",
            "kind": "pattern",
            "source": "corrected",
            "canonical_key": "pattern:identity_me_llamo",
        })
    if re.search(r"\bme gusta\s+.+", corrected_text):
        candidates.append({
            "text": "me gusta + [object]",
            "kind": "pattern",
            "source": "corrected",
            "canonical_key": "pattern:preference_me_gusta",
        })
    # German patterns
    if re.search(r"\bich bin\s+\w+", corrected_text):
        candidates.append({
            "text": "ich bin + [noun/adj]",
            "kind": "pattern",
            "source": "corrected",
            "canonical_key": "pattern:identity_ich_bin",
        })
    return candidates


def _mission_keywords(mission_hint: str) -> set[str]:
    words = _tokenize(mission_hint)
    return {w for w in words if len(w) >= 4 and w not in _STOP_WORDS}


def _canonicalize_candidates(raw_units: list[str], corrected_text: str, source_text: str) -> list[dict]:
    """Canonicalize candidates with precedence pattern > sentence > chunk > word."""
    items: list[dict] = _extract_pattern_candidates(corrected_text)
    seen_norm: set[str] = set()

    for idx, raw in enumerate(raw_units):
        text = _normalize_text(raw)
        if not text or text in seen_norm:
            continue
        seen_norm.add(text)
        tokens = _tokenize(text)
        # Sentence = multi-word phrase with 3+ tokens (typically the first item from the LLM)
        if _contains_space(text) and len(tokens) >= 3:
            kind = "sentence"
        elif _contains_space(text):
            kind = "chunk"
        else:
            kind = "word"
        canonical_key = f"{kind}:{text}"
        # Detect common patterns across languages and promote to pattern kind
        pattern_map = {
            # French
            "je suis ": ("pattern:identity_je_suis_noun", "je suis + [noun]"),
            "j'aime ": ("pattern:preference_jaime_object", "j'aime + [object]"),
            # Spanish
            "me llamo ": ("pattern:identity_me_llamo", "me llamo + [name]"),
            "me gusta ": ("pattern:preference_me_gusta", "me gusta + [object]"),
            # German
            "ich bin ": ("pattern:identity_ich_bin", "ich bin + [noun/adj]"),
            "ich mag ": ("pattern:preference_ich_mag", "ich mag + [object]"),
        }
        matched_pattern = False
        for prefix, (pkey, ptext) in pattern_map.items():
            if text.startswith(prefix):
                canonical_key = pkey
                kind = "pattern"
                text = ptext
                matched_pattern = True
                break
        if not matched_pattern and text in {"ca va", "ça va"}:
            canonical_key = "pattern:greeting_ca_va"
            kind = "pattern"
            text = "ça va"
        items.append({
            "text": text,
            "kind": kind,
            "source": "as_said" if text in source_text else "corrected",
            "canonical_key": canonical_key,
        })

    # Only add individual word fallbacks if we have zero sentence/chunk/pattern candidates
    has_phrases = any(i["kind"] in ("sentence", "chunk", "pattern") for i in items)
    if not has_phrases:
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
    rank = {"pattern": 4, "sentence": 3, "chunk": 2, "word": 1}
    grouped: dict[str, dict] = {}
    for item in items:
        key = item["canonical_key"]
        if key not in grouped or rank.get(item["kind"], 0) > rank.get(grouped[key]["kind"], 0):
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

        if kind not in ("pattern", "sentence"):
            # Reject incomplete patterns (verb stubs without complements)
            _INCOMPLETE_PATTERNS = {
                "je suis", "j'aime", "j'ai envie de", "jai envie de",  # French
                "me llamo", "me gusta",  # Spanish
                "ich bin", "ich mag",  # German
                "io sono", "mi piace",  # Italian
            }
            if kind == "chunk" and text in _INCOMPLETE_PATTERNS:
                rejected.append({
                    "text": text, "kind": kind, "source": item["source"],
                    "confidence": 0.45, "is_accepted": False, "reject_reason": "incomplete_pattern",
                    "canonical_key": canonical_key, "mission_relevance": 0.0,
                })
                continue
            if kind == "chunk" and len(tokens) >= 10 and not canonical_key.startswith("pattern:"):
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
        if kind in ("pattern", "sentence"):
            mission_relevance = max(mission_relevance, 0.7)

        in_corrected = text in corrected_text or canonical_key.startswith("pattern:") or kind == "sentence"
        in_source = text in source_text or kind == "sentence"
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
        if kind == "sentence":
            confidence = max(confidence, 0.85)

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

        # Reject words fully covered by accepted sentences/chunks/patterns unless extremely mission-critical.
        if kind == "word" and any(tokens.issubset(s) for s in selected_token_sets) and mission_relevance < 0.95:
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
        if kind in ("pattern", "sentence"):
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

    # ── Language configuration ────────────────────────────────────────
    target_language = (mission_context or {}).get("language", "fr")
    _stt_service.set_language(target_language)
    _openai_service.set_language(target_language)
    _backboard_service.set_language(target_language)
    _tts_service.set_language(target_language)

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
        return {"type": "error", "message": "Audio not recognized — speak closer to the mic, or type your message."}

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

    # Category focus mode — learner chose to converse about a specific domain
    category_focus = mission_context.get("category_focus") if mission_context else None
    category_vocab = mission_context.get("category_vocab", []) if mission_context else []
    if category_focus:
        vocab_hint = f" The learner already knows these words in this domain: {', '.join(category_vocab)}." if category_vocab else ""
        mission_prompt_part = (
            f"\n[CATEGORY FOCUS: {category_focus.upper()}]\n"
            f"The learner has chosen to talk about the '{category_focus}' domain.{vocab_hint}\n"
            "Lead a natural conversation anchored in this theme. Ask questions, share observations, "
            "and gently reuse vocabulary from this domain. Do NOT quiz. Stay conversational.\n"
        )

    # Inject fading vocabulary so the AI naturally reactivates them
    fading_from_frontend = mission_context.get("fading_targets", []) if mission_context else []
    if fading_from_frontend:
        mission_prompt_part += (
            f"\nFading vocabulary (naturally weave 1-2 into conversation): "
            f"{', '.join(fading_from_frontend[:5])}\n"
            "Do NOT quiz or drill these — just use them naturally in YOUR speech "
            "so the learner hears them again.\n"
        )

    # ── Step 2: LLM (streaming) + TTS fires on FIRST SENTENCE mid-stream ──
    await websocket.send_json({"type": "status", "step": "thinking"})
    llm_start = time.perf_counter()

    early_tts_task = None
    tts_fire_time = [0.0]  # track when TTS was fired

    async def _on_spoken_ready(text: str):
        nonlocal early_tts_task
        tts_fire_time[0] = time.perf_counter()
        logger.info(">>> TTS FIRED mid-stream (%d chars): '%s'", len(text), text[:60])
        early_tts_task = asyncio.create_task(_tts_service.synthesize(text))

    response_data, early_spoken = await _openai_service.generate_response_streaming(
        user_text, turn_index, mission_context=mission_prompt_part,
        on_spoken_ready=_on_spoken_ready,
    )
    llm_ms = int((time.perf_counter() - llm_start) * 1000)
    logger.info(">>> PIPELINE: STT=%dms | LLM=%dms | TTS fired at +%dms from start",
                stt_ms, llm_ms, int((tts_fire_time[0] - t0) * 1000) if tts_fire_time[0] else -1)
    tutor_response = TutorResponse(**response_data)

    # ── Opener messages (category starters) — skip vocab extraction ──
    is_opener = bool((mission_context or {}).get("is_opener"))
    if is_opener:
        tutor_response.user_vocabulary = []
        tutor_response.corrected_form = ""
        logger.info("Opener message detected — skipping vocabulary extraction")

    # ── Fallback: if AI didn't return user_vocabulary, extract from user_said ──
    if not is_opener and not tutor_response.user_vocabulary and user_text:
        tutor_response.user_vocabulary = _extract_user_vocabulary(user_text)
        logger.info("Fallback user_vocabulary: %s", tutor_response.user_vocabulary)

    # ── Step 2.5: strict pedagogical validation gate ────────────────
    current_hint = state.mission_state.get("current_hint") or _build_mission_hint(state.turn, tutor_response.user_level_assessment)
    accepted_units, rejected_units, quality = _strict_validate_units(
        user_text=user_text if not is_opener else "",
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

    # Persist to Supabase after each turn
    from backend.routes.session import save_after_turn
    await save_after_turn()

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

    # ── Step 5: TTS — ALWAYS send something (audio or browser fallback) ──
    try:
        tts_result = None
        if early_tts_task:
            try:
                tts_result = await early_tts_task
            except Exception as exc:
                logger.warning("Early TTS task failed: %s", exc)
        if not tts_result:
            tts_result = await _tts_service.synthesize(tutor_response.spoken_response)
        total_to_audio = int((time.perf_counter() - t0) * 1000)
        logger.info(">>> AUDIO READY: %dms total (mode=%s)", total_to_audio, tts_result.get("mode"))
        await websocket.send_json({"type": "tts", "tts": tts_result})
    except Exception as exc:
        logger.error("TTS send failed, sending browser fallback: %s", exc)
        # ALWAYS send a TTS message so frontend doesn't hang waiting
        await websocket.send_json({"type": "tts", "tts": {"mode": "browser", "text": tutor_response.spoken_response}})

    # ── Step 6: Backboard update in background (non-critical) ─────
    async def _background_backboard():
        try:
            await _backboard_service.update_mastery(tutor_response.mastery_scores)
            await _backboard_service.update_profile(
                level=tutor_response.user_level_assessment,
                turn=state.turn - 1,
                border_update=tutor_response.border_update,
            )
        except Exception as exc:
            logger.error("Backboard update failed (non-fatal): %s", exc)

    asyncio.create_task(_background_backboard())

    # Return None — response already sent via websocket above
    return None
