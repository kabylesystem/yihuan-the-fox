"""
Text-to-Speech Service — multi-provider with automatic fallback.

Priority:
1. Speechmatics TTS (English only)
2. gTTS (Google TTS) — free, all languages, works on Railway, ~300ms
3. Edge TTS (Microsoft) — free, neural quality, may be blocked on some hosts
4. OpenAI TTS (nova) — rate-limited (200 RPD free tier)
5. Browser SpeechSynthesis — last resort
"""

import asyncio
import base64
import logging
import os
import time

from backend.config import MOCK_MODE

logger = logging.getLogger(__name__)

# Edge TTS neural voices per language
_EDGE_VOICE_MAP: dict[str, str] = {
    "fr": "fr-FR-DeniseNeural",
    "es": "es-ES-ElviraNeural",
    "de": "de-DE-KatjaNeural",
    "it": "it-IT-ElsaNeural",
    "pt": "pt-PT-RaquelNeural",
    "ja": "ja-JP-NanamiNeural",
    "ko": "ko-KR-SunHiNeural",
    "zh": "zh-CN-XiaoxiaoNeural",
    "ar": "ar-SA-ZariyahNeural",
    "ru": "ru-RU-SvetlanaNeural",
    "nl": "nl-NL-ColetteNeural",
    "tr": "tr-TR-EmelNeural",
    "hi": "hi-IN-SwaraNeural",
    "sv": "sv-SE-SofieNeural",
    "pl": "pl-PL-ZofiaNeural",
    "en": "en-US-JennyNeural",
}

# gTTS language codes
_GTTS_LANG_MAP: dict[str, str] = {
    "fr": "fr", "es": "es", "de": "de", "it": "it", "pt": "pt",
    "ja": "ja", "ko": "ko", "zh": "zh-TW", "ar": "ar", "ru": "ru",
    "nl": "nl", "tr": "tr", "hi": "hi", "sv": "sv", "pl": "pl",
    "en": "en",
}

# Speechmatics TTS endpoint + voices (English only)
_SPEECHMATICS_TTS_URL = "https://preview.tts.speechmatics.com/generate/{voice}"
_SPEECHMATICS_VOICES = {
    "en": "sarah",
    "en-us": "megan",
}


class TTSService:
    """TTS service: Speechmatics (EN) → gTTS → Edge TTS → OpenAI → browser."""

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
        self._model = "tts-1"
        self._voice = "nova"

    async def synthesize(self, text: str) -> dict:
        if self.mock_mode:
            return {"mode": "browser", "text": text}
        return await self._real_synthesize(text)

    async def _real_synthesize(self, text: str) -> dict:
        lang = self._language

        # ── 1. Speechmatics TTS (English only) ───────────────────────
        if lang in ("en", "en-us", "en-gb") and self._speechmatics_api_key:
            result = await self._speechmatics_synthesize(text)
            if result:
                return result

        # ── 2. gTTS (Google TTS) — free, reliable on Railway ─────────
        result = await self._gtts_synthesize(text)
        if result:
            return result

        # ── 3. Edge TTS (may be blocked on Railway) ───────────────────
        result = await self._edge_synthesize(text)
        if result:
            return result

        # ── 4. OpenAI TTS (rate-limited) ─────────────────────────────
        if time.perf_counter() >= self._openai_cooldown_until:
            result = await self._openai_synthesize(text)
            if result:
                return result

        # ── 5. Browser fallback ───────────────────────────────────────
        logger.warning("All TTS providers failed → browser fallback")
        return {"mode": "browser", "text": text}

    async def _gtts_synthesize(self, text: str) -> dict | None:
        """Google TTS (gTTS) — free, all languages, works on Railway."""
        t0 = time.perf_counter()
        try:
            import io
            from gtts import gTTS

            lang = _GTTS_LANG_MAP.get(self._language, "fr")
            loop = asyncio.get_event_loop()

            def _generate():
                tts = gTTS(text=text, lang=lang, slow=False)
                buf = io.BytesIO()
                tts.write_to_fp(buf)
                buf.seek(0)
                return buf.read()

            audio_bytes = await asyncio.wait_for(
                loop.run_in_executor(None, _generate),
                timeout=8,
            )
            if not audio_bytes:
                return None

            audio_base64 = base64.b64encode(audio_bytes).decode("utf-8")
            tts_ms = int((time.perf_counter() - t0) * 1000)
            logger.info("gTTS: %dms, %d chars, lang=%s", tts_ms, len(text), lang)
            return {
                "mode": "audio",
                "audio_base64": audio_base64,
                "content_type": "audio/mpeg",
                "text": text,
            }
        except asyncio.TimeoutError:
            logger.warning("gTTS timed out (8s)")
            return None
        except Exception as exc:
            logger.warning("gTTS failed: %s", exc)
            return None

    async def _speechmatics_synthesize(self, text: str) -> dict | None:
        """Speechmatics TTS — English only."""
        t0 = time.perf_counter()
        try:
            import aiohttp
            voice = _SPEECHMATICS_VOICES.get(self._language, "sarah")
            url = _SPEECHMATICS_TTS_URL.format(voice=voice)
            headers = {"Authorization": f"Bearer {self._speechmatics_api_key}"}
            payload = {"text": text}

            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload, headers=headers, timeout=aiohttp.ClientTimeout(total=6)) as resp:
                    if resp.status != 200:
                        logger.warning("Speechmatics TTS HTTP %d", resp.status)
                        return None
                    audio_bytes = await resp.read()

            audio_base64 = base64.b64encode(audio_bytes).decode("utf-8")
            tts_ms = int((time.perf_counter() - t0) * 1000)
            logger.info("Speechmatics TTS: %dms, %d chars", tts_ms, len(text))
            return {
                "mode": "audio",
                "audio_base64": audio_base64,
                "content_type": "audio/wav",
                "text": text,
            }
        except Exception as exc:
            logger.warning("Speechmatics TTS failed: %s", exc)
            return None

    async def _edge_synthesize(self, text: str) -> dict | None:
        """Microsoft Edge TTS — free, neural, all languages."""
        t0 = time.perf_counter()
        try:
            import edge_tts

            async def _stream():
                voice = _EDGE_VOICE_MAP.get(self._language, "en-US-JennyNeural")
                rate = "+8%" if self._language in ("zh", "ja", "ko") else "+15%"
                communicate = edge_tts.Communicate(text, voice, rate=rate)
                chunks: list[bytes] = []
                async for chunk in communicate.stream():
                    if chunk["type"] == "audio":
                        chunks.append(chunk["data"])
                return b"".join(chunks)

            audio_bytes = await asyncio.wait_for(_stream(), timeout=5)
            if not audio_bytes:
                return None
            audio_base64 = base64.b64encode(audio_bytes).decode("utf-8")
            tts_ms = int((time.perf_counter() - t0) * 1000)
            logger.info("Edge TTS: %dms, %d chars", tts_ms, len(text))
            return {
                "mode": "audio",
                "audio_base64": audio_base64,
                "content_type": "audio/mpeg",
                "text": text,
            }
        except asyncio.TimeoutError:
            logger.warning("Edge TTS timed out (5s)")
            return None
        except Exception as exc:
            logger.warning("Edge TTS failed: %s", exc)
            return None

    async def _openai_synthesize(self, text: str) -> dict | None:
        """OpenAI TTS (nova) — best quality but rate-limited on free tier."""
        t0 = time.perf_counter()
        try:
            response = await asyncio.wait_for(
                self._openai_client.audio.speech.create(
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
            logger.info("OpenAI TTS: %dms, %d chars", tts_ms, len(text))
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
