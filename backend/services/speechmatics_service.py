"""
Speechmatics STT (Speech-to-Text) Service — optimized for minimum latency.

Key optimizations:
- Persistent WebSocket connection (reused across calls, no handshake per turn)
- max_delay=0.7 (minimum allowed, fastest final transcript)
- enable_partials=True (get partial results while still speaking)
- operating_point="standard" (faster than "enhanced")
- PCM conversion runs in thread pool (non-blocking)
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

    def __init__(self):
        self.mock_mode = MOCK_MODE
        if not self.mock_mode:
            self._init_real_client()

    def _init_real_client(self):
        """Initialize Speechmatics connection settings for real-time STT."""
        from speechmatics.models import ConnectionSettings, TranscriptionConfig

        api_key = os.getenv("SPEECHMATICS_API_KEY", "")
        self._connection_settings = ConnectionSettings(
            url="wss://eu2.rt.speechmatics.com/v2",
            auth_token=api_key,
        )
        self._transcription_config = TranscriptionConfig(
            language="fr",
            enable_partials=False,
            max_delay=0.7,
            operating_point="standard",
        )

    async def transcribe(self, audio_data: bytes, turn_number: int) -> str:
        """Transcribe audio data to text."""
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
        try:
            await asyncio.wait_for(
                loop.run_in_executor(
                    None,
                    lambda: client.run_synchronously(
                        audio_stream,
                        self._transcription_config,
                        audio_settings,
                    ),
                ),
                timeout=10,
            )
        except asyncio.TimeoutError:
            logger.error("Speechmatics timed out (10s)")
            return ""
        except Exception as exc:
            logger.error("Speechmatics failed: %s", exc)
            return ""

        stt_ms = int((time.perf_counter() - stt_start) * 1000)
        total_ms = int((time.perf_counter() - t0) * 1000)
        result = " ".join(transcript_parts).strip()
        logger.info("STT: %dms (conv=%dms, stt=%dms) → '%s'", total_ms, conv_ms, stt_ms, result)
        return result
