"""
Tests for backend.models Pydantic models.

Verifies:
- All models validate correctly with valid data
- All models reject invalid data with appropriate errors
- Mock data structures validate against their corresponding models
"""

import pytest
from pydantic import ValidationError

from backend.models import (
    VocabularyItem,
    TutorResponse,
    ConversationTurn,
    GraphNode,
    GraphLink,
    SessionState,
)
from backend.mock_data import MOCK_CONVERSATION, MOCK_GRAPH_NODES, MOCK_GRAPH_LINKS


# ---------------------------------------------------------------------------
# VocabularyItem tests
# ---------------------------------------------------------------------------

class TestVocabularyItem:
    """Tests for the VocabularyItem model."""

    def test_valid_vocabulary_item(self):
        """VocabularyItem should accept valid data."""
        item = VocabularyItem(
            word="bonjour",
            translation="hello",
            part_of_speech="noun",
        )
        assert item.word == "bonjour"
        assert item.translation == "hello"
        assert item.part_of_speech == "noun"

    def test_missing_word_raises(self):
        """VocabularyItem should reject missing word field."""
        with pytest.raises(ValidationError):
            VocabularyItem(translation="hello", part_of_speech="noun")

    def test_missing_translation_raises(self):
        """VocabularyItem should reject missing translation field."""
        with pytest.raises(ValidationError):
            VocabularyItem(word="bonjour", part_of_speech="noun")

    def test_missing_part_of_speech_raises(self):
        """VocabularyItem should reject missing part_of_speech field."""
        with pytest.raises(ValidationError):
            VocabularyItem(word="bonjour", translation="hello")


# ---------------------------------------------------------------------------
# TutorResponse tests
# ---------------------------------------------------------------------------

class TestTutorResponse:
    """Tests for the TutorResponse model."""

    def test_valid_tutor_response(self, sample_tutor_response):
        """TutorResponse should accept valid data."""
        resp = TutorResponse(**sample_tutor_response)
        assert resp.spoken_response == "Bonjour !"
        assert resp.user_level_assessment == "A1"
        assert resp.mastery_scores["bonjour"] == 0.8

    def test_missing_spoken_response_raises(self):
        """TutorResponse should reject missing spoken_response."""
        with pytest.raises(ValidationError):
            TutorResponse(
                translation_hint="Hello!",
                user_level_assessment="A1",
                border_update="You can greet.",
            )

    def test_missing_user_level_assessment_raises(self):
        """TutorResponse should reject missing user_level_assessment."""
        with pytest.raises(ValidationError):
            TutorResponse(
                spoken_response="Bonjour !",
                translation_hint="Hello!",
                border_update="You can greet.",
            )

    def test_missing_border_update_raises(self):
        """TutorResponse should reject missing border_update."""
        with pytest.raises(ValidationError):
            TutorResponse(
                spoken_response="Bonjour !",
                translation_hint="Hello!",
                user_level_assessment="A1",
            )

    def test_defaults_for_optional_lists(self):
        """TutorResponse should default list/dict fields to empty."""
        resp = TutorResponse(
            spoken_response="Bonjour !",
            translation_hint="Hello!",
            user_level_assessment="A1",
            border_update="You can greet.",
        )
        assert resp.vocabulary_breakdown == []
        assert resp.new_elements == []
        assert resp.reactivated_elements == []
        assert resp.mastery_scores == {}

    def test_vocabulary_breakdown_nested_validation(self):
        """TutorResponse should validate nested VocabularyItem objects."""
        resp = TutorResponse(
            spoken_response="Bonjour !",
            translation_hint="Hello!",
            vocabulary_breakdown=[
                {"word": "bonjour", "translation": "hello", "part_of_speech": "noun"}
            ],
            user_level_assessment="A1",
            border_update="You can greet.",
        )
        assert len(resp.vocabulary_breakdown) == 1
        assert resp.vocabulary_breakdown[0].word == "bonjour"

    def test_invalid_vocabulary_breakdown_raises(self):
        """TutorResponse should reject invalid nested vocabulary items."""
        with pytest.raises(ValidationError):
            TutorResponse(
                spoken_response="Bonjour !",
                translation_hint="Hello!",
                vocabulary_breakdown=[{"word": "bonjour"}],  # Missing fields
                user_level_assessment="A1",
                border_update="You can greet.",
            )


# ---------------------------------------------------------------------------
# ConversationTurn tests
# ---------------------------------------------------------------------------

class TestConversationTurn:
    """Tests for the ConversationTurn model."""

    def test_valid_conversation_turn(self, sample_conversation_turn):
        """ConversationTurn should accept valid data."""
        turn = ConversationTurn(**sample_conversation_turn)
        assert turn.turn_number == 1
        assert turn.user_said == "Bonjour"
        assert turn.response.spoken_response == "Bonjour !"

    def test_turn_number_minimum_one(self):
        """ConversationTurn should reject turn_number < 1."""
        with pytest.raises(ValidationError):
            ConversationTurn(
                turn_number=0,
                user_said="Bonjour",
                response={
                    "spoken_response": "Bonjour !",
                    "translation_hint": "Hello!",
                    "user_level_assessment": "A1",
                    "border_update": "Greet.",
                },
            )

    def test_negative_turn_number_raises(self):
        """ConversationTurn should reject negative turn_number."""
        with pytest.raises(ValidationError):
            ConversationTurn(
                turn_number=-1,
                user_said="Bonjour",
                response={
                    "spoken_response": "Bonjour !",
                    "translation_hint": "Hello!",
                    "user_level_assessment": "A1",
                    "border_update": "Greet.",
                },
            )

    def test_missing_user_said_raises(self):
        """ConversationTurn should reject missing user_said."""
        with pytest.raises(ValidationError):
            ConversationTurn(
                turn_number=1,
                response={
                    "spoken_response": "Bonjour !",
                    "translation_hint": "Hello!",
                    "user_level_assessment": "A1",
                    "border_update": "Greet.",
                },
            )


# ---------------------------------------------------------------------------
# GraphNode tests
# ---------------------------------------------------------------------------

class TestGraphNode:
    """Tests for the GraphNode model."""

    def test_valid_graph_node(self):
        """GraphNode should accept valid data."""
        node = GraphNode(
            id="bonjour",
            label="bonjour",
            type="vocab",
            mastery=0.8,
            level="A1",
            turn_introduced=1,
        )
        assert node.id == "bonjour"
        assert node.mastery == 0.8

    def test_mastery_below_zero_raises(self):
        """GraphNode should reject mastery < 0.0."""
        with pytest.raises(ValidationError):
            GraphNode(
                id="test",
                label="test",
                type="vocab",
                mastery=-0.1,
                level="A1",
                turn_introduced=1,
            )

    def test_mastery_above_one_raises(self):
        """GraphNode should reject mastery > 1.0."""
        with pytest.raises(ValidationError):
            GraphNode(
                id="test",
                label="test",
                type="vocab",
                mastery=1.1,
                level="A1",
                turn_introduced=1,
            )

    def test_mastery_boundary_zero(self):
        """GraphNode should accept mastery = 0.0."""
        node = GraphNode(
            id="test",
            label="test",
            type="vocab",
            mastery=0.0,
            level="A1",
            turn_introduced=1,
        )
        assert node.mastery == 0.0

    def test_mastery_boundary_one(self):
        """GraphNode should accept mastery = 1.0."""
        node = GraphNode(
            id="test",
            label="test",
            type="vocab",
            mastery=1.0,
            level="A1",
            turn_introduced=1,
        )
        assert node.mastery == 1.0

    def test_turn_introduced_below_one_raises(self):
        """GraphNode should reject turn_introduced < 1."""
        with pytest.raises(ValidationError):
            GraphNode(
                id="test",
                label="test",
                type="vocab",
                mastery=0.5,
                level="A1",
                turn_introduced=0,
            )

    def test_missing_id_raises(self):
        """GraphNode should reject missing id."""
        with pytest.raises(ValidationError):
            GraphNode(
                label="test",
                type="vocab",
                mastery=0.5,
                level="A1",
                turn_introduced=1,
            )


# ---------------------------------------------------------------------------
# GraphLink tests
# ---------------------------------------------------------------------------

class TestGraphLink:
    """Tests for the GraphLink model."""

    def test_valid_graph_link(self):
        """GraphLink should accept valid data."""
        link = GraphLink(
            source="bonjour",
            target="comment",
            relationship="semantic",
            turn_introduced=1,
        )
        assert link.source == "bonjour"
        assert link.target == "comment"
        assert link.relationship == "semantic"

    def test_turn_introduced_below_one_raises(self):
        """GraphLink should reject turn_introduced < 1."""
        with pytest.raises(ValidationError):
            GraphLink(
                source="a",
                target="b",
                relationship="semantic",
                turn_introduced=0,
            )

    def test_missing_source_raises(self):
        """GraphLink should reject missing source."""
        with pytest.raises(ValidationError):
            GraphLink(
                target="b",
                relationship="semantic",
                turn_introduced=1,
            )

    def test_missing_relationship_raises(self):
        """GraphLink should reject missing relationship."""
        with pytest.raises(ValidationError):
            GraphLink(
                source="a",
                target="b",
                turn_introduced=1,
            )


# ---------------------------------------------------------------------------
# SessionState tests
# ---------------------------------------------------------------------------

class TestSessionState:
    """Tests for the SessionState model."""

    def test_default_session_state(self):
        """SessionState should have sensible defaults."""
        state = SessionState()
        assert state.turn == 1
        assert state.level == "A1"
        assert state.mastery_scores == {}
        assert state.conversation_history == []
        assert state.demo_complete is False

    def test_custom_session_state(self):
        """SessionState should accept custom values."""
        state = SessionState(
            turn=3,
            level="A1+",
            mastery_scores={"bonjour": 0.9},
            demo_complete=False,
        )
        assert state.turn == 3
        assert state.level == "A1+"
        assert state.mastery_scores["bonjour"] == 0.9

    def test_turn_below_one_raises(self):
        """SessionState should reject turn < 1."""
        with pytest.raises(ValidationError):
            SessionState(turn=0)

    def test_session_state_with_conversation_history(self, sample_conversation_turn):
        """SessionState should accept nested ConversationTurn in history."""
        state = SessionState(
            turn=2,
            conversation_history=[sample_conversation_turn],
        )
        assert len(state.conversation_history) == 1
        assert state.conversation_history[0].turn_number == 1


# ---------------------------------------------------------------------------
# Mock data validation against models
# ---------------------------------------------------------------------------

class TestMockDataModelsIntegration:
    """Verify that all mock data validates against Pydantic models."""

    def test_all_mock_turns_validate_as_conversation_turns(self):
        """Every MOCK_CONVERSATION entry should validate as ConversationTurn."""
        for turn_data in MOCK_CONVERSATION:
            turn = ConversationTurn(**turn_data)
            assert turn.turn_number >= 1
            assert len(turn.user_said) > 0
            assert len(turn.response.spoken_response) > 0

    def test_all_mock_nodes_validate_as_graph_nodes(self):
        """Every MOCK_GRAPH_NODES entry should validate as GraphNode."""
        for node_data in MOCK_GRAPH_NODES:
            node = GraphNode(**node_data)
            assert 0.0 <= node.mastery <= 1.0

    def test_all_mock_links_validate_as_graph_links(self):
        """Every MOCK_GRAPH_LINKS entry should validate as GraphLink."""
        for link_data in MOCK_GRAPH_LINKS:
            link = GraphLink(**link_data)
            assert link.turn_introduced >= 1

    def test_mock_conversation_builds_valid_session_state(self):
        """Building a SessionState from MOCK_CONVERSATION should validate."""
        turns = [ConversationTurn(**t) for t in MOCK_CONVERSATION]
        last_response = turns[-1].response
        state = SessionState(
            turn=5,
            level=last_response.user_level_assessment,
            mastery_scores=last_response.mastery_scores,
            conversation_history=turns,
            demo_complete=True,
        )
        assert state.turn == 5
        assert state.level == "A2"
        assert len(state.conversation_history) == 5
        assert state.demo_complete is True
