"""
Tests for backend.services.backboard_service module.

Verifies:
- Mock mode stores and retrieves mastery scores correctly
- Mock mode updates and retrieves learner profile correctly
- Mastery scores are clamped to [0.0, 1.0]
- Reset clears all state
- Service initializes in mock mode by default
"""

import pytest
from backend.services.backboard_service import BackboardService


class TestBackboardServiceInit:
    """Tests for BackboardService initialization."""

    def test_initializes_in_mock_mode(self):
        """Verify service initializes with mock_mode=True when MOCK_MODE=true."""
        svc = BackboardService()
        assert svc.mock_mode is True

    def test_does_not_have_real_client_in_mock_mode(self):
        """Verify real client attributes are not set in mock mode."""
        svc = BackboardService()
        assert not hasattr(svc, "_client")

    def test_initial_mastery_scores_empty(self):
        """Verify mastery scores start as empty dict."""
        svc = BackboardService()
        assert svc._mastery_scores == {}

    def test_initial_learner_profile_defaults(self):
        """Verify learner profile starts with correct defaults."""
        svc = BackboardService()
        profile = svc._learner_profile
        assert profile["level"] == "A1"
        assert profile["total_turns"] == 0
        assert profile["border_update"] == ""


class TestBackboardServiceMockMastery:
    """Tests for mock mode mastery score operations."""

    @pytest.fixture
    def service(self):
        """Create a fresh BackboardService for each test."""
        return BackboardService()

    @pytest.mark.asyncio
    async def test_update_single_score(self, service):
        """Verify single mastery score is stored correctly."""
        await service.update_mastery({"bonjour": 0.8})
        scores = await service.get_mastery()
        assert scores == {"bonjour": 0.8}

    @pytest.mark.asyncio
    async def test_update_multiple_scores(self, service):
        """Verify multiple mastery scores stored in single call."""
        await service.update_mastery({"bonjour": 0.8, "merci": 0.5})
        scores = await service.get_mastery()
        assert scores == {"bonjour": 0.8, "merci": 0.5}

    @pytest.mark.asyncio
    async def test_merge_scores_across_calls(self, service):
        """Verify mastery scores merge across multiple update calls."""
        await service.update_mastery({"bonjour": 0.8})
        await service.update_mastery({"merci": 0.5})
        scores = await service.get_mastery()
        assert scores == {"bonjour": 0.8, "merci": 0.5}

    @pytest.mark.asyncio
    async def test_overwrite_existing_score(self, service):
        """Verify updating an existing score overwrites the old value."""
        await service.update_mastery({"bonjour": 0.5})
        await service.update_mastery({"bonjour": 0.9})
        scores = await service.get_mastery()
        assert scores["bonjour"] == 0.9

    @pytest.mark.asyncio
    async def test_clamp_score_above_one(self, service):
        """Verify scores above 1.0 are clamped to 1.0."""
        await service.update_mastery({"test": 1.5})
        scores = await service.get_mastery()
        assert scores["test"] == 1.0

    @pytest.mark.asyncio
    async def test_clamp_score_below_zero(self, service):
        """Verify scores below 0.0 are clamped to 0.0."""
        await service.update_mastery({"test": -0.5})
        scores = await service.get_mastery()
        assert scores["test"] == 0.0

    @pytest.mark.asyncio
    async def test_exact_boundary_scores(self, service):
        """Verify boundary values 0.0 and 1.0 are stored exactly."""
        await service.update_mastery({"low": 0.0, "high": 1.0})
        scores = await service.get_mastery()
        assert scores["low"] == 0.0
        assert scores["high"] == 1.0

    @pytest.mark.asyncio
    async def test_get_mastery_returns_copy(self, service):
        """Verify get_mastery returns a copy, not the internal dict."""
        await service.update_mastery({"bonjour": 0.8})
        scores = await service.get_mastery()
        scores["bonjour"] = 0.0  # Modify the copy
        original = await service.get_mastery()
        assert original["bonjour"] == 0.8  # Original unchanged

    @pytest.mark.asyncio
    async def test_empty_mastery_returns_empty_dict(self, service):
        """Verify get_mastery returns empty dict when no scores set."""
        scores = await service.get_mastery()
        assert scores == {}
        assert isinstance(scores, dict)


class TestBackboardServiceMockProfile:
    """Tests for mock mode learner profile operations."""

    @pytest.fixture
    def service(self):
        """Create a fresh BackboardService for each test."""
        return BackboardService()

    @pytest.mark.asyncio
    async def test_update_profile(self, service):
        """Verify learner profile is updated correctly."""
        await service.update_profile("A1+", 3, "Can say where you live.")
        profile = await service.get_profile()
        assert profile["level"] == "A1+"
        assert profile["total_turns"] == 3
        assert profile["border_update"] == "Can say where you live."

    @pytest.mark.asyncio
    async def test_update_profile_multiple_times(self, service):
        """Verify profile updates overwrite previous values."""
        await service.update_profile("A1", 1, "Can greet.")
        await service.update_profile("A1+", 3, "Can describe location.")
        await service.update_profile("A2", 5, "Can discuss activities.")
        profile = await service.get_profile()
        assert profile["level"] == "A2"
        assert profile["total_turns"] == 5
        assert profile["border_update"] == "Can discuss activities."

    @pytest.mark.asyncio
    async def test_get_profile_returns_copy(self, service):
        """Verify get_profile returns a copy, not the internal dict."""
        await service.update_profile("A1+", 3, "Test")
        profile = await service.get_profile()
        profile["level"] = "C2"  # Modify the copy
        original = await service.get_profile()
        assert original["level"] == "A1+"  # Original unchanged

    @pytest.mark.asyncio
    async def test_default_profile(self, service):
        """Verify default profile has expected values."""
        profile = await service.get_profile()
        assert profile["level"] == "A1"
        assert profile["total_turns"] == 0
        assert profile["border_update"] == ""


class TestBackboardServiceReset:
    """Tests for reset functionality."""

    @pytest.fixture
    def service(self):
        """Create a fresh BackboardService for each test."""
        return BackboardService()

    @pytest.mark.asyncio
    async def test_reset_clears_mastery(self, service):
        """Verify reset clears all mastery scores."""
        await service.update_mastery({"bonjour": 0.9, "merci": 0.7})
        await service.reset()
        scores = await service.get_mastery()
        assert scores == {}

    @pytest.mark.asyncio
    async def test_reset_clears_profile(self, service):
        """Verify reset restores default learner profile."""
        await service.update_profile("A2", 5, "Advanced speaker.")
        await service.reset()
        profile = await service.get_profile()
        assert profile["level"] == "A1"
        assert profile["total_turns"] == 0
        assert profile["border_update"] == ""

    @pytest.mark.asyncio
    async def test_reset_allows_fresh_start(self, service):
        """Verify data can be added again after reset."""
        await service.update_mastery({"old": 0.5})
        await service.reset()
        await service.update_mastery({"new": 0.8})
        scores = await service.get_mastery()
        assert "old" not in scores
        assert scores == {"new": 0.8}

    @pytest.mark.asyncio
    async def test_double_reset(self, service):
        """Verify resetting twice doesn't cause errors."""
        await service.reset()
        await service.reset()
        scores = await service.get_mastery()
        profile = await service.get_profile()
        assert scores == {}
        assert profile["level"] == "A1"
