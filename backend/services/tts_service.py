"""
Text-to-Speech Service — Speechmatics first (sponsor, all languages), then fallbacks.

Priority:
1. Speechmatics TTS — all languages, neural, fast, hackathon sponsor ✓
2. Google TTS (httpx) — free fallback
3. OpenAI TTS (nova) — rate-limited (200 RPD free tier)
4. Browser SpeechSynthesis — last resort
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
    "fr": "zoe",     # French female
    "es": "isabelle", # Spanish
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
    "en": "sarah",   # English female UK
}

# gTTS / Google Translate TTS language codes
_GTTS_LANG_MAP: dict[str, str] = {
    "fr": "fr", "es": "es", "de": "de", "it": "it", "pt": "pt",
    "ja": "ja", "ko": "ko", "zh": "zh-TW", "ar": "ar", "ru": "ru",
    "nl": "nl", "tr": "tr", "hi": "hi", "sv": "sv", "pl": "pl",
    "en": "en",
}

_SPEECHMATICS_TTS_URL = "https://preview.tts.speechmatics.com/generate/{voice}"


class TTSService:
    """TTS: Speechmatics → Google TTS → OpenAI → browser."""

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
        # ── 1. Speechmatics TTS (all languages) ──────────────────────
        if self._speechmatics_api_key:
            result = await self._speechmatics_synthesize(text)
            if result:
                return result

        # ── 2. Google TTS via httpx (free fallback) ───────────────────
        result = await self._google_tts_synthesize(text)
        if result:
            return result

        # ── 3. OpenAI TTS (rate-limited) ─────────────────────────────
        if time.perf_counter() >= self._openai_cooldown_until:
            result = await self._openai_synthesize(text)
            if result:
                return result

        # ── 4. Browser fallback ───────────────────────────────────────
        logger.warning("All TTS providers failed → browser fallback")
        return {"mode": "browser", "text": text}

    async def _speechmatics_synthesize(self, text: str) -> dict | None:
        """Speechmatics TTS — all languages, neural quality, hackathon sponsor."""
        t0 = time.perf_counter()
        try:
            import aiohttp
            voice = _SPEECHMATICS_VOICE_MAP.get(self._language, "zoe")
            url = _SPEECHMATICS_TTS_URL.format(voice=voice)
            headers = {"Authorization": f"Bearer {self._speechmatics_api_key}"}
            payload = {"text": text[:500], "language": self._language}

            async with aiohttp.ClientSession() as session:
                async with session.post(
                    url, json=payload, headers=headers,
                    timeout=aiohttp.ClientTimeout(total=8)
                ) as resp:
                    if resp.status != 200:
                        logger.warning("Speechmatics TTS HTTP %d", resp.status)
                        return None
                    audio_bytes = await resp.read()

            if not audio_bytes:
                return None

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
            logger.warning("Speechmatics TTS timed out (8s)")
            return None
        except Exception as exc:
            logger.warning("Speechmatics TTS failed: %s", exc)
            return None

    async def _google_tts_synthesize(self, text: str) -> dict | None:
        """Google Translate TTS via httpx — free, async, no rate limits."""
        t0 = time.perf_counter()
        try:
            import httpx
            lang = _GTTS_LANG_MAP.get(self._language, "fr")
            url = "https://translate.google.com/translate_tts"
            params = {
                "ie": "UTF-8",
                "q": text[:200],
                "tl": lang,
                "client": "tw-ob",
                "ttsspeed": "1",
            }
            headers = {
                "User-Agent": "Mozilla/5.0 (compatible; EchoBot/1.0)",
                "Referer": "https://translate.google.com/",
            }
            async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
                resp = await client.get(url, params=params, headers=headers)

            if resp.status_code != 200 or not resp.content:
                logger.warning("Google TTS HTTP %d", resp.status_code)
                return None

            audio_base64 = base64.b64encode(resp.content).decode("utf-8")
            tts_ms = int((time.perf_counter() - t0) * 1000)
            logger.info("Google TTS [%s]: %dms, %d bytes", lang, tts_ms, len(resp.content))
            return {
                "mode": "audio",
                "audio_base64": audio_base64,
                "content_type": "audio/mpeg",
                "text": text,
            }
        except asyncio.TimeoutError:
            logger.warning("Google TTS timed out (8s)")
            return None
        except Exception as exc:
            logger.warning("Google TTS failed: %s", exc)
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
