"""
Tests for backend.services.tts_service module.

Verifies:
- Mock mode returns text for browser SpeechSynthesis
- Mock response has correct structure (mode='browser', text field)
- Various text inputs produce correct mock output
- Service initializes in mock mode by default
"""

import pytest
from backend.services.tts_service import TTSService


class TestTTSServiceInit:
    """Tests for TTSService initialization."""

    def test_initializes_in_mock_mode(self):
        """Verify service initializes with mock_mode=True when MOCK_MODE=true."""
        svc = TTSService()
        assert svc.mock_mode is True

    def test_does_not_have_real_client_in_mock_mode(self):
        """Verify real client attributes are not set in mock mode."""
        svc = TTSService()
        assert not hasattr(svc, "_client")
        assert not hasattr(svc, "_model")
        assert not hasattr(svc, "_voice")


class TestTTSServiceMockSynthesize:
    """Tests for mock mode speech synthesis."""

    @pytest.fixture
    def service(self):
        """Create a fresh TTSService for each test."""
        return TTSService()

    @pytest.mark.asyncio
    async def test_synthesize_returns_dict(self, service):
        """Verify synthesize returns a dictionary."""
        result = await service.synthesize("Bonjour")
        assert isinstance(result, dict)

    @pytest.mark.asyncio
    async def test_synthesize_mode_is_browser(self, service):
        """Verify mock mode returns mode='browser'."""
        result = await service.synthesize("Bonjour")
        assert result["mode"] == "browser"

    @pytest.mark.asyncio
    async def test_synthesize_has_text_field(self, service):
        """Verify mock response includes the text field."""
        result = await service.synthesize("Bonjour")
        assert "text" in result

    @pytest.mark.asyncio
    async def test_synthesize_text_matches_input(self, service):
        """Verify the text field matches the input text exactly."""
        result = await service.synthesize("Bonjour ! Comment tu t'appelles ?")
        assert result["text"] == "Bonjour ! Comment tu t'appelles ?"

    @pytest.mark.asyncio
    async def test_synthesize_various_french_texts(self, service):
        """Verify mock TTS works with various French text inputs."""
        texts = [
            "Bonjour !",
            "Enchanté, Marie ! Tu habites où ?",
            "Ah, Paris ! C'est une belle ville. Tu aimes Paris ?",
            "Moi aussi ! Qu'est-ce que tu aimes faire à Paris ?",
            "Excellent ! Tu parles déjà très bien.",
        ]
        for text in texts:
            result = await service.synthesize(text)
            assert result["mode"] == "browser"
            assert result["text"] == text

    @pytest.mark.asyncio
    async def test_synthesize_empty_text(self, service):
        """Verify mock TTS handles empty text input."""
        result = await service.synthesize("")
        assert result["mode"] == "browser"
        assert result["text"] == ""

    @pytest.mark.asyncio
    async def test_synthesize_no_audio_fields_in_mock(self, service):
        """Verify mock mode does NOT include audio_base64 or content_type."""
        result = await service.synthesize("Bonjour")
        assert "audio_base64" not in result
        assert "content_type" not in result

    @pytest.mark.asyncio
    async def test_synthesize_result_has_exactly_two_keys(self, service):
        """Verify mock response has exactly 'mode' and 'text' keys."""
        result = await service.synthesize("Bonjour")
        assert set(result.keys()) == {"mode", "text"}

    @pytest.mark.asyncio
    async def test_synthesize_with_unicode_and_accents(self, service):
        """Verify mock TTS handles French accented characters."""
        text = "Enchanté ! C'est très magnifique à côté"
        result = await service.synthesize(text)
        assert result["text"] == text

    @pytest.mark.asyncio
    async def test_synthesize_preserves_punctuation(self, service):
        """Verify mock TTS preserves all punctuation."""
        text = "Qu'est-ce que tu aimes faire ?"
        result = await service.synthesize(text)
        assert result["text"] == text

    @pytest.mark.asyncio
    async def test_synthesize_long_text(self, service):
        """Verify mock TTS handles longer text passages."""
        text = (
            "Excellent ! Tu parles déjà très bien. "
            "Les musées de Paris sont magnifiques ! "
            "Continue à pratiquer et tu vas progresser rapidement."
        )
        result = await service.synthesize(text)
        assert result["mode"] == "browser"
        assert result["text"] == text
