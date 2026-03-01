"""
OpenAI AI Tutor Service.

Mock mode: Returns pre-scripted TutorResponse from MOCK_CONVERSATION[turn].response.
Real mode: Calls gpt-4o-mini via AsyncOpenAI to generate i+1 adaptive French tutoring responses.
"""

import asyncio
import json
import logging
import os

from backend.config import MOCK_MODE

logger = logging.getLogger(__name__)

_FALLBACK_RESPONSE = {
    "spoken_response": "",
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


class OpenAIService:
    """AI tutor service wrapping OpenAI GPT API for i+1 response generation."""

    def __init__(self):
        self.mock_mode = MOCK_MODE
        if not self.mock_mode:
            self._init_real_client()

    def reset(self):
        """Clear conversation history for a fresh session."""
        if not self.mock_mode:
            self._conversation_history = []

    def _init_real_client(self):
        """Initialize AsyncOpenAI client for real-mode GPT calls."""
        from openai import AsyncOpenAI

        api_key = os.getenv("OPENAI_API_KEY", "")
        org_id = os.getenv("OPENAI_ORG_ID", "")
        self._client = AsyncOpenAI(
            api_key=api_key,
            organization=org_id if org_id else None,
        )
        self._model = "gpt-4o-mini"
        self._conversation_history: list[dict] = []
        self._system_prompt = (
            "You are a warm French tutor using Krashen's i+1. Return ONLY valid JSON.\n\n"
            "RULES:\n"
            "- spoken_response: 1-2 natural French sentences\n"
            "- vocabulary_breakdown: array of {word, translation, part_of_speech}\n"
            "- graph_links: array of {source, target, type} where type is semantic|conjugation|prerequisite\n"
            "- spoken_response must actively coach the next turn: end with ONE concrete question the learner can answer out loud\n"
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

    async def generate_response(
        self, user_text: str, turn_number: int
    ) -> dict:
        """Generate an AI tutor response for the user's input."""
        if self.mock_mode:
            return self._mock_generate(turn_number)
        return await self._real_generate(user_text)

    def _mock_generate(self, turn_number: int) -> dict:
        """Return pre-scripted TutorResponse for the given turn."""
        from backend.mock_data import MOCK_CONVERSATION

        if turn_number < 0 or turn_number >= len(MOCK_CONVERSATION):
            return dict(_FALLBACK_RESPONSE)
        return MOCK_CONVERSATION[turn_number]["response"]

    async def _real_generate(self, user_text: str) -> dict:
        """Generate a tutor response using gpt-4o-mini with 10s timeout."""
        self._conversation_history.append(
            {"role": "user", "content": user_text}
        )

        messages = [
            {"role": "system", "content": self._system_prompt},
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
                timeout=10,
            )
        except asyncio.TimeoutError:
            logger.error("OpenAI GPT timed out (10s)")
            self._conversation_history.pop()  # Remove failed user message
            return dict(_FALLBACK_RESPONSE)
        except Exception as exc:
            logger.error("OpenAI GPT error: %s", exc)
            self._conversation_history.pop()
            return dict(_FALLBACK_RESPONSE)

        response_text = completion.choices[0].message.content

        self._conversation_history.append(
            {"role": "assistant", "content": response_text}
        )

        try:
            parsed = json.loads(response_text)
            # Ensure all required fields exist
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
            vu = parsed.get("validated_user_units", [])
            if isinstance(vu, list):
                parsed["validated_user_units"] = [item for item in vu if isinstance(item, dict)]
            corr = parsed.get("corrections", [])
            if isinstance(corr, list):
                parsed["corrections"] = [item for item in corr if isinstance(item, dict)]
            return parsed
        except (json.JSONDecodeError, TypeError) as exc:
            logger.error("Failed to parse GPT response: %s", exc)
            return dict(_FALLBACK_RESPONSE)
