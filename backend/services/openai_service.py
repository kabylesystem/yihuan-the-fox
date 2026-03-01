"""
AI Tutor Service for Echo Neural Language Lab.

Mock mode: Returns pre-scripted TutorResponse from MOCK_CONVERSATION[turn].response.
Real mode: Uses Backboard.io AI assistants (GPT-4o) as primary LLM.
           Falls back to OpenAI GPT direct calls if Backboard fails.
           Falls back to rule-based responses as last resort.
"""

import asyncio
import json
import logging
import os
import random
import re
import time

from backend.config import MOCK_MODE

logger = logging.getLogger(__name__)

_FALLBACK_RESPONSE = {
    "spoken_response": "I hear you. Give me a short sentence about what you like.",
    "translation_hint": "",
    "corrected_form": "",
    "vocabulary_breakdown": [],
    "new_elements": [],
    "reactivated_elements": [],
    "user_level_assessment": "A1",
    "border_update": "",
    "mastery_scores": {},
    "graph_links": [],
    "user_vocabulary": [],
    "validated_user_units": [],
    "corrections": [],
    "quality_score": 0.55,
    "latency_ms": {"stt": 0, "llm": 0, "total": 0},
    "next_mission_hint": "Describe your favorite activity in one sentence.",
    "mission_progress": {"done": 0, "total": 3, "percent": 0},
}

# ── Language-specific data ─────────────────────────────────────────────────

_LANGUAGE_NAMES = {
    "fr": "French", "es": "Spanish", "de": "German", "it": "Italian",
    "pt": "Portuguese", "ja": "Japanese", "ko": "Korean", "zh": "Chinese",
    "ar": "Arabic", "ru": "Russian", "nl": "Dutch", "tr": "Turkish",
    "hi": "Hindi", "sv": "Swedish", "pl": "Polish",
}

_LANGUAGE_GREETINGS = {
    "fr": ("Bonjour ! Comment tu t'appelles ?", "Hello! What is your name?", "bonjour"),
    "es": ("¡Hola! ¿Cómo te llamas?", "Hello! What is your name?", "hola"),
    "de": ("Hallo! Wie heißt du?", "Hello! What is your name?", "hallo"),
    "it": ("Ciao! Come ti chiami?", "Hello! What is your name?", "ciao"),
    "pt": ("Olá! Como te chamas?", "Hello! What is your name?", "olá"),
    "ja": ("こんにちは！お名前は？", "Hello! What is your name?", "こんにちは"),
    "ko": ("안녕하세요! 이름이 뭐예요?", "Hello! What is your name?", "안녕하세요"),
    "zh": ("你好！你叫什么名字？", "Hello! What is your name?", "你好"),
    "ar": ("مرحبا! ما اسمك؟", "Hello! What is your name?", "مرحبا"),
    "ru": ("Привет! Как тебя зовут?", "Hello! What is your name?", "привет"),
    "nl": ("Hallo! Hoe heet je?", "Hello! What is your name?", "hallo"),
    "tr": ("Merhaba! Adın ne?", "Hello! What is your name?", "merhaba"),
    "hi": ("नमस्ते! आपका नाम क्या है?", "Hello! What is your name?", "नमस्ते"),
    "sv": ("Hej! Vad heter du?", "Hello! What is your name?", "hej"),
    "pl": ("Cześć! Jak masz na imię?", "Hello! What is your name?", "cześć"),
}


def _build_system_prompt(language: str = "fr") -> str:
    """Build language-aware system prompt. spoken_response MUST be FIRST key for fast mid-stream extraction."""
    lang_name = _LANGUAGE_NAMES.get(language, language.title())
    greeting, greeting_en, greeting_word = _LANGUAGE_GREETINGS.get(
        language, _LANGUAGE_GREETINGS["fr"]
    )

    return (
        f"You are a warm {lang_name} conversation partner (Krashen i+1). Return ONLY valid JSON.\n"
        "CRITICAL RULES:\n"
        "1. YOU ARE AN AI. NEVER say things like 'j'ai eu une bonne journée', 'j'ai rencontré des amis', or ANY statement about your own day/life/feelings. This is FORBIDDEN.\n"
        "2. ALWAYS ask questions about THE LEARNER'S life, experiences, and opinions — never share your own.\n"
        "3. React warmly to what they said (max 1 sentence), then ask ONE genuine question about THEM.\n"
        "4. If they send a short opener (like 'Let's go!' or 'Allons-y!'), just greet them warmly and ask what they'd like to talk about.\n"
        "5. NEVER drill or instruct. Keep it natural and conversational.\n"
        f"6. Speak {lang_name} only in spoken_response. End with ONE open question about the learner.\n"
        "7. If a conversation theme is provided, naturally steer toward it — never mention the theme explicitly.\n\n"
        "JSON keys (spoken_response MUST be FIRST):\n"
        f"- spoken_response: max 2 {lang_name} sentences — react to learner + 1 question about THEM (never about yourself)\n"
        "- translation_hint: English translation\n"
        "- corrected_form: corrected sentence or empty\n"
        "- user_vocabulary: phrases/sentences from THE USER'S MESSAGE ONLY — NEVER your own words\n"
        "- vocabulary_breakdown: [{word, translation, part_of_speech}] — from user's message only\n"
        "- graph_links: [{source, target, type}] derivation from sentence→extension\n"
        "- new_elements, reactivated_elements: string arrays from user's message only\n"
        "- mastery_scores: dict of user's vocabulary only (never your own words)\n"
        "- user_level_assessment: A1/A1+/A2\n"
        "- border_update: what learner can now do\n"
        "Skip: validated_user_units, quality_score, latency_ms, mission_progress, next_mission_hint, corrections.\n\n"
        f'EXAMPLE: {{"spoken_response":"{greeting}","translation_hint":"{greeting_en}",'
        f'"corrected_form":"","user_vocabulary":["{greeting_word.title()}"],'
        f'"vocabulary_breakdown":[],'
        f'"graph_links":[],"new_elements":[],"reactivated_elements":["{greeting_word}"],'
        f'"mastery_scores":{{"{greeting_word}":0.3}},"user_level_assessment":"A1","border_update":"Can greet."}}'
    )


# Default prompts (French) — overridden dynamically when language is set
_SYSTEM_PROMPT_LEAN = _build_system_prompt("fr")
_SYSTEM_PROMPT_BACKBOARD = _SYSTEM_PROMPT_LEAN
_SYSTEM_PROMPT_OPENAI = _SYSTEM_PROMPT_LEAN


def _norm_key(text: str) -> str:
    return (
        (text or "")
        .strip()
        .lower()
        .replace("\u2019", "'")
        .replace("'", "")
        .replace(" ", "_")
    )


def _extract_units_heuristic(user_text: str) -> list[str]:
    """Language-agnostic fallback: extract meaningful tokens from user text."""
    text = (user_text or "").strip().replace("\u2019", "'")
    if not text:
        return [text] if text else []

    # Generic tokenization — works across scripts
    tokens = re.findall(r"\w+(?:'\w+)?", text)
    # Minimal universal stop set (function words in common languages)
    stop = {
        "i", "a", "the", "is", "am", "are", "to", "of", "and", "or", "in", "on",
        "je", "tu", "il", "elle", "le", "la", "les", "un", "une", "de", "du", "des", "et", "est",
        "yo", "el", "es", "de", "y", "en",
        "ich", "du", "der", "die", "das", "und", "ist",
    }
    kept = [t.lower() for t in tokens if len(t) > 1 and t.lower() not in stop]
    if not kept:
        return [text.lower()]
    return list(dict.fromkeys(kept[:5]))


def _strip_markdown_fences(text: str) -> str:
    """Strip markdown code fences (```json ... ```) from LLM output."""
    text = text.strip()
    if text.startswith("```"):
        # Remove opening fence (```json or ```)
        first_newline = text.index("\n") if "\n" in text else len(text)
        text = text[first_newline + 1:]
    if text.endswith("```"):
        text = text[:-3]
    return text.strip()


def _coerce_float(value, default: float = 0.0) -> float:
    """Coerce a value to float, handling string labels like 'high', 'low', True/False."""
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, bool):
        return 1.0 if value else 0.0
    if isinstance(value, str):
        label_map = {"high": 0.9, "medium": 0.5, "low": 0.2, "true": 1.0, "false": 0.0}
        if value.lower() in label_map:
            return label_map[value.lower()]
        try:
            return float(value)
        except ValueError:
            return default
    return default


def _sanitize_parsed(parsed: dict) -> dict:
    """Ensure all required fields exist and sanitize list fields."""
    for key in _FALLBACK_RESPONSE:
        if key not in parsed:
            parsed[key] = _FALLBACK_RESPONSE[key]
    # Sanitize vocabulary_breakdown: must be list of dicts
    vb = parsed.get("vocabulary_breakdown", [])
    if isinstance(vb, list):
        parsed["vocabulary_breakdown"] = [
            item if isinstance(item, dict)
            else {"word": str(item), "translation": "", "part_of_speech": ""}
            for item in vb
        ]
    # Sanitize graph_links: must be list of dicts
    gl = parsed.get("graph_links", [])
    if isinstance(gl, list):
        parsed["graph_links"] = [
            item for item in gl if isinstance(item, dict)
        ]
    # Sanitize validated_user_units: coerce non-float fields
    vu = parsed.get("validated_user_units", [])
    if isinstance(vu, list):
        sanitized_vu = []
        for item in vu:
            if not isinstance(item, dict):
                continue
            item["confidence"] = _coerce_float(item.get("confidence"), 0.75)
            item["mission_relevance"] = _coerce_float(item.get("mission_relevance"), 0.5)
            if "is_accepted" not in item:
                item["is_accepted"] = True
            if isinstance(item.get("is_accepted"), str):
                item["is_accepted"] = item["is_accepted"].lower() in ("true", "yes", "1")
            sanitized_vu.append(item)
        parsed["validated_user_units"] = sanitized_vu
    corr = parsed.get("corrections", [])
    if isinstance(corr, list):
        sanitized_corr = []
        for item in corr:
            if not isinstance(item, dict):
                continue
            # Coerce severity to string (LLM sometimes returns int)
            sev = item.get("severity", "minor")
            if not isinstance(sev, str):
                item["severity"] = "major" if sev else "minor"
            for field in ("as_said", "corrected", "rule"):
                if field not in item:
                    item[field] = ""
                elif not isinstance(item[field], str):
                    item[field] = str(item[field])
            sanitized_corr.append(item)
        parsed["corrections"] = sanitized_corr
    # Coerce quality_score
    parsed["quality_score"] = _coerce_float(parsed.get("quality_score"), 0.55)
    return parsed


class OpenAIService:
    """AI tutor service using Groq (fastest), Backboard.io, and OpenAI (fallback)."""

    # Keep only last N conversation turns to reduce prompt size
    MAX_HISTORY_TURNS = 8  # 4 user + 4 assistant

    def __init__(self):
        self.mock_mode = MOCK_MODE
        self._backboard_client = None
        self._backboard_assistant_id = None
        self._backboard_thread_id = None
        self._groq_client = None
        self._language = "fr"
        self._system_prompt = _build_system_prompt("fr")
        # Rate-limit cooldown: skip providers that returned 429 recently
        self._groq_cooldown_until = 0.0
        self._openai_cooldown_until = 0.0
        if not self.mock_mode:
            self._init_real_client()
            self._init_backboard_client()
            self._init_groq_client()

    def set_language(self, language: str):
        """Switch the target language for the AI tutor."""
        if language != self._language:
            logger.info("LLM language changed: %s → %s", self._language, language)
            self._language = language
            self._system_prompt = _build_system_prompt(language)
            # Reset backboard thread so it gets the new system prompt
            self._backboard_thread_id = None
            self._backboard_assistant_id = None
            # Clear conversation history — old turns are in the wrong language
            if hasattr(self, "_conversation_history"):
                logger.info("Clearing %d history turns (language switch)", len(self._conversation_history))
                self._conversation_history = []

    def reset(self):
        """Clear conversation history for a fresh session."""
        if not self.mock_mode:
            self._conversation_history = []
            self._backboard_thread_id = None

    def inject_turn(self, user_said: str, ai_response: str):
        """Replay a historical turn into the conversation context."""
        if not self.mock_mode:
            self._conversation_history.append({"role": "user", "content": user_said})
            self._conversation_history.append({"role": "assistant", "content": ai_response})

    def _init_backboard_client(self):
        """Initialize Backboard client for primary LLM calls (GPT-4o)."""
        try:
            from backboard import BackboardClient
            api_key = os.getenv("BACKBOARD_API_KEY", "")
            if api_key:
                self._backboard_client = BackboardClient(api_key=api_key, timeout=20)
                logger.info("Backboard client initialized (primary LLM)")
            else:
                logger.warning("No BACKBOARD_API_KEY — Backboard LLM disabled")
        except ImportError:
            logger.warning("backboard package not installed — Backboard LLM disabled")
        except Exception as exc:
            logger.warning("Backboard init failed: %s", exc)

    def _init_groq_client(self):
        """Initialize Groq client for ultra-fast LLM inference (LPU hardware)."""
        try:
            from groq import AsyncGroq
            api_key = os.getenv("GROQ_API_KEY", "")
            if api_key:
                self._groq_client = AsyncGroq(api_key=api_key)
                self._groq_model = "llama-3.3-70b-versatile"
                logger.info("Groq client initialized (fastest LLM — %s)", self._groq_model)
            else:
                logger.warning("No GROQ_API_KEY — Groq LLM disabled")
        except ImportError:
            logger.warning("groq package not installed — Groq LLM disabled")
        except Exception as exc:
            logger.warning("Groq init failed: %s", exc)

    def _init_real_client(self):
        """Initialize AsyncOpenAI client for fallback GPT calls."""
        from openai import AsyncOpenAI

        api_key = os.getenv("OPENAI_API_KEY", "")
        org_id = os.getenv("OPENAI_ORG_ID", "")
        self._client = AsyncOpenAI(
            api_key=api_key,
            organization=org_id if org_id else None,
        )
        self._model = "gpt-4o-mini"
        self._conversation_history: list[dict] = []

    def _trimmed_history(self) -> list[dict]:
        """Return only the last N messages to keep prompts fast."""
        return self._conversation_history[-self.MAX_HISTORY_TURNS:]

    async def generate_response(
        self, user_text: str, turn_number: int, mission_context: str = ""
    ) -> dict:
        """Generate an AI tutor response for the user's input."""
        if self.mock_mode:
            return self._mock_generate(turn_number)
        return await self._real_generate(user_text, mission_context=mission_context)

    async def generate_response_streaming(
        self, user_text: str, turn_number: int, mission_context: str = "",
        on_spoken_ready=None,
    ) -> tuple[dict, str | None]:
        """Generate response with TRUE parallel TTS via callback.

        When spoken_response is extracted mid-stream, fires on_spoken_ready(text)
        immediately — TTS starts while remaining LLM tokens are still arriving.

        Args:
            on_spoken_ready: async callback fired as soon as spoken_response is
                             extracted from the stream. This is where TTS should start.

        Returns (full_response_dict, early_spoken_response_or_None).
        """
        if self.mock_mode:
            result = self._mock_generate(turn_number)
            spoken = result.get("spoken_response")
            if on_spoken_ready and spoken:
                asyncio.create_task(on_spoken_ready(spoken))
            return result, spoken
        return await self._real_generate_streaming(
            user_text, mission_context=mission_context, on_spoken_ready=on_spoken_ready
        )

    def _mock_generate(self, turn_number: int) -> dict:
        """Return pre-scripted TutorResponse for the given turn."""
        from backend.mock_data import MOCK_CONVERSATION

        if turn_number < 0 or turn_number >= len(MOCK_CONVERSATION):
            return dict(_FALLBACK_RESPONSE)
        return MOCK_CONVERSATION[turn_number]["response"]

    def _rule_based_fallback(self, user_text: str, mission_context: str = "") -> dict:
        units = _extract_units_heuristic(user_text)
        validated = [
            {
                "text": u,
                "kind": "chunk" if " " in u else "word",
                "source": "as_said",
                "confidence": 0.72,
                "is_accepted": True,
                "reject_reason": None,
                "canonical_key": _norm_key(u),
                "mission_relevance": 0.55,
            }
            for u in units
        ]
        first = units[0] if units else "hello"
        lang_name = _LANGUAGE_NAMES.get(self._language, self._language.title())
        greeting_data = _LANGUAGE_GREETINGS.get(self._language, _LANGUAGE_GREETINGS.get("fr"))
        greeting = greeting_data[0] if greeting_data else "Hello!"

        # Language-agnostic fallback — use the target greeting + English hint
        templates = [
            (greeting, f"Hello! What's your name? (fallback — {lang_name} AI will respond properly next turn)"),
            (greeting, f"Hello! Tell me about yourself. (fallback — {lang_name} AI will respond properly next turn)"),
        ]
        spoken, hint = random.choice(templates)

        return {
            **_FALLBACK_RESPONSE,
            "spoken_response": spoken,
            "translation_hint": hint,
            "corrected_form": "",
            "user_vocabulary": units,
            "validated_user_units": validated,
            "quality_score": 0.62,
            "next_mission_hint": "Talk about what you like and give one reason.",
            "mission_progress": {"done": 1 if user_text.strip() else 0, "total": 3, "percent": 33 if user_text.strip() else 0},
        }

    async def _backboard_generate(self, user_text: str) -> dict | None:
        """Try generating a response via Backboard.io (GPT-4o). Returns None on failure."""
        if not self._backboard_client:
            return None

        try:
            # Lazily create assistant + thread
            if not self._backboard_assistant_id:
                assistant = await self._backboard_client.create_assistant(
                    name=f"Echo {_LANGUAGE_NAMES.get(self._language, 'Language')} Tutor",
                    system_prompt=self._system_prompt,
                )
                self._backboard_assistant_id = assistant.assistant_id
                logger.info("Backboard assistant created: %s", self._backboard_assistant_id)

            if not self._backboard_thread_id:
                thread = await self._backboard_client.create_thread(
                    self._backboard_assistant_id
                )
                self._backboard_thread_id = thread.thread_id
                logger.info("Backboard thread created: %s", self._backboard_thread_id)

            # Send message and get AI response
            response = await asyncio.wait_for(
                self._backboard_client.add_message(
                    thread_id=self._backboard_thread_id,
                    content=user_text,
                    stream=False,
                ),
                timeout=20,
            )

            raw_content = response.content or ""
            logger.info(
                "Backboard response: model=%s, tokens=%s, len=%d",
                response.model_name, response.total_tokens, len(raw_content),
            )

            # Strip markdown fences and parse JSON
            cleaned = _strip_markdown_fences(raw_content)
            parsed = json.loads(cleaned)
            return _sanitize_parsed(parsed)

        except json.JSONDecodeError as exc:
            logger.warning("Backboard JSON parse failed: %s (raw=%s...)", exc, raw_content[:200])
            return None
        except asyncio.TimeoutError:
            logger.warning("Backboard timed out (20s)")
            return None
        except Exception as exc:
            logger.warning("Backboard error (%s): %s", type(exc).__name__, exc)
            return None

    async def _openai_generate(self, user_text: str) -> dict | None:
        """Try generating via OpenAI direct API. Returns None on failure."""
        if time.perf_counter() < self._openai_cooldown_until:
            logger.info("OpenAI skipped (rate-limit cooldown)")
            return None
        self._conversation_history.append(
            {"role": "user", "content": user_text}
        )

        messages = [
            {"role": "system", "content": self._system_prompt},
            *self._trimmed_history(),
        ]

        try:
            completion = await asyncio.wait_for(
                self._client.chat.completions.create(
                    model=self._model,
                    messages=messages,
                    temperature=0.6,
                    max_tokens=250,
                    response_format={"type": "json_object"},
                ),
                timeout=6,
            )
        except asyncio.TimeoutError:
            logger.error("OpenAI GPT timed out (6s)")
            self._conversation_history.pop()
            return None
        except Exception as exc:
            logger.error("OpenAI GPT error (%s): %s", type(exc).__name__, exc)
            if "rate_limit" in type(exc).__name__.lower() or "429" in str(exc):
                self._openai_cooldown_until = time.perf_counter() + 30  # 30s cooldown
                logger.info("OpenAI rate-limited → cooldown 30s")
            self._conversation_history.pop()
            return None

        response_text = completion.choices[0].message.content
        self._conversation_history.append(
            {"role": "assistant", "content": response_text}
        )

        try:
            parsed = json.loads(response_text)
            return _sanitize_parsed(parsed)
        except (json.JSONDecodeError, TypeError) as exc:
            logger.error("Failed to parse OpenAI response: %s", exc)
            return None

    async def _groq_generate_streaming(self, user_text: str, on_spoken_ready=None) -> tuple[dict | None, str | None]:
        """Stream via Groq with TRUE parallel TTS.

        Extracts spoken_response mid-stream and fires on_spoken_ready() immediately,
        so TTS runs in parallel with the remaining ~50% of LLM token generation.
        """
        if not self._groq_client:
            return None, None
        if time.perf_counter() < self._groq_cooldown_until:
            logger.info("Groq skipped (rate-limit cooldown)")
            return None, None

        messages = [
            {"role": "system", "content": self._system_prompt},
            *self._trimmed_history(),
            {"role": "user", "content": user_text},
        ]

        accumulated = ""
        early_spoken: str | None = None
        callback_fired = False

        try:
            stream = await asyncio.wait_for(
                self._groq_client.chat.completions.create(
                    model=self._groq_model,
                    messages=messages,
                    temperature=0.6,
                    max_tokens=250,
                    response_format={"type": "json_object"},
                    stream=True,
                ),
                timeout=6,
            )

            async for chunk in stream:
                delta = chunk.choices[0].delta.content or ""
                accumulated += delta

                # Extract full spoken_response and fire TTS callback immediately
                if early_spoken is None and '"spoken_response"' in accumulated:
                    match = re.search(
                        r'"spoken_response"\s*:\s*"((?:[^"\\]|\\.)*)(?:"|$)',
                        accumulated,
                    )
                    if match and match.group(0).endswith('"'):
                        early_spoken = match.group(1).replace('\\"', '"').replace('\\n', '\n')
                        logger.info("spoken_response extracted mid-stream: %s", early_spoken[:80])

                        if on_spoken_ready and not callback_fired:
                            callback_fired = True
                            asyncio.create_task(on_spoken_ready(early_spoken))
                            logger.info("TTS callback fired mid-stream (full text)")

        except asyncio.TimeoutError:
            logger.warning("Groq streaming timed out (6s)")
            return None, early_spoken
        except Exception as exc:
            logger.warning("Groq streaming error (%s): %s", type(exc).__name__, exc)
            if "rate_limit" in type(exc).__name__.lower() or "429" in str(exc):
                self._groq_cooldown_until = time.perf_counter() + 300  # 5 min cooldown
                logger.info("Groq rate-limited → cooldown 5min")
            return None, early_spoken

        if not accumulated.strip():
            return None, early_spoken

        self._conversation_history.append({"role": "user", "content": user_text})
        self._conversation_history.append({"role": "assistant", "content": accumulated})

        try:
            parsed = json.loads(accumulated)
            return _sanitize_parsed(parsed), early_spoken
        except (json.JSONDecodeError, TypeError) as exc:
            logger.warning("Groq streaming JSON parse failed: %s", exc)
            self._conversation_history = self._conversation_history[:-2]
            return None, early_spoken

    async def _groq_generate(self, user_text: str) -> dict | None:
        """Try generating via Groq (LPU — ultra-fast inference). Returns None on failure."""
        if not self._groq_client:
            return None
        if time.perf_counter() < self._groq_cooldown_until:
            return None

        messages = [
            {"role": "system", "content": self._system_prompt},
            *self._trimmed_history(),
            {"role": "user", "content": user_text},
        ]

        try:
            completion = await asyncio.wait_for(
                self._groq_client.chat.completions.create(
                    model=self._groq_model,
                    messages=messages,
                    temperature=0.6,
                    max_tokens=250,
                    response_format={"type": "json_object"},
                ),
                timeout=6,
            )
        except asyncio.TimeoutError:
            logger.warning("Groq timed out (6s)")
            return None
        except Exception as exc:
            logger.warning("Groq error (%s): %s", type(exc).__name__, exc)
            if "rate_limit" in type(exc).__name__.lower() or "429" in str(exc):
                self._groq_cooldown_until = time.perf_counter() + 300
            return None

        response_text = completion.choices[0].message.content
        self._conversation_history.append({"role": "user", "content": user_text})
        self._conversation_history.append({"role": "assistant", "content": response_text})

        try:
            parsed = json.loads(response_text)
            return _sanitize_parsed(parsed)
        except (json.JSONDecodeError, TypeError) as exc:
            logger.warning("Groq JSON parse failed: %s", exc)
            # Remove failed exchange from history
            self._conversation_history = self._conversation_history[:-2]
            return None

    async def _real_generate_streaming(self, user_text: str, mission_context: str = "", on_spoken_ready=None) -> tuple[dict, str | None]:
        """Generate with streaming + true parallel TTS via callback."""
        enriched_text = f"{mission_context}\nUser said: {user_text}" if mission_context else user_text

        # Strategy 1: Groq streaming (ultra-fast + parallel TTS callback)
        result, early_spoken = await self._groq_generate_streaming(enriched_text, on_spoken_ready=on_spoken_ready)
        if result:
            logger.info("Response from Groq streaming (early_spoken=%s)", early_spoken is not None)
            return result, early_spoken

        # Fall back to non-streaming strategies — fire callback immediately with full spoken_response
        result = await self._backboard_generate(enriched_text)
        if result:
            logger.info("Response from Backboard (GPT-4o)")
            spoken = result.get("spoken_response")
            if on_spoken_ready and spoken:
                asyncio.create_task(on_spoken_ready(spoken))
            return result, spoken

        result = await self._openai_generate(enriched_text)
        if result:
            logger.info("Response from OpenAI direct")
            spoken = result.get("spoken_response")
            if on_spoken_ready and spoken:
                asyncio.create_task(on_spoken_ready(spoken))
            return result, spoken

        logger.warning("All LLMs failed, using rule-based fallback")
        result = self._rule_based_fallback(user_text, mission_context=mission_context)
        spoken = result.get("spoken_response")
        if on_spoken_ready and spoken:
            asyncio.create_task(on_spoken_ready(spoken))
        return result, spoken

    async def _real_generate(self, user_text: str, mission_context: str = "") -> dict:
        """Generate using Groq (fastest), Backboard, OpenAI (fallback), rule-based (last resort)."""
        # Prepend mission context to user text for AI awareness
        enriched_text = f"{mission_context}\nUser said: {user_text}" if mission_context else user_text

        # Strategy 1: Groq (ultra-fast LPU inference, ~0.3-0.8s)
        result = await self._groq_generate(enriched_text)
        if result:
            logger.info("Response from Groq (LPU — fastest)")
            return result

        # Strategy 2: Backboard.io (GPT-4o, no rate limit issues)
        result = await self._backboard_generate(enriched_text)
        if result:
            logger.info("Response from Backboard (GPT-4o)")
            return result

        # Strategy 3: OpenAI direct (gpt-4o-mini, may hit rate limits)
        logger.info("Backboard failed, trying OpenAI direct...")
        result = await self._openai_generate(enriched_text)
        if result:
            logger.info("Response from OpenAI direct")
            return result

        # Strategy 4: Rule-based fallback (always works)
        logger.warning("All LLMs failed, using rule-based fallback")
        return self._rule_based_fallback(user_text, mission_context=mission_context)
