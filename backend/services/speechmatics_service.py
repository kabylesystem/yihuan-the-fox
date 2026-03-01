"""
Speechmatics STT (Speech-to-Text) Service.

Mock mode: Returns pre-scripted transcriptions from MOCK_CONVERSATION[turn].user_said.
Real mode: Connects to Speechmatics WebSocket API for real-time French STT.
           Converts browser webm/opus audio to PCM via PyAV before sending.
"""

import io
import logging
import os
import asyncio
from backend.config import MOCK_MODE

logger = logging.getLogger(__name__)


def _convert_webm_to_pcm(webm_data: bytes) -> bytes:
    """Convert webm/opus audio from browser MediaRecorder to PCM s16le 16kHz mono.

    Uses PyAV (bundled FFmpeg) so no system ffmpeg is needed.
    """
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
    """Speech-to-text service wrapping Speechmatics real-time API."""

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
            max_delay=2,
            operating_point="standard",
        )

    async def transcribe(self, audio_data: bytes, turn_number: int) -> str:
        """Transcribe audio data to text.

        Args:
            audio_data: Raw audio bytes (webm/opus from browser or PCM).
            turn_number: Current conversation turn (0-indexed) for mock mode.

        Returns:
            Transcribed text string.
        """
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
        """Transcribe audio using Speechmatics real-time WebSocket API.

        Converts webm/opus from browser to PCM, then sends to Speechmatics.
        Has a 15-second timeout to prevent hanging.
        """
        from speechmatics.models import ServerMessageType, AudioSettings
        from speechmatics.client import WebsocketClient

        # Convert webm/opus to PCM s16le 16kHz mono
        loop = asyncio.get_event_loop()
        try:
            pcm_data = await loop.run_in_executor(
                None, _convert_webm_to_pcm, audio_data
            )
            logger.info("Audio converted: %d bytes webm → %d bytes PCM", len(audio_data), len(pcm_data))
        except Exception as exc:
            logger.error("Audio conversion failed: %s", exc)
            return ""

        if len(pcm_data) < 1600:  # Less than 0.05s of audio
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
            logger.error("Speechmatics transcription timed out (15s)")
            return ""
        except Exception as exc:
            logger.error("Speechmatics transcription failed: %s", exc)
            return ""

        result = " ".join(transcript_parts).strip()
        logger.info("Transcription result: '%s'", result)
        return result
