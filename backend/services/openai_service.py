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
        self._model = "gpt-5.2"
        self._system_prompt = (
            "You are a friendly French language tutor following Krashen's i+1 theory. "
            "Respond in French at a level slightly above the learner's current ability. "
            "For each response, provide:\n"
            "1. A spoken French response (natural, conversational)\n"
            "2. An English translation hint\n"
            "3. Vocabulary breakdown of key words (word, translation, part_of_speech)\n"
            "4. New linguistic elements introduced this turn\n"
            "5. Previously learned elements you are reactivating\n"
            "6. Current CEFR level assessment (A1, A1+, A2, etc.)\n"
            "7. A border update describing the learner's expanding linguistic ability\n"
            "8. Mastery scores (0.0-1.0) for all tracked vocabulary/structures\n\n"
            "Return your response as valid JSON matching this schema:\n"
            "{\n"
            '  "spoken_response": "...",\n'
            '  "translation_hint": "...",\n'
            '  "vocabulary_breakdown": [{"word": "...", "translation": "...", "part_of_speech": "..."}],\n'
            '  "new_elements": ["..."],\n'
            '  "reactivated_elements": ["..."],\n'
            '  "user_level_assessment": "A1",\n'
            '  "border_update": "...",\n'
            '  "mastery_scores": {"word": 0.5}\n'
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
        """Generate a tutor response using GPT-5.2 via AsyncOpenAI.

        Sends the user's French input along with the system prompt
        to produce an i+1 adaptive response with full pedagogical fields.

        Args:
            user_text: What the user said in French.

        Returns:
            Dictionary containing all TutorResponse fields parsed from GPT output.
        """
        import json

        completion = await self._client.chat.completions.create(
            model=self._model,
            messages=[
                {"role": "system", "content": self._system_prompt},
                {"role": "user", "content": user_text},
            ],
            response_format={"type": "json_object"},
            temperature=0.7,
        )

        response_text = completion.choices[0].message.content
        return json.loads(response_text)
