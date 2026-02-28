"""
OpenAI Text-to-Speech (TTS) Service.

Mock mode: Returns text and a 'browser' mode flag so the frontend can use
the browser's built-in SpeechSynthesis API for French TTS playback.
Real mode: Calls OpenAI TTS API (gpt-4o-mini-tts) to generate audio bytes.
"""

import os
from backend.config import MOCK_MODE


class TTSService:
    """Text-to-speech service wrapping OpenAI TTS API."""

    def __init__(self):
        self.mock_mode = MOCK_MODE
        if not self.mock_mode:
            self._init_real_client()

    def _init_real_client(self):
        """Initialize AsyncOpenAI client for real-mode TTS calls."""
        from openai import AsyncOpenAI

        api_key = os.getenv("OPENAI_API_KEY", "")
        org_id = os.getenv("OPENAI_ORG_ID", "")
        self._client = AsyncOpenAI(
            api_key=api_key,
            organization=org_id if org_id else None,
        )
        self._model = "gpt-4o-mini-tts"
        self._voice = "coral"

    async def synthesize(self, text: str) -> dict:
        """Synthesize speech from text.

        Args:
            text: French text to synthesize into speech.

        Returns:
            Dictionary with synthesis result:
            - Mock mode: {"mode": "browser", "text": "<text>"}
              (frontend uses browser SpeechSynthesis)
            - Real mode: {"mode": "audio", "audio_base64": "<base64>",
              "content_type": "audio/mp3"}
        """
        if self.mock_mode:
            return self._mock_synthesize(text)
        return await self._real_synthesize(text)

    def _mock_synthesize(self, text: str) -> dict:
        """Return text for browser SpeechSynthesis playback.

        In mock mode, TTS is handled entirely by the frontend using
        the browser's built-in SpeechSynthesis API with a French voice.

        Args:
            text: French text to speak.

        Returns:
            Dictionary with mode='browser' and the text to speak.
        """
        return {
            "mode": "browser",
            "text": text,
        }

    async def _real_synthesize(self, text: str) -> dict:
        """Synthesize speech using OpenAI TTS API.

        Uses the gpt-4o-mini-tts model with instructions for natural
        French pronunciation and conversational tone.

        Args:
            text: French text to synthesize.

        Returns:
            Dictionary with mode='audio', base64-encoded audio data,
            and the content type.
        """
        import base64

        response = await self._client.audio.speech.create(
            model=self._model,
            voice=self._voice,
            input=text,
            instructions="Speak in natural, clear French with a warm, encouraging tone.",
            response_format="mp3",
        )

        audio_bytes = response.content
        audio_base64 = base64.b64encode(audio_bytes).decode("utf-8")

        return {
            "mode": "audio",
            "audio_base64": audio_base64,
            "content_type": "audio/mp3",
        }
