"""
Tests for backend.mock_data module.

Verifies:
- All 5 turns are present in MOCK_CONVERSATION
- All response fields are populated for each turn
- Mastery scores are floats in range 0.0-1.0
- Graph nodes and links have correct counts and structure
"""

from backend.mock_data import MOCK_CONVERSATION, MOCK_GRAPH_NODES, MOCK_GRAPH_LINKS


# ---------------------------------------------------------------------------
# MOCK_CONVERSATION tests
# ---------------------------------------------------------------------------

class TestMockConversation:
    """Tests for the 5-turn mock conversation data."""

    def test_conversation_has_five_turns(self):
        """Verify exactly 5 turns exist."""
        assert len(MOCK_CONVERSATION) == 5

    def test_turn_numbers_sequential(self):
        """Verify turn numbers are 1-5 in sequence."""
        for i, turn in enumerate(MOCK_CONVERSATION):
            assert turn["turn_number"] == i + 1

    def test_all_turns_have_user_said(self):
        """Verify every turn has a non-empty user_said field."""
        for turn in MOCK_CONVERSATION:
            assert "user_said" in turn
            assert isinstance(turn["user_said"], str)
            assert len(turn["user_said"]) > 0

    def test_all_turns_have_response(self):
        """Verify every turn has a response dict."""
        for turn in MOCK_CONVERSATION:
            assert "response" in turn
            assert isinstance(turn["response"], dict)

    def test_response_has_spoken_response(self):
        """Verify every response has a non-empty spoken_response."""
        for turn in MOCK_CONVERSATION:
            resp = turn["response"]
            assert "spoken_response" in resp
            assert isinstance(resp["spoken_response"], str)
            assert len(resp["spoken_response"]) > 0

    def test_response_has_translation_hint(self):
        """Verify every response has a non-empty translation_hint."""
        for turn in MOCK_CONVERSATION:
            resp = turn["response"]
            assert "translation_hint" in resp
            assert isinstance(resp["translation_hint"], str)
            assert len(resp["translation_hint"]) > 0

    def test_response_has_vocabulary_breakdown(self):
        """Verify every response has a non-empty vocabulary_breakdown list."""
        for turn in MOCK_CONVERSATION:
            resp = turn["response"]
            assert "vocabulary_breakdown" in resp
            assert isinstance(resp["vocabulary_breakdown"], list)
            assert len(resp["vocabulary_breakdown"]) > 0
            for item in resp["vocabulary_breakdown"]:
                assert "word" in item
                assert "translation" in item
                assert "part_of_speech" in item

    def test_response_has_new_elements(self):
        """Verify every response has a non-empty new_elements list."""
        for turn in MOCK_CONVERSATION:
            resp = turn["response"]
            assert "new_elements" in resp
            assert isinstance(resp["new_elements"], list)
            assert len(resp["new_elements"]) > 0

    def test_response_has_reactivated_elements(self):
        """Verify every response has a reactivated_elements list."""
        for turn in MOCK_CONVERSATION:
            resp = turn["response"]
            assert "reactivated_elements" in resp
            assert isinstance(resp["reactivated_elements"], list)

    def test_response_has_user_level_assessment(self):
        """Verify every response has a valid CEFR level assessment."""
        valid_levels = {"A1", "A1+", "A2", "A2+", "B1", "B1+", "B2"}
        for turn in MOCK_CONVERSATION:
            resp = turn["response"]
            assert "user_level_assessment" in resp
            assert resp["user_level_assessment"] in valid_levels

    def test_response_has_border_update(self):
        """Verify every response has a non-empty border_update."""
        for turn in MOCK_CONVERSATION:
            resp = turn["response"]
            assert "border_update" in resp
            assert isinstance(resp["border_update"], str)
            assert len(resp["border_update"]) > 0

    def test_response_has_mastery_scores(self):
        """Verify every response has a non-empty mastery_scores dict."""
        for turn in MOCK_CONVERSATION:
            resp = turn["response"]
            assert "mastery_scores" in resp
            assert isinstance(resp["mastery_scores"], dict)
            assert len(resp["mastery_scores"]) > 0

    def test_mastery_scores_are_valid_floats(self):
        """Verify all mastery scores are floats in range [0.0, 1.0]."""
        for turn in MOCK_CONVERSATION:
            for key, score in turn["response"]["mastery_scores"].items():
                assert isinstance(score, (int, float)), (
                    f"Turn {turn['turn_number']}: mastery score for '{key}' "
                    f"is {type(score).__name__}, expected float"
                )
                assert 0.0 <= score <= 1.0, (
                    f"Turn {turn['turn_number']}: mastery score for '{key}' "
                    f"is {score}, expected 0.0-1.0"
                )

    def test_cefr_progression(self):
        """Verify CEFR level progresses A1 -> A1+ -> A2 across turns."""
        levels = [t["response"]["user_level_assessment"] for t in MOCK_CONVERSATION]
        assert levels[0] == "A1"
        assert levels[1] == "A1"
        assert levels[2] == "A1+"
        assert levels[3] == "A1+"
        assert levels[4] == "A2"

    def test_mastery_scores_grow_over_turns(self):
        """Verify mastery scores dictionary grows across turns."""
        sizes = [len(t["response"]["mastery_scores"]) for t in MOCK_CONVERSATION]
        for i in range(1, len(sizes)):
            assert sizes[i] >= sizes[i - 1], (
                f"Mastery scores should grow: turn {i} has {sizes[i-1]}, "
                f"turn {i+1} has {sizes[i]}"
            )


# ---------------------------------------------------------------------------
# MOCK_GRAPH_NODES tests
# ---------------------------------------------------------------------------

class TestMockGraphNodes:
    """Tests for the Knowledge Graph nodes."""

    def test_twelve_nodes_exist(self):
        """Verify exactly 12 graph nodes."""
        assert len(MOCK_GRAPH_NODES) == 12

    def test_all_nodes_have_required_fields(self):
        """Verify every node has all required fields."""
        required = {"id", "label", "type", "mastery", "level", "turn_introduced"}
        for node in MOCK_GRAPH_NODES:
            assert required.issubset(set(node.keys())), (
                f"Node '{node.get('id', '?')}' missing fields: "
                f"{required - set(node.keys())}"
            )

    def test_node_ids_are_unique(self):
        """Verify all node IDs are unique."""
        ids = [n["id"] for n in MOCK_GRAPH_NODES]
        assert len(ids) == len(set(ids))

    def test_node_mastery_in_range(self):
        """Verify all node mastery scores are in [0.0, 1.0]."""
        for node in MOCK_GRAPH_NODES:
            assert 0.0 <= node["mastery"] <= 1.0, (
                f"Node '{node['id']}' mastery {node['mastery']} out of range"
            )

    def test_node_types_valid(self):
        """Verify node types are one of vocab, sentence, or grammar."""
        valid_types = {"vocab", "sentence", "grammar"}
        for node in MOCK_GRAPH_NODES:
            assert node["type"] in valid_types, (
                f"Node '{node['id']}' has invalid type '{node['type']}'"
            )

    def test_turn_introduced_in_range(self):
        """Verify turn_introduced is 1-5 for all nodes."""
        for node in MOCK_GRAPH_NODES:
            assert 1 <= node["turn_introduced"] <= 5, (
                f"Node '{node['id']}' turn_introduced={node['turn_introduced']}"
            )


# ---------------------------------------------------------------------------
# MOCK_GRAPH_LINKS tests
# ---------------------------------------------------------------------------

class TestMockGraphLinks:
    """Tests for the Knowledge Graph links."""

    def test_eleven_links_exist(self):
        """Verify exactly 11 graph links."""
        assert len(MOCK_GRAPH_LINKS) == 11

    def test_all_links_have_required_fields(self):
        """Verify every link has all required fields."""
        required = {"source", "target", "relationship", "turn_introduced"}
        for link in MOCK_GRAPH_LINKS:
            assert required.issubset(set(link.keys())), (
                f"Link {link.get('source', '?')}->{link.get('target', '?')} "
                f"missing fields: {required - set(link.keys())}"
            )

    def test_link_sources_reference_valid_nodes(self):
        """Verify all link sources reference existing node IDs."""
        node_ids = {n["id"] for n in MOCK_GRAPH_NODES}
        for link in MOCK_GRAPH_LINKS:
            assert link["source"] in node_ids, (
                f"Link source '{link['source']}' not found in node IDs"
            )

    def test_link_targets_reference_valid_nodes(self):
        """Verify all link targets reference existing node IDs."""
        node_ids = {n["id"] for n in MOCK_GRAPH_NODES}
        for link in MOCK_GRAPH_LINKS:
            assert link["target"] in node_ids, (
                f"Link target '{link['target']}' not found in node IDs"
            )

    def test_link_relationships_valid(self):
        """Verify relationship types are one of the defined types."""
        valid_rels = {"prerequisite", "semantic", "reactivation", "conjugation"}
        for link in MOCK_GRAPH_LINKS:
            assert link["relationship"] in valid_rels, (
                f"Link {link['source']}->{link['target']} has invalid "
                f"relationship '{link['relationship']}'"
            )

    def test_link_turn_introduced_in_range(self):
        """Verify turn_introduced is 1-5 for all links."""
        for link in MOCK_GRAPH_LINKS:
            assert 1 <= link["turn_introduced"] <= 5, (
                f"Link {link['source']}->{link['target']} "
                f"turn_introduced={link['turn_introduced']}"
            )
