"""
OpenAI AI Tutor Service.

Mock mode: Returns pre-scripted TutorResponse from MOCK_CONVERSATION[turn].response.
Real mode: Calls GPT-5.2 via AsyncOpenAI to generate i+1 adaptive French tutoring responses.
"""

import os
from backend.config import MOCK_MODE


class OpenAIService:
    """AI tutor service wrapping OpenAI GPT API for i+1 response generation."""

    def __init__(self):
        self.mock_mode = MOCK_MODE
        if not self.mock_mode:
            self._init_real_client()

    def _init_real_client(self):
        """Initialize AsyncOpenAI client for real-mode GPT calls."""
        from openai import AsyncOpenAI

        api_key = os.getenv("OPENAI_API_KEY", "")
        org_id = os.getenv("OPENAI_ORG_ID", "")
        self._client = AsyncOpenAI(
            api_key=api_key,
            organization=org_id if org_id else None,
        )
        self._model = "o4-mini"
        self._conversation_history: list[dict] = []
        self._system_prompt = (
            "You are a friendly, encouraging French language tutor following Krashen's i+1 theory. "
            "The learner is practicing conversational French. Respond naturally in French "
            "at a level slightly above their current ability — push them just enough to grow.\n\n"
            "IMPORTANT RULES:\n"
            "- Keep spoken_response SHORT (1-3 sentences max), natural and conversational\n"
            "- Always end with a question to keep the conversation flowing\n"
            "- Track ALL vocabulary the learner has used across the conversation\n"
            "- Mastery scores should increase for words used multiple times (spaced repetition)\n"
            "- Gently correct errors in your response without being pedantic\n"
            "- Introduce 2-3 new elements per turn (i+1), never overwhelm\n"
            "- Reactivate previously learned words naturally in your responses\n\n"
            "Return ONLY valid JSON matching this exact schema:\n"
            "{\n"
            '  "spoken_response": "Your French response here",\n'
            '  "translation_hint": "English translation",\n'
            '  "vocabulary_breakdown": [{"word": "mot", "translation": "word", "part_of_speech": "noun"}],\n'
            '  "new_elements": ["new grammar or vocab introduced"],\n'
            '  "reactivated_elements": ["previously learned items reused"],\n'
            '  "user_level_assessment": "A1",\n'
            '  "border_update": "What the learner can now do",\n'
            '  "mastery_scores": {"bonjour": 0.8, "merci": 0.5}\n'
            "}"
        )

    async def generate_response(
        self, user_text: str, turn_number: int
    ) -> dict:
        """Generate an AI tutor response for the user's input.

        Args:
            user_text: What the user said in French.
            turn_number: Current conversation turn (0-indexed) for mock mode.

        Returns:
            Dictionary containing all TutorResponse fields.
        """
        if self.mock_mode:
            return self._mock_generate(turn_number)
        return await self._real_generate(user_text)

    def _mock_generate(self, turn_number: int) -> dict:
        """Return pre-scripted TutorResponse for the given turn.

        Args:
            turn_number: 0-indexed turn number.

        Returns:
            The response dict from MOCK_CONVERSATION for this turn.
        """
        from backend.mock_data import MOCK_CONVERSATION

        if turn_number < 0 or turn_number >= len(MOCK_CONVERSATION):
            return {
                "spoken_response": "",
                "translation_hint": "",
                "vocabulary_breakdown": [],
                "new_elements": [],
                "reactivated_elements": [],
                "user_level_assessment": "A1",
                "border_update": "",
                "mastery_scores": {},
            }
        return MOCK_CONVERSATION[turn_number]["response"]

    async def _real_generate(self, user_text: str) -> dict:
        """Generate a tutor response using o4-mini via AsyncOpenAI.

        Maintains conversation history so the model tracks learner progress
        across multiple turns and can reactivate previously learned elements.

        Args:
            user_text: What the user said in French.

        Returns:
            Dictionary containing all TutorResponse fields parsed from model output.
        """
        import json

        # Add user message to history
        self._conversation_history.append(
            {"role": "user", "content": user_text}
        )

        messages = [
            {"role": "system", "content": self._system_prompt},
            *self._conversation_history,
        ]

        completion = await self._client.chat.completions.create(
            model=self._model,
            messages=messages,
            response_format={"type": "json_object"},
        )

        response_text = completion.choices[0].message.content

        # Add assistant response to history for context continuity
        self._conversation_history.append(
            {"role": "assistant", "content": response_text}
        )

        return json.loads(response_text)
