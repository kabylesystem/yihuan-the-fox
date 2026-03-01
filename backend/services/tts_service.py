"""
Text-to-Speech Service — Speechmatics first (sponsor, all languages), then fallbacks.

Priority:
1. Speechmatics TTS — all languages, neural, fast, hackathon sponsor ✓
2. OpenAI TTS (nova) — rate-limited (200 RPD free tier)
3. Browser SpeechSynthesis — last resort

Google TTS removed: too unreliable on Railway (timeouts, bot-blocking).
"""

import asyncio
import base64
import logging
import os
import time

from backend.config import MOCK_MODE

logger = logging.getLogger(__name__)

# Speechmatics TTS — best female voice per language
_SPEECHMATICS_VOICE_MAP: dict[str, str] = {
    "fr": "zoe",       # French female
    "es": "isabelle",  # Spanish female
    "de": "zoe",
    "it": "zoe",
    "pt": "zoe",
    "ja": "zoe",
    "ko": "zoe",
    "zh": "zoe",
    "ar": "zoe",
    "ru": "zoe",
    "nl": "zoe",
    "tr": "zoe",
    "hi": "zoe",
    "sv": "zoe",
    "pl": "zoe",
    "en": "sarah",     # English female UK
}

_SPEECHMATICS_TTS_URL = "https://preview.tts.speechmatics.com/generate/{voice}"

# Keep one persistent aiohttp session for connection reuse (faster subsequent calls)
_aiohttp_session: "aiohttp.ClientSession | None" = None


async def _get_session() -> "aiohttp.ClientSession":
    """Return a shared aiohttp session (creates one if needed)."""
    global _aiohttp_session
    import aiohttp
    if _aiohttp_session is None or _aiohttp_session.closed:
        _aiohttp_session = aiohttp.ClientSession()
    return _aiohttp_session


class TTSService:
    """TTS: Speechmatics → OpenAI → browser."""

    def __init__(self):
        self.mock_mode = MOCK_MODE
        self._language = "fr"
        self._openai_cooldown_until = 0.0
        if not self.mock_mode:
            self._speechmatics_api_key = os.getenv("SPEECHMATICS_API_KEY", "")
            self._init_openai_client()

    def set_language(self, language: str):
        self._language = language

    def _init_openai_client(self):
        from openai import AsyncOpenAI
        api_key = os.getenv("OPENAI_API_KEY", "")
        org_id = os.getenv("OPENAI_ORG_ID", "")
        self._openai_client = AsyncOpenAI(
            api_key=api_key,
            organization=org_id if org_id else None,
        )

    async def synthesize(self, text: str) -> dict:
        if self.mock_mode:
            return {"mode": "browser", "text": text}
        return await self._real_synthesize(text)

    async def _real_synthesize(self, text: str) -> dict:
        # ── 1. Speechmatics TTS (primary — all languages) ─────────────
        if self._speechmatics_api_key:
            result = await self._speechmatics_synthesize(text)
            if result:
                return result

        # ── 2. OpenAI TTS (rate-limited fallback) ─────────────────────
        if time.perf_counter() >= self._openai_cooldown_until:
            result = await self._openai_synthesize(text)
            if result:
                return result

        # ── 3. Browser fallback ───────────────────────────────────────
        logger.warning("All TTS providers failed → browser fallback")
        return {"mode": "browser", "text": text}

    async def _speechmatics_synthesize(self, text: str) -> dict | None:
        """Speechmatics TTS — persistent session for speed, retry once on failure."""
        t0 = time.perf_counter()
        voice = _SPEECHMATICS_VOICE_MAP.get(self._language, "zoe")
        url = _SPEECHMATICS_TTS_URL.format(voice=voice)
        headers = {"Authorization": f"Bearer {self._speechmatics_api_key}"}
        payload = {"text": text[:500]}  # cap to avoid oversized requests

        for attempt in range(2):  # try twice — network hiccups happen
            try:
                import aiohttp
                session = await _get_session()
                async with session.post(
                    url, json=payload, headers=headers,
                    timeout=aiohttp.ClientTimeout(total=6)  # 6s max
                ) as resp:
                    if resp.status == 401:
                        logger.error("Speechmatics TTS: invalid API key (401)")
                        return None  # no point retrying
                    if resp.status == 429:
                        logger.warning("Speechmatics TTS: rate limited (429)")
                        return None
                    if resp.status != 200:
                        logger.warning("Speechmatics TTS HTTP %d (attempt %d)", resp.status, attempt + 1)
                        await asyncio.sleep(0.2)
                        continue
                    audio_bytes = await resp.read()

                if not audio_bytes:
                    logger.warning("Speechmatics TTS: empty response (attempt %d)", attempt + 1)
                    continue

                audio_base64 = base64.b64encode(audio_bytes).decode("utf-8")
                tts_ms = int((time.perf_counter() - t0) * 1000)
                logger.info("Speechmatics TTS [%s/%s]: %dms, %d bytes", self._language, voice, tts_ms, len(audio_bytes))
                return {
                    "mode": "audio",
                    "audio_base64": audio_base64,
                    "content_type": "audio/wav",
                    "text": text,
                }
            except asyncio.TimeoutError:
                logger.warning("Speechmatics TTS timed out 6s (attempt %d)", attempt + 1)
                # Reset session on timeout — stale connection
                global _aiohttp_session
                if _aiohttp_session and not _aiohttp_session.closed:
                    await _aiohttp_session.close()
                _aiohttp_session = None
            except Exception as exc:
                logger.warning("Speechmatics TTS failed: %s (attempt %d)", exc, attempt + 1)
                # Reset session on error
                if _aiohttp_session and not _aiohttp_session.closed:
                    await _aiohttp_session.close()
                _aiohttp_session = None

        return None

    async def _openai_synthesize(self, text: str) -> dict | None:
        """OpenAI TTS (nova) — rate-limited backup."""
        t0 = time.perf_counter()
        try:
            response = await asyncio.wait_for(
                self._openai_client.audio.speech.create(
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
            logger.info("OpenAI TTS: %dms, %d bytes", tts_ms, len(audio_bytes))
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
            if "per day" in str(exc).lower() or "rpd" in str(exc).lower():
                self._openai_cooldown_until = time.perf_counter() + 86400
            elif "429" in str(exc) or "rate_limit" in str(exc).lower():
                self._openai_cooldown_until = time.perf_counter() + 30
            return None
