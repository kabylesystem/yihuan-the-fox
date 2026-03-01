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

from backend.config import MOCK_MODE

logger = logging.getLogger(__name__)

_FALLBACK_RESPONSE = {
    "spoken_response": "Je t'entends. Donne-moi une phrase courte sur ce que tu aimes.",
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

# System prompt without curly brace JSON examples (Backboard uses LangChain templates)
_SYSTEM_PROMPT_BACKBOARD = (
    "You are a warm French tutor applying Krashen's i+1 hypothesis. Return ONLY valid JSON (no markdown fences, no explanation text).\n\n"
    "*** KRASHEN'S i+1 — CORE PRINCIPLE ***\n"
    "The learner acquires language through COMPREHENSIBLE INPUT slightly above their level.\n"
    "- NEVER drill or instruct ('now say X', 'try saying Y', 'repeat after me')\n"
    "- Instead, have a GENUINE conversation. React to what they said with interest.\n"
    "- Your response IS the i+1: use structures ONE step above their current level\n"
    "- Model correct French naturally — if they make errors, recast correctly in your reply\n"
    "  (e.g., they say 'je suis habite Paris' → you say 'Ah, tu habites à Paris ! Moi aussi j'aime Paris.')\n"
    "- End with a natural open question that invites them to keep talking\n\n"
    "*** CONVERSATION CONTEXT (passive — do NOT mention these to the learner) ***\n"
    "A thematic context may be provided with each message (e.g., 'talking about yourself').\n"
    "- Use it to shape the TOPIC of your questions, not to give instructions\n"
    "- Create situations where the learner might naturally produce relevant language\n"
    "- Example: context is 'say your name' → ask 'Comment tu t'appelles ?' NOT 'Dis ton nom'\n"
    "- If the learner goes off-topic, follow THEIR lead — acquisition > task completion\n\n"
    "RULES:\n"
    "- spoken_response: 1-2 natural French sentences + ONE open-ended question (never an instruction)\n"
    "- vocabulary_breakdown: array of objects with word, translation, part_of_speech\n"
    "- graph_links: array of objects with source, target, type (semantic|conjugation|prerequisite)\n"
    "- Always try to reuse at least one fading unit from earlier turns in reactivated_elements\n"
    "- user_vocabulary: MUST list words/phrases the USER said (never empty). Even 'Bonjour' becomes ['bonjour']\n"
    "- Never output both a phrase and its split tokens in user_vocabulary\n"
    "- Keep contractions intact: j'habite, je m'appelle, ca va\n"
    "- corrections: array of objects with as_said, corrected, rule, severity\n"
    "- validated_user_units: array of objects with text, kind, source, confidence, is_accepted, reject_reason, canonical_key, mission_relevance\n"
    "- quality_score: float 0..1 based on grammatical quality and relevance\n"
    "- next_mission_hint: one short concrete speaking objective (A1-A2)\n"
    "- mission_progress: object with done, total, percent\n"
    "- mastery_scores: cumulative dict, never drop old words\n"
    "- corrected_form: empty string if no errors, corrected sentence if errors\n"
    "- translation_hint: English translation of spoken_response\n"
    "- new_elements: new French words/phrases introduced this turn\n"
    "- user_level_assessment: CEFR level (A1, A1+, A2)\n"
    "- border_update: what the learner can now do\n"
)

# System prompt with JSON example for OpenAI (supports json_object mode)
_SYSTEM_PROMPT_OPENAI = (
    "You are a warm French tutor applying Krashen's i+1 hypothesis. Return ONLY valid JSON.\n\n"
    "*** KRASHEN'S i+1 — CORE PRINCIPLE ***\n"
    "The learner acquires language through COMPREHENSIBLE INPUT slightly above their level.\n"
    "- NEVER drill or instruct ('now say X', 'try saying Y', 'repeat after me')\n"
    "- Instead, have a GENUINE conversation. React to what they said with interest.\n"
    "- Your response IS the i+1: use structures ONE step above their current level\n"
    "- Model correct French naturally — if they make errors, recast correctly in your reply\n"
    "  (e.g., they say 'je suis habite Paris' → you say 'Ah, tu habites à Paris ! Moi aussi j'aime Paris.')\n"
    "- End with a natural open question that invites them to keep talking\n\n"
    "*** CONVERSATION CONTEXT (passive — do NOT mention these to the learner) ***\n"
    "A thematic context may be provided with each message (e.g., 'talking about yourself').\n"
    "- Use it to shape the TOPIC of your questions, not to give instructions\n"
    "- Create situations where the learner might naturally produce relevant language\n"
    "- Example: context is 'say your name' → ask 'Comment tu t'appelles ?' NOT 'Dis ton nom'\n"
    "- If the learner goes off-topic, follow THEIR lead — acquisition > task completion\n\n"
    "RULES:\n"
    "- spoken_response: 1-2 natural French sentences + ONE open-ended question (never an instruction)\n"
    "- vocabulary_breakdown: array of {word, translation, part_of_speech}\n"
    "- graph_links: array of {source, target, type} where type is semantic|conjugation|prerequisite\n"
    "- Always try to reuse at least one fading unit from earlier turns; include it in reactivated_elements\n"
    "- user_vocabulary: MUST list words/phrases the USER said (never empty). Even 'Bonjour' -> ['bonjour']\n"
    "- Never output both a phrase and its split tokens in user_vocabulary\n"
    "  Bad: ['ca va', 'ca', 'va'] | Good: ['ca va']\n"
    "- Keep contractions and chunks intact: \"j'habite\", \"je m'appelle\", \"ca va\"\n"
    "- corrections: concise array of {as_said, corrected, rule, severity}\n"
    "- validated_user_units: array of {text, kind, source, confidence, is_accepted, reject_reason}\n"
    "- validated_user_units must include canonical_key and mission_relevance\n"
    "- quality_score: float 0..1 based on grammatical quality and relevance\n"
    "- next_mission_hint: one short concrete speaking objective (A1-A2) like food, today, hobbies, work, travel\n"
    "- mission_progress: object {done,total,percent}\n"
    "- mastery_scores: cumulative dict, never drop old words\n\n"
    "EXAMPLE JSON:\n"
    "{\n"
    '  "spoken_response": "Bonjour ! Comment tu t\'appelles ?",\n'
    '  "translation_hint": "Hello! What is your name?",\n'
    '  "corrected_form": "",\n'
    '  "vocabulary_breakdown": [{"word": "comment", "translation": "how", "part_of_speech": "adverb"}],\n'
    '  "new_elements": ["comment", "tu t\'appelles"],\n'
    '  "reactivated_elements": ["bonjour"],\n'
    '  "user_level_assessment": "A1",\n'
    '  "border_update": "Can greet. Next: introduce yourself.",\n'
    '  "mastery_scores": {"bonjour": 0.3},\n'
    '  "graph_links": [{"source": "bonjour", "target": "comment", "type": "prerequisite"}],\n'
    '  "user_vocabulary": ["bonjour"],\n'
    '  "validated_user_units": [{"text":"bonjour","kind":"word","source":"as_said","confidence":0.95,"is_accepted":true,"reject_reason":null,"canonical_key":"bonjour","mission_relevance":0.8}],\n'
    '  "corrections": [],\n'
    '  "quality_score": 0.82,\n'
    '  "latency_ms": {"stt": 0, "llm": 0, "total": 0},\n'
    '  "next_mission_hint": "Introduce yourself in two short sentences.",\n'
    '  "mission_progress": {"done": 1, "total": 3, "percent": 33}\n'
    "}"
)


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
    text = (user_text or "").strip().replace("\u2019", "'")
    if not text:
        return ["bonjour"]
    lower = text.lower()
    chunks: list[str] = []
    if "ça va" in lower or "ca va" in lower:
        chunks.append("ça va")
    if "je m'appelle" in lower:
        chunks.append("je m'appelle")
    if "j'habite" in lower or "j habite" in lower:
        chunks.append("j'habite")
    if "j'aime" in lower or "j aime" in lower:
        chunks.append("j'aime")
    if chunks:
        return list(dict.fromkeys(chunks))

    tokens = re.findall(r"[A-Za-zÀ-ÿ']+", text)
    stop = {"je", "tu", "il", "elle", "nous", "vous", "de", "du", "des", "et", "un", "une", "le", "la", "les", "est"}
    kept = [t.lower() for t in tokens if len(t) > 1 and t.lower() not in stop]
    if not kept:
        return [text.lower()]
    return list(dict.fromkeys(kept[:3]))


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
        parsed["corrections"] = [item for item in corr if isinstance(item, dict)]
    # Coerce quality_score
    parsed["quality_score"] = _coerce_float(parsed.get("quality_score"), 0.55)
    return parsed


class OpenAIService:
    """AI tutor service using Backboard.io (primary) and OpenAI (fallback)."""

    def __init__(self):
        self.mock_mode = MOCK_MODE
        self._backboard_client = None
        self._backboard_assistant_id = None
        self._backboard_thread_id = None
        if not self.mock_mode:
            self._init_real_client()
            self._init_backboard_client()

    def reset(self):
        """Clear conversation history for a fresh session."""
        if not self.mock_mode:
            self._conversation_history = []
            # Create a new thread for fresh conversation
            self._backboard_thread_id = None

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

    async def generate_response(
        self, user_text: str, turn_number: int, mission_context: str = ""
    ) -> dict:
        """Generate an AI tutor response for the user's input."""
        if self.mock_mode:
            return self._mock_generate(turn_number)
        return await self._real_generate(user_text, mission_context=mission_context)

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
        first = units[0] if units else "bonjour"

        # Natural i+1 conversation — genuine questions, no drilling
        templates = [
            (f"Ah, « {first} » ! Moi aussi. Et toi, comment tu t'appelles ?",
             f"Ah, '{first}'! Me too. And you, what's your name?"),
            (f"Super, « {first} » ! Moi, j'adore Paris. Et toi, tu habites où ?",
             f"Great, '{first}'! I love Paris. And you, where do you live?"),
            (f"Oh, « {first} » — c'est intéressant ! Qu'est-ce que tu fais dans la vie ?",
             f"Oh, '{first}' — that's interesting! What do you do for a living?"),
            (f"J'aime bien « {first} » ! Et qu'est-ce que tu aimes manger ?",
             f"I like '{first}'! And what do you like to eat?"),
            (f"Ah oui, « {first} » ! Moi, j'aime beaucoup le chocolat. Et toi, qu'est-ce que tu aimes ?",
             f"Oh yes, '{first}'! I really love chocolate. And you, what do you like?"),
            (f"Très bien ! « {first} ». Et aujourd'hui, tu as fait quoi ?",
             f"Very good! '{first}'. And today, what did you do?"),
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
                    name="Echo French Tutor",
                    system_prompt=_SYSTEM_PROMPT_BACKBOARD,
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
        self._conversation_history.append(
            {"role": "user", "content": user_text}
        )

        messages = [
            {"role": "system", "content": _SYSTEM_PROMPT_OPENAI},
            *self._conversation_history,
        ]

        try:
            completion = await asyncio.wait_for(
                self._client.chat.completions.create(
                    model=self._model,
                    messages=messages,
                    temperature=0.6,
                    max_tokens=450,
                    response_format={"type": "json_object"},
                ),
                timeout=15,
            )
        except asyncio.TimeoutError:
            logger.error("OpenAI GPT timed out (15s)")
            self._conversation_history.pop()
            return None
        except Exception as exc:
            logger.error("OpenAI GPT error (%s): %s", type(exc).__name__, exc)
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

    async def _real_generate(self, user_text: str, mission_context: str = "") -> dict:
        """Generate using Backboard (primary), OpenAI (fallback), rule-based (last resort)."""
        # Prepend mission context to user text for AI awareness
        enriched_text = f"{mission_context}\nUser said: {user_text}" if mission_context else user_text

        # Strategy 1: Backboard.io (GPT-4o, no rate limit issues)
        result = await self._backboard_generate(enriched_text)
        if result:
            logger.info("Response from Backboard (GPT-4o)")
            return result

        # Strategy 2: OpenAI direct (gpt-4o-mini, may hit rate limits)
        logger.info("Backboard failed, trying OpenAI direct...")
        result = await self._openai_generate(enriched_text)
        if result:
            logger.info("Response from OpenAI direct")
            return result

        # Strategy 3: Rule-based fallback (always works)
        logger.warning("Both LLMs failed, using rule-based fallback")
        return self._rule_based_fallback(user_text, mission_context=mission_context)
