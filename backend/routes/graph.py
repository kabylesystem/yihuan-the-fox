"""
Knowledge Graph routes for Neural-Sync Language Lab.

Provides REST endpoints for retrieving the Knowledge Graph nodes and
links that have been introduced up to the current conversation turn.
The graph grows progressively as the learner advances through turns.
"""

from fastapi import APIRouter

from backend.mock_data import MOCK_GRAPH_LINKS, MOCK_GRAPH_NODES
from backend.models import GraphLink, GraphNode
from backend.routes.session import get_session_state

router = APIRouter(prefix="/api/graph", tags=["graph"])


@router.get("/nodes")
async def graph_nodes() -> list[dict]:
    """Return Knowledge Graph nodes introduced up to the current turn.

    Each node represents a vocabulary item, sentence structure, or
    grammar concept. Nodes are progressively revealed as the learner
    completes conversation turns, filtered by ``turn_introduced``.
    """
    current_turn = get_session_state().turn
    return [
        GraphNode(**node).model_dump()
        for node in MOCK_GRAPH_NODES
        if node["turn_introduced"] <= current_turn
    ]


@router.get("/links")
async def graph_links() -> list[dict]:
    """Return Knowledge Graph links introduced up to the current turn.

    Each link represents a relationship (prerequisite, semantic,
    reactivation, or conjugation) between two graph nodes. Links are
    filtered to only include those whose ``turn_introduced`` is at or
    below the current session turn.
    """
    current_turn = get_session_state().turn
    return [
        GraphLink(**link).model_dump()
        for link in MOCK_GRAPH_LINKS
        if link["turn_introduced"] <= current_turn
    ]
