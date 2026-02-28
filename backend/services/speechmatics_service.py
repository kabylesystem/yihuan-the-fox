"""
Speechmatics STT (Speech-to-Text) Service.

Mock mode: Returns pre-scripted transcriptions from MOCK_CONVERSATION[turn].user_said.
Real mode: Connects to Speechmatics WebSocket API for real-time French STT.
"""

import os
import asyncio
from backend.config import MOCK_MODE


class SpeechmaticsService:
    """Speech-to-text service wrapping Speechmatics real-time API."""

    def __init__(self):
        self.mock_mode = MOCK_MODE
        if not self.mock_mode:
            self._init_real_client()

    def _init_real_client(self):
        """Initialize Speechmatics WebSocket client for real-time STT."""
        from speechmatics.models import (
            ConnectionSettings,
            TranscriptionConfig,
        )
        from speechmatics.client import WebsocketClient

        api_key = os.getenv("SPEECHMATICS_API_KEY", "")
        self._connection_settings = ConnectionSettings(
            url="wss://eu2.rt.speechmatics.com/v2",
            auth_token=api_key,
        )
        self._transcription_config = TranscriptionConfig(
            language="fr",
            enable_partials=True,
            max_delay=5,
            operating_point="enhanced",
        )
        self._client = WebsocketClient(self._connection_settings)

    async def transcribe(self, audio_data: bytes, turn_number: int) -> str:
        """Transcribe audio data to text.

        Args:
            audio_data: Raw audio bytes to transcribe.
            turn_number: Current conversation turn (0-indexed) for mock mode.

        Returns:
            Transcribed text string.
        """
        if self.mock_mode:
            return self._mock_transcribe(turn_number)
        return await self._real_transcribe(audio_data)

    def _mock_transcribe(self, turn_number: int) -> str:
        """Return pre-scripted transcription for the given turn.

        Args:
            turn_number: 0-indexed turn number.

        Returns:
            The user_said text from MOCK_CONVERSATION for this turn.
        """
        from backend.mock_data import MOCK_CONVERSATION

        if turn_number < 0 or turn_number >= len(MOCK_CONVERSATION):
            return ""
        return MOCK_CONVERSATION[turn_number]["user_said"]

    async def _real_transcribe(self, audio_data: bytes) -> str:
        """Transcribe audio using Speechmatics real-time WebSocket API.

        Sends audio data to Speechmatics and collects the final transcript.
        Uses ServerMessageType enum for event handler registration.

        Args:
            audio_data: Raw audio bytes to transcribe.

        Returns:
            Final transcribed text string.
        """
        from speechmatics.models import ServerMessageType

        transcript_parts = []

        def on_final_transcript(msg):
            transcript = msg.get("metadata", {}).get("transcript", "")
            if not transcript:
                transcript = msg.get("transcript", "")
            if transcript:
                transcript_parts.append(transcript)

        self._client.add_event_handler(
            event_name=ServerMessageType.AddTranscript,
            event_handler=on_final_transcript,
        )

        # Run the synchronous WebSocket client in a thread executor
        # to avoid blocking the async event loop
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            lambda: self._client.run_synchronously(
                audio_data,
                self._transcription_config,
            ),
        )

        return " ".join(transcript_parts).strip()
