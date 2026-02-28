"""
Knowledge Graph routes for Neural-Sync Language Lab.

Provides REST endpoints for retrieving the Knowledge Graph nodes and
links. In mock mode, uses pre-built graph data filtered by turn.
In real mode, dynamically generates graph nodes from conversation
mastery scores and vocabulary.
"""

from fastapi import APIRouter

from backend.config import MOCK_MODE
from backend.mock_data import MOCK_GRAPH_LINKS, MOCK_GRAPH_NODES
from backend.models import GraphLink, GraphNode
from backend.routes.session import get_session_state

router = APIRouter(prefix="/api/graph", tags=["graph"])


@router.get("/nodes")
async def graph_nodes() -> list[dict]:
    """Return Knowledge Graph nodes.

    Mock mode: returns pre-built nodes filtered by turn_introduced.
    Real mode: generates nodes from mastery_scores in session state.
    """
    state = get_session_state()

    if MOCK_MODE:
        current_turn = state.turn
        return [
            GraphNode(**node).model_dump()
            for node in MOCK_GRAPH_NODES
            if node["turn_introduced"] <= current_turn
        ]

    # Real mode: build nodes from mastery scores + vocabulary breakdown
    nodes = []
    seen_ids = set()

    # Nodes from mastery scores
    for word, score in state.mastery_scores.items():
        node_id = word.replace(" ", "_").replace("'", "")
        if node_id in seen_ids:
            continue
        seen_ids.add(node_id)

        node_type = "sentence" if " " in word else "vocab"
        turn_intro = 1
        for t in state.conversation_history:
            if word in (t.response.new_elements or []):
                turn_intro = t.turn_number
                break

        nodes.append(
            GraphNode(
                id=node_id,
                label=word,
                type=node_type,
                mastery=score,
                level=state.level,
                turn_introduced=turn_intro,
            ).model_dump()
        )

    # Also add nodes from vocabulary breakdowns (these have translations)
    for t in state.conversation_history:
        for v in t.response.vocabulary_breakdown or []:
            word = v.word
            node_id = word.replace(" ", "_").replace("'", "")
            if node_id in seen_ids:
                continue
            seen_ids.add(node_id)
            nodes.append(
                GraphNode(
                    id=node_id,
                    label=word,
                    type="vocab",
                    mastery=state.mastery_scores.get(word, 0.3),
                    level=state.level,
                    turn_introduced=t.turn_number,
                ).model_dump()
            )

    return nodes


@router.get("/links")
async def graph_links() -> list[dict]:
    """Return Knowledge Graph links.

    Mock mode: returns pre-built links filtered by turn_introduced.
    Real mode: generates links from conversation history relationships.
    """
    state = get_session_state()

    if MOCK_MODE:
        current_turn = state.turn
        return [
            GraphLink(**link).model_dump()
            for link in MOCK_GRAPH_LINKS
            if link["turn_introduced"] <= current_turn
        ]

    # Real mode: build links from conversation turns
    # Only create links where both endpoints exist as nodes (in mastery_scores)
    node_ids = {
        word.replace(" ", "_").replace("'", "")
        for word in state.mastery_scores
    }
    links = []
    seen = set()
    for turn in state.conversation_history:
        resp = turn.response
        new_els = resp.new_elements or []
        react_els = resp.reactivated_elements or []

        # Link new elements to each other (semantic)
        for i, src in enumerate(new_els):
            for tgt in new_els[i + 1 :]:
                src_id = src.replace(" ", "_").replace("'", "")
                tgt_id = tgt.replace(" ", "_").replace("'", "")
                if src_id not in node_ids or tgt_id not in node_ids:
                    continue
                key = (src_id, tgt_id)
                if key not in seen:
                    seen.add(key)
                    links.append(
                        GraphLink(
                            source=src_id,
                            target=tgt_id,
                            relationship="semantic",
                            turn_introduced=turn.turn_number,
                        ).model_dump()
                    )

        # Link reactivated elements to new elements (reactivation)
        for react in react_els:
            for new_el in new_els[:1]:  # Link to first new element
                src_id = react.replace(" ", "_").replace("'", "")
                tgt_id = new_el.replace(" ", "_").replace("'", "")
                if src_id not in node_ids or tgt_id not in node_ids:
                    continue
                key = (src_id, tgt_id)
                if key not in seen:
                    seen.add(key)
                    links.append(
                        GraphLink(
                            source=src_id,
                            target=tgt_id,
                            relationship="reactivation",
                            turn_introduced=turn.turn_number,
                        ).model_dump()
                    )

    return links
