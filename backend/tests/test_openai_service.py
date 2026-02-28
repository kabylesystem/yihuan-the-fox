"""
Tests for backend.services.openai_service module.

Verifies:
- Mock mode returns full TutorResponse for each turn
- All response fields are present and correctly typed
- Out-of-bounds turns return empty defaults
- Service initializes in mock mode by default
"""

import pytest
from backend.services.openai_service import OpenAIService
from backend.mock_data import MOCK_CONVERSATION


RESPONSE_FIELDS = [
    "spoken_response",
    "translation_hint",
    "vocabulary_breakdown",
    "new_elements",
    "reactivated_elements",
    "user_level_assessment",
    "border_update",
    "mastery_scores",
]


class TestOpenAIServiceInit:
    """Tests for OpenAIService initialization."""

    def test_initializes_in_mock_mode(self):
        """Verify service initializes with mock_mode=True when MOCK_MODE=true."""
        svc = OpenAIService()
        assert svc.mock_mode is True

    def test_does_not_have_real_client_in_mock_mode(self):
        """Verify real client attributes are not set in mock mode."""
        svc = OpenAIService()
        assert not hasattr(svc, "_client")
        assert not hasattr(svc, "_model")
        assert not hasattr(svc, "_system_prompt")


class TestOpenAIServiceMockGenerate:
    """Tests for mock mode response generation."""

    @pytest.fixture
    def service(self):
        """Create a fresh OpenAIService for each test."""
        return OpenAIService()

    @pytest.mark.asyncio
    async def test_generate_response_turn_0(self, service):
        """Verify turn 0 returns first tutor response."""
        result = await service.generate_response("Bonjour", 0)
        expected = MOCK_CONVERSATION[0]["response"]
        assert result == expected

    @pytest.mark.asyncio
    async def test_generate_response_turn_1(self, service):
        """Verify turn 1 returns second tutor response."""
        result = await service.generate_response("Je m'appelle Marie", 1)
        expected = MOCK_CONVERSATION[1]["response"]
        assert result == expected

    @pytest.mark.asyncio
    async def test_generate_response_turn_4(self, service):
        """Verify turn 4 (last) returns fifth tutor response."""
        result = await service.generate_response("J'aime visiter...", 4)
        expected = MOCK_CONVERSATION[4]["response"]
        assert result == expected

    @pytest.mark.asyncio
    async def test_generate_response_all_five_turns(self, service):
        """Verify all 5 turns return matching mock responses."""
        for i in range(5):
            result = await service.generate_response("test", i)
            assert result == MOCK_CONVERSATION[i]["response"]

    @pytest.mark.asyncio
    async def test_response_is_dict(self, service):
        """Verify generate_response returns a dictionary."""
        for i in range(5):
            result = await service.generate_response("test", i)
            assert isinstance(result, dict)

    @pytest.mark.asyncio
    async def test_response_has_all_fields(self, service):
        """Verify every response contains all TutorResponse fields."""
        for i in range(5):
            result = await service.generate_response("test", i)
            for field in RESPONSE_FIELDS:
                assert field in result, (
                    f"Turn {i}: missing field '{field}'"
                )

    @pytest.mark.asyncio
    async def test_spoken_response_is_nonempty_string(self, service):
        """Verify spoken_response is a non-empty string for each turn."""
        for i in range(5):
            result = await service.generate_response("test", i)
            assert isinstance(result["spoken_response"], str)
            assert len(result["spoken_response"]) > 0

    @pytest.mark.asyncio
    async def test_translation_hint_is_nonempty_string(self, service):
        """Verify translation_hint is a non-empty string for each turn."""
        for i in range(5):
            result = await service.generate_response("test", i)
            assert isinstance(result["translation_hint"], str)
            assert len(result["translation_hint"]) > 0

    @pytest.mark.asyncio
    async def test_vocabulary_breakdown_is_list(self, service):
        """Verify vocabulary_breakdown is a non-empty list with correct items."""
        for i in range(5):
            result = await service.generate_response("test", i)
            breakdown = result["vocabulary_breakdown"]
            assert isinstance(breakdown, list)
            assert len(breakdown) > 0
            for item in breakdown:
                assert "word" in item
                assert "translation" in item
                assert "part_of_speech" in item

    @pytest.mark.asyncio
    async def test_new_elements_is_nonempty_list(self, service):
        """Verify new_elements is a non-empty list of strings."""
        for i in range(5):
            result = await service.generate_response("test", i)
            elems = result["new_elements"]
            assert isinstance(elems, list)
            assert len(elems) > 0
            for elem in elems:
                assert isinstance(elem, str)

    @pytest.mark.asyncio
    async def test_reactivated_elements_is_list(self, service):
        """Verify reactivated_elements is a list of strings."""
        for i in range(5):
            result = await service.generate_response("test", i)
            elems = result["reactivated_elements"]
            assert isinstance(elems, list)
            for elem in elems:
                assert isinstance(elem, str)

    @pytest.mark.asyncio
    async def test_user_level_assessment_is_valid_cefr(self, service):
        """Verify user_level_assessment is a valid CEFR level."""
        valid_levels = {"A1", "A1+", "A2", "A2+", "B1", "B1+", "B2"}
        for i in range(5):
            result = await service.generate_response("test", i)
            assert result["user_level_assessment"] in valid_levels

    @pytest.mark.asyncio
    async def test_mastery_scores_is_dict_with_valid_values(self, service):
        """Verify mastery_scores is a dict with float values in [0.0, 1.0]."""
        for i in range(5):
            result = await service.generate_response("test", i)
            scores = result["mastery_scores"]
            assert isinstance(scores, dict)
            assert len(scores) > 0
            for key, value in scores.items():
                assert isinstance(key, str)
                assert isinstance(value, (int, float))
                assert 0.0 <= value <= 1.0

    @pytest.mark.asyncio
    async def test_user_text_ignored_in_mock(self, service):
        """Verify user text content doesn't affect mock output."""
        result_a = await service.generate_response("anything", 0)
        result_b = await service.generate_response("something else", 0)
        assert result_a == result_b


class TestOpenAIServiceEdgeCases:
    """Tests for edge cases and boundary conditions."""

    @pytest.fixture
    def service(self):
        """Create a fresh OpenAIService for each test."""
        return OpenAIService()

    @pytest.mark.asyncio
    async def test_negative_turn_returns_defaults(self, service):
        """Verify negative turn number returns empty default response."""
        result = await service.generate_response("test", -1)
        assert result["spoken_response"] == ""
        assert result["translation_hint"] == ""
        assert result["vocabulary_breakdown"] == []
        assert result["new_elements"] == []
        assert result["reactivated_elements"] == []
        assert result["user_level_assessment"] == "A1"
        assert result["border_update"] == ""
        assert result["mastery_scores"] == {}

    @pytest.mark.asyncio
    async def test_turn_beyond_range_returns_defaults(self, service):
        """Verify turn >= 5 returns empty default response."""
        result = await service.generate_response("test", 5)
        assert result["spoken_response"] == ""
        assert result["mastery_scores"] == {}

    @pytest.mark.asyncio
    async def test_large_turn_returns_defaults(self, service):
        """Verify very large turn number returns empty default response."""
        result = await service.generate_response("test", 100)
        assert isinstance(result, dict)
        assert result["spoken_response"] == ""

    @pytest.mark.asyncio
    async def test_default_response_has_all_fields(self, service):
        """Verify out-of-bounds response still has all required fields."""
        result = await service.generate_response("test", -1)
        for field in RESPONSE_FIELDS:
            assert field in result, f"Default response missing field '{field}'"
