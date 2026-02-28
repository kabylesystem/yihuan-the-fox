"""
Tests for backend.services.speechmatics_service module.

Verifies:
- Mock mode returns pre-scripted transcriptions for each turn
- Transcriptions match MOCK_CONVERSATION[turn].user_said
- Out-of-bounds turns return empty string
- Service initializes in mock mode by default
"""

import asyncio
import pytest
from backend.services.speechmatics_service import SpeechmaticsService
from backend.mock_data import MOCK_CONVERSATION


class TestSpeechmaticsServiceInit:
    """Tests for SpeechmaticsService initialization."""

    def test_initializes_in_mock_mode(self):
        """Verify service initializes with mock_mode=True when MOCK_MODE=true."""
        svc = SpeechmaticsService()
        assert svc.mock_mode is True

    def test_does_not_have_real_client_in_mock_mode(self):
        """Verify real client attributes are not set in mock mode."""
        svc = SpeechmaticsService()
        assert not hasattr(svc, "_client")
        assert not hasattr(svc, "_connection_settings")
        assert not hasattr(svc, "_transcription_config")


class TestSpeechmaticsServiceMockTranscribe:
    """Tests for mock mode transcription."""

    @pytest.fixture
    def service(self):
        """Create a fresh SpeechmaticsService for each test."""
        return SpeechmaticsService()

    @pytest.mark.asyncio
    async def test_transcribe_turn_0(self, service):
        """Verify turn 0 returns first user utterance."""
        result = await service.transcribe(b"fake_audio", 0)
        assert result == MOCK_CONVERSATION[0]["user_said"]
        assert result == "Bonjour"

    @pytest.mark.asyncio
    async def test_transcribe_turn_1(self, service):
        """Verify turn 1 returns second user utterance."""
        result = await service.transcribe(b"fake_audio", 1)
        assert result == MOCK_CONVERSATION[1]["user_said"]
        assert result == "Je m'appelle Marie"

    @pytest.mark.asyncio
    async def test_transcribe_turn_2(self, service):
        """Verify turn 2 returns third user utterance."""
        result = await service.transcribe(b"fake_audio", 2)
        assert result == MOCK_CONVERSATION[2]["user_said"]
        assert result == "J'habite à Paris"

    @pytest.mark.asyncio
    async def test_transcribe_turn_3(self, service):
        """Verify turn 3 returns fourth user utterance."""
        result = await service.transcribe(b"fake_audio", 3)
        assert result == MOCK_CONVERSATION[3]["user_said"]
        assert result == "Oui, j'aime beaucoup Paris"

    @pytest.mark.asyncio
    async def test_transcribe_turn_4(self, service):
        """Verify turn 4 returns fifth user utterance."""
        result = await service.transcribe(b"fake_audio", 4)
        assert result == MOCK_CONVERSATION[4]["user_said"]
        assert result == "J'aime visiter les musées et manger des croissants"

    @pytest.mark.asyncio
    async def test_transcribe_all_five_turns(self, service):
        """Verify all 5 turns return correct transcriptions in order."""
        for i in range(5):
            result = await service.transcribe(b"fake_audio", i)
            assert result == MOCK_CONVERSATION[i]["user_said"]

    @pytest.mark.asyncio
    async def test_transcribe_returns_string(self, service):
        """Verify transcribe always returns a string."""
        for i in range(5):
            result = await service.transcribe(b"fake_audio", i)
            assert isinstance(result, str)

    @pytest.mark.asyncio
    async def test_transcribe_returns_nonempty_for_valid_turns(self, service):
        """Verify valid turns return non-empty strings."""
        for i in range(5):
            result = await service.transcribe(b"fake_audio", i)
            assert len(result) > 0


class TestSpeechmaticsServiceEdgeCases:
    """Tests for edge cases and boundary conditions."""

    @pytest.fixture
    def service(self):
        """Create a fresh SpeechmaticsService for each test."""
        return SpeechmaticsService()

    @pytest.mark.asyncio
    async def test_transcribe_negative_turn(self, service):
        """Verify negative turn number returns empty string."""
        result = await service.transcribe(b"fake_audio", -1)
        assert result == ""

    @pytest.mark.asyncio
    async def test_transcribe_turn_beyond_range(self, service):
        """Verify turn number >= 5 returns empty string."""
        result = await service.transcribe(b"fake_audio", 5)
        assert result == ""

    @pytest.mark.asyncio
    async def test_transcribe_large_turn_number(self, service):
        """Verify very large turn number returns empty string."""
        result = await service.transcribe(b"fake_audio", 100)
        assert result == ""

    @pytest.mark.asyncio
    async def test_audio_data_ignored_in_mock(self, service):
        """Verify audio data content doesn't affect mock output."""
        result_empty = await service.transcribe(b"", 0)
        result_data = await service.transcribe(b"some_audio_data", 0)
        assert result_empty == result_data
