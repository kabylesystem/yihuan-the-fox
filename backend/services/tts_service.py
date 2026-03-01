"""
OpenAI Text-to-Speech (TTS) Service — optimized for minimum latency.

Key optimizations:
- speed=1.15 (faster speech = less audio to generate = faster response)
- tts-1 model (fastest, not HD)
- 6s timeout (fail fast)
"""

import asyncio
import logging
import os
import time

from backend.config import MOCK_MODE

logger = logging.getLogger(__name__)


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
        self._model = "tts-1"
        self._voice = "nova"

    async def synthesize(self, text: str) -> dict:
        """Synthesize speech from text."""
        if self.mock_mode:
            return self._mock_synthesize(text)
        return await self._real_synthesize(text)

    def _mock_synthesize(self, text: str) -> dict:
        """Return text for browser SpeechSynthesis playback."""
        return {"mode": "browser", "text": text}

    async def _real_synthesize(self, text: str) -> dict:
        """Synthesize speech using OpenAI TTS API.

        speed=1.15 → faster speech, less audio data to generate, quicker response.
        Timeout 6s (fail fast rather than hang).
        """
        import base64

        t0 = time.perf_counter()
        try:
            response = await asyncio.wait_for(
                self._client.audio.speech.create(
                    model=self._model,
                    voice=self._voice,
                    input=text,
                    response_format="mp3",
                    speed=1.15,
                ),
                timeout=6,
            )

            audio_bytes = response.content
            audio_base64 = base64.b64encode(audio_bytes).decode("utf-8")
            tts_ms = int((time.perf_counter() - t0) * 1000)
            logger.info("TTS: %dms for %d chars → %d bytes audio", tts_ms, len(text), len(audio_bytes))

            return {
                "mode": "audio",
                "audio_base64": audio_base64,
                "content_type": "audio/mp3",
            }

        except asyncio.TimeoutError:
            logger.error("TTS timed out (6s), falling back to browser TTS")
            return {"mode": "browser", "text": text}
        except Exception as exc:
            logger.error("TTS failed: %s, falling back to browser TTS", exc)
            return {"mode": "browser", "text": text}
