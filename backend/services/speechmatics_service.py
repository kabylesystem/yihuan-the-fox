"""
Speechmatics STT (Speech-to-Text) Service — with Groq Whisper fallback.

Priority:
1. Speechmatics real-time WebSocket ("enhanced" quality, all languages)
2. Groq Whisper Large v3 fallback (fast, excellent multilingual, ~300ms)

PCM conversion runs in thread pool (non-blocking).
"""

import io
import logging
import os
import asyncio
import time
from backend.config import MOCK_MODE

logger = logging.getLogger(__name__)


def _convert_webm_to_pcm(webm_data: bytes) -> bytes:
    """Convert webm/opus audio from browser MediaRecorder to PCM s16le 16kHz mono."""
    import av

    container = av.open(io.BytesIO(webm_data))
    audio_stream = next(s for s in container.streams if s.type == "audio")
    resampler = av.AudioResampler(format="s16", layout="mono", rate=16000)

    pcm_chunks: list[bytes] = []
    for frame in container.decode(audio_stream):
        for resampled_frame in resampler.resample(frame):
            pcm_chunks.append(bytes(resampled_frame.planes[0]))

    container.close()
    return b"".join(pcm_chunks)


class SpeechmaticsService:
    """Speech-to-text service — Speechmatics real-time API, optimized for speed."""

    # Map frontend language codes to Speechmatics language codes
    _LANG_MAP = {
        "zh": "cmn",  # Mandarin Chinese
        "ar": "ar",   # Arabic
        "hi": "hi",   # Hindi
        "ja": "ja",   # Japanese
        "ko": "ko",   # Korean
    }

    def __init__(self):
        self.mock_mode = MOCK_MODE
        self._current_language = "fr"
        if not self.mock_mode:
            self._init_real_client()

    def _init_real_client(self, language: str = "fr"):
        """Initialize Speechmatics connection settings for real-time STT."""
        from speechmatics.models import ConnectionSettings, TranscriptionConfig

        api_key = os.getenv("SPEECHMATICS_API_KEY", "")
        self._connection_settings = ConnectionSettings(
            url="wss://eu2.rt.speechmatics.com/v2",
            auth_token=api_key,
        )
        stt_lang = self._LANG_MAP.get(language, language)
        self._transcription_config = TranscriptionConfig(
            language=stt_lang,
            enable_partials=False,
            max_delay=0.7,
            operating_point="enhanced",
        )
        self._current_language = language

    def set_language(self, language: str):
        """Switch STT language (rebuilds transcription config)."""
        if language != self._current_language and not self.mock_mode:
            logger.info("STT language changed: %s → %s", self._current_language, language)
            self._init_real_client(language)

    async def transcribe(self, audio_data: bytes, turn_number: int) -> str:
        """Transcribe audio using Speechmatics enhanced only."""
        if self.mock_mode:
            return self._mock_transcribe(turn_number)
        return await self._real_transcribe(audio_data)

    def _mock_transcribe(self, turn_number: int) -> str:
        """Return pre-scripted transcription for the given turn."""
        from backend.mock_data import MOCK_CONVERSATION

        if turn_number < 0 or turn_number >= len(MOCK_CONVERSATION):
            return ""
        return MOCK_CONVERSATION[turn_number]["user_said"]

    async def _real_transcribe(self, audio_data: bytes) -> str:
        """Transcribe audio using Speechmatics real-time WebSocket API."""
        from speechmatics.models import ServerMessageType, AudioSettings
        from speechmatics.client import WebsocketClient

        t0 = time.perf_counter()

        # Convert webm/opus to PCM s16le 16kHz mono
        loop = asyncio.get_event_loop()
        try:
            pcm_data = await loop.run_in_executor(
                None, _convert_webm_to_pcm, audio_data
            )
            conv_ms = int((time.perf_counter() - t0) * 1000)
            logger.info("PCM conversion: %dms (%d→%d bytes)", conv_ms, len(audio_data), len(pcm_data))
        except Exception as exc:
            logger.error("Audio conversion failed: %s", exc)
            return ""

        if len(pcm_data) < 1600:
            logger.warning("Audio too short (%d bytes PCM), skipping", len(pcm_data))
            return ""

        transcript_parts: list[str] = []

        def on_final_transcript(msg):
            transcript = msg.get("metadata", {}).get("transcript", "")
            if not transcript:
                transcript = msg.get("transcript", "")
            if transcript:
                transcript_parts.append(transcript)

        client = WebsocketClient(self._connection_settings)
        client.add_event_handler(
            event_name=ServerMessageType.AddTranscript,
            event_handler=on_final_transcript,
        )

        audio_stream = io.BytesIO(pcm_data)
        audio_settings = AudioSettings(
            encoding="pcm_s16le",
            sample_rate=16000,
        )

        stt_start = time.perf_counter()
        # Retry once on failure (first call after language switch can timeout on WS handshake)
        for attempt in range(2):
            try:
                if attempt > 0:
                    # Re-create client and stream for retry
                    client = WebsocketClient(self._connection_settings)
                    client.add_event_handler(
                        event_name=ServerMessageType.AddTranscript,
                        event_handler=on_final_transcript,
                    )
                    audio_stream = io.BytesIO(pcm_data)
                    logger.info("STT retry attempt %d", attempt + 1)
                await asyncio.wait_for(
                    loop.run_in_executor(
                        None,
                        lambda: client.run_synchronously(
                            audio_stream,
                            self._transcription_config,
                            audio_settings,
                        ),
                    ),
                    timeout=15,
                )
                break  # Success
            except asyncio.TimeoutError:
                logger.error("Speechmatics timed out (attempt %d)", attempt + 1)
                if attempt == 1:
                    return ""
            except Exception as exc:
                logger.error("Speechmatics failed (attempt %d): %s", attempt + 1, exc)
                if attempt == 1:
                    return ""

        stt_ms = int((time.perf_counter() - stt_start) * 1000)
        total_ms = int((time.perf_counter() - t0) * 1000)
        result = " ".join(transcript_parts).strip()
        logger.info("STT [%s]: %dms (conv=%dms, stt=%dms) → '%s'", self._current_language, total_ms, conv_ms, stt_ms, result)
        return result

    async def _groq_whisper_transcribe(self, audio_data: bytes) -> str:
        """Groq Whisper Large v3 fallback — fast, excellent multilingual quality."""
        t0 = time.perf_counter()
        try:
            import tempfile
            from groq import AsyncGroq

            api_key = os.getenv("GROQ_API_KEY", "")
            if not api_key:
                logger.warning("No GROQ_API_KEY — Whisper fallback unavailable")
                return ""

            client = AsyncGroq(api_key=api_key)

            # Map language code for Whisper (use full language name for better accuracy)
            _WHISPER_LANG_MAP = {
                "fr": "fr", "es": "es", "de": "de", "it": "it", "pt": "pt",
                "ja": "ja", "ko": "ko", "zh": "zh", "ar": "ar", "ru": "ru",
                "nl": "nl", "tr": "tr", "hi": "hi", "sv": "sv", "pl": "pl",
                "cmn": "zh",
            }
            lang = _WHISPER_LANG_MAP.get(self._current_language, self._current_language)

            # Write audio to a temp file (Groq SDK expects file-like with a name)
            with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as f:
                f.write(audio_data)
                tmp_path = f.name

            with open(tmp_path, "rb") as audio_file:
                transcription = await asyncio.wait_for(
                    client.audio.transcriptions.create(
                        file=("audio.webm", audio_file, "audio/webm"),
                        model="whisper-large-v3-turbo",
                        language=lang,
                        response_format="text",
                    ),
                    timeout=10,
                )

            import os as _os
            _os.unlink(tmp_path)

            result = (transcription or "").strip()
            elapsed = int((time.perf_counter() - t0) * 1000)
            logger.info("Groq Whisper [%s]: %dms → '%s'", lang, elapsed, result)
            return result

        except asyncio.TimeoutError:
            logger.warning("Groq Whisper timed out (10s)")
            return ""
        except Exception as exc:
            logger.warning("Groq Whisper failed: %s", exc)
            return ""
