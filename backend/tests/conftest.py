"""
Shared test fixtures for Neural-Sync Language Lab backend tests.

Provides mock services, test client, and common test data
used across all test modules.
"""

import os
import pytest
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def mock_mode_env(monkeypatch):
    """Ensure MOCK_MODE=true for all tests."""
    monkeypatch.setenv("MOCK_MODE", "true")
    monkeypatch.setenv("SPEECHMATICS_API_KEY", "")
    monkeypatch.setenv("BACKBOARD_API_KEY", "")
    monkeypatch.setenv("OPENAI_API_KEY", "")
    monkeypatch.setenv("OPENAI_ORG_ID", "")


@pytest.fixture
def test_client():
    """Create a FastAPI TestClient for route testing."""
    from backend.main import app
    return TestClient(app)


@pytest.fixture
def mock_conversation():
    """Return the full mock conversation data."""
    from backend.mock_data import MOCK_CONVERSATION
    return MOCK_CONVERSATION


@pytest.fixture
def mock_graph_nodes():
    """Return the mock graph nodes."""
    from backend.mock_data import MOCK_GRAPH_NODES
    return MOCK_GRAPH_NODES


@pytest.fixture
def mock_graph_links():
    """Return the mock graph links."""
    from backend.mock_data import MOCK_GRAPH_LINKS
    return MOCK_GRAPH_LINKS


@pytest.fixture
def sample_tutor_response():
    """Return a minimal valid TutorResponse dict for model testing."""
    return {
        "spoken_response": "Bonjour !",
        "translation_hint": "Hello!",
        "vocabulary_breakdown": [
            {"word": "bonjour", "translation": "hello", "part_of_speech": "noun"}
        ],
        "new_elements": ["bonjour"],
        "reactivated_elements": [],
        "user_level_assessment": "A1",
        "border_update": "You can greet someone.",
        "mastery_scores": {"bonjour": 0.8},
    }


@pytest.fixture
def sample_conversation_turn(sample_tutor_response):
    """Return a minimal valid ConversationTurn dict for model testing."""
    return {
        "turn_number": 1,
        "user_said": "Bonjour",
        "response": sample_tutor_response,
    }
