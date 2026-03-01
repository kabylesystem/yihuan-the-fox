"""
Text-to-Speech Service — Edge TTS first (fast, free, neural), OpenAI fallback.

Priority:
1. Edge TTS (Microsoft) — free, all languages, neural quality, ~150ms
2. OpenAI TTS (nova) — rate-limited but high quality
3. Browser SpeechSynthesis — last resort
"""

import asyncio
import base64
import logging
import os
import time

from backend.config import MOCK_MODE

logger = logging.getLogger(__name__)

# Edge TTS neural voice for French
_EDGE_VOICE = "fr-FR-DeniseNeural"


class TTSService:
    """TTS: Edge TTS → OpenAI → browser."""

    def __init__(self):
        self.mock_mode = MOCK_MODE
        self._openai_cooldown_until = 0.0
        if not self.mock_mode:
            self._init_openai_client()

    def set_language(self, language: str):
        pass  # Only FR for demo

    def _init_openai_client(self):
        from openai import AsyncOpenAI
        api_key = os.getenv("OPENAI_API_KEY", "")
        org_id = os.getenv("OPENAI_ORG_ID", "")
        self._client = AsyncOpenAI(
            api_key=api_key,
            organization=org_id if org_id else None,
        )

    async def synthesize(self, text: str) -> dict:
        if self.mock_mode:
            return {"mode": "browser", "text": text}
        return await self._real_synthesize(text)

    async def _real_synthesize(self, text: str) -> dict:
        # ── 1. Edge TTS (fast, free, neural French) ──────────────────
        result = await self._edge_synthesize(text)
        if result:
            return result

        # ── 2. OpenAI TTS (fallback) ─────────────────────────────────
        if time.perf_counter() >= self._openai_cooldown_until:
            result = await self._openai_synthesize(text)
            if result:
                return result

        # ── 3. Browser fallback ──────────────────────────────────────
        logger.warning("All TTS providers failed → browser fallback")
        return {"mode": "browser", "text": text}

    async def _edge_synthesize(self, text: str) -> dict | None:
        """Microsoft Edge TTS — free, neural, ~150ms."""
        t0 = time.perf_counter()
        try:
            import edge_tts
            communicate = edge_tts.Communicate(text, _EDGE_VOICE, rate="+15%")
            audio_chunks: list[bytes] = []
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    audio_chunks.append(chunk["data"])
            audio_bytes = b"".join(audio_chunks)
            if not audio_bytes:
                return None
            audio_base64 = base64.b64encode(audio_bytes).decode("utf-8")
            tts_ms = int((time.perf_counter() - t0) * 1000)
            logger.info("Edge TTS: %dms, %d chars → %d bytes", tts_ms, len(text), len(audio_bytes))
            return {
                "mode": "audio",
                "audio_base64": audio_base64,
                "content_type": "audio/mpeg",
                "text": text,
            }
        except Exception as exc:
            logger.warning("Edge TTS failed: %s", exc)
            return None

    async def _openai_synthesize(self, text: str) -> dict | None:
        """OpenAI TTS (nova) — fallback."""
        t0 = time.perf_counter()
        try:
            response = await asyncio.wait_for(
                self._client.audio.speech.create(
                    model="tts-1",
                    voice="nova",
                    input=text,
                    response_format="mp3",
                    speed=1.15,
                ),
                timeout=6,
            )
            audio_bytes = response.content
            audio_base64 = base64.b64encode(audio_bytes).decode("utf-8")
            tts_ms = int((time.perf_counter() - t0) * 1000)
            logger.info("OpenAI TTS: %dms, %d chars → %d bytes", tts_ms, len(text), len(audio_bytes))
            return {
                "mode": "audio",
                "audio_base64": audio_base64,
                "content_type": "audio/mp3",
                "text": text,
            }
        except asyncio.TimeoutError:
            logger.warning("OpenAI TTS timed out (6s)")
            return None
        except Exception as exc:
            logger.warning("OpenAI TTS failed: %s", exc)
            if "429" in str(exc) or "rate_limit" in str(exc).lower():
                self._openai_cooldown_until = time.perf_counter() + 120
            return None
