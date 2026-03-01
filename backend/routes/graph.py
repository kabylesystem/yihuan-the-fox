"""
Knowledge Graph routes for Neural-Sync Language Lab.

Provides REST endpoints for retrieving the Knowledge Graph nodes and
links. In mock mode, uses pre-built graph data filtered by turn.
In real mode, dynamically generates graph nodes from the USER's spoken
vocabulary only (not the AI tutor's words).
"""

import logging

from fastapi import APIRouter

from backend.config import MOCK_MODE
from backend.mock_data import MOCK_GRAPH_LINKS, MOCK_GRAPH_NODES
from backend.models import GraphLink, GraphNode
from backend.routes.session import get_session_state

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/graph", tags=["graph"])


def _to_id(word: str) -> str:
    """Normalize a word/phrase into a stable node id."""
    return word.strip().lower().replace(" ", "_").replace("'", "").replace("\u2019", "")


def _norm_text(value: str) -> str:
    return " ".join((value or "").strip().lower().replace("\u2019", "'").split())


def _is_component_of_phrase(token: str, phrase: str) -> bool:
    token_n = _norm_text(token)
    phrase_n = _norm_text(phrase)
    if not token_n or not phrase_n or token_n == phrase_n:
        return False
    if " " not in phrase_n:
        return False
    return token_n in phrase_n.split(" ")


def _pedagogical_items(items: list[str]) -> list[str]:
    """Keep pedagogically coherent units.

    Rules:
    - Keep phrase chunks (e.g. "ca va", "je m'appelle") as first-class items.
    - Drop 1-char noise.
    - If a phrase exists, drop split single-word components from the same set
      (avoid "ca va" + "ca" + "va" duplicates).
    """
    low_signal_tokens = {
        "ca", "ça", "va", "je", "tu", "il", "elle", "nous", "vous",
        "de", "du", "des", "un", "une", "et", "a", "est",
    }
    cleaned: list[str] = []
    seen_norm: set[str] = set()
    for raw in items:
        text = (raw or "").strip()
        if len(text) <= 1:
            continue
        n = _norm_text(text)
        if n in low_signal_tokens:
            continue
        tok_count = len(n.split(" "))
        if tok_count >= 6 and not n.startswith(("je suis +", "j'aime +", "j'ai envie de +")):
            continue
        if not n or n in seen_norm:
            continue
        seen_norm.add(n)
        cleaned.append(text)

    phrases = [x for x in cleaned if " " in _norm_text(x)]
    if not phrases:
        return cleaned

    result: list[str] = []
    for item in cleaned:
        if any(_is_component_of_phrase(item, ph) for ph in phrases):
            continue
        result.append(item)
    return result


@router.get("/nodes")
async def graph_nodes() -> list[dict]:
    """Return Knowledge Graph nodes — only words the USER spoke."""
    state = get_session_state()

    if MOCK_MODE:
        if not state.conversation_history:
            return []
        current_turn = state.turn
        return [
            GraphNode(**node).model_dump()
            for node in MOCK_GRAPH_NODES
            if node["turn_introduced"] <= current_turn
        ]

    nodes: list[dict] = []
    seen_ids: set[str] = set()

    def _add_node(word: str, node_type: str, mastery: float, turn: int):
        node_id = _to_id(word)
        if not node_id or node_id in seen_ids:
            return
        seen_ids.add(node_id)
        nodes.append(
            GraphNode(
                id=node_id,
                label=word,
                type=node_type,
                mastery=min(1.0, max(0.0, mastery)),
                level=state.level,
                turn_introduced=turn,
            ).model_dump()
        )

    # Nodes from validated_user_units accepted by strict gate only
    unit_stats: dict[str, dict] = {}
    for t in state.conversation_history:
        t_data = t.model_dump()
        resp = t_data["response"]
        tn = t_data["turn_number"]
        units = resp.get("validated_user_units") or []
        accepted_units = [u for u in units if u.get("is_accepted")]
        accepted = [u.get("text", "") for u in accepted_units]
        for word in _pedagogical_items(accepted):
            if word:
                matched = [u for u in accepted_units if _norm_text(u.get("text", "")) == _norm_text(word)]
                unit_kind = next((u.get("kind") for u in matched), "word")
                canonical = next((u.get("canonical_key", "") for u in matched), "")
                node_type = "sentence" if unit_kind == "chunk" or " " in word else ("grammar" if unit_kind == "pattern" else "vocab")

                stat = unit_stats.get(word, {"count": 0, "sum_conf": 0.0, "first_turn": tn, "last_turn": tn, "canonical": canonical})
                stat["count"] += 1
                stat["sum_conf"] += float(next((u.get("confidence", 0.75) for u in matched), 0.75))
                stat["last_turn"] = tn
                stat["canonical"] = canonical or stat["canonical"]
                unit_stats[word] = stat

                avg_conf = stat["sum_conf"] / max(1, stat["count"])
                reuse_score = min(1.0, (stat["count"] - 1) / 4)
                recency_decay = max(0.0, 1.0 - ((state.turn - stat["last_turn"]) * 0.08))
                learned_mastery = 0.22 + (avg_conf * 0.38) + (reuse_score * 0.30) + (recency_decay * 0.10)
                if unit_kind == "pattern":
                    learned_mastery += 0.05
                history_mastery = state.mastery_scores.get(word, learned_mastery)
                mastery = min(1.0, max(0.15, (learned_mastery * 0.65) + (history_mastery * 0.35)))
                _add_node(word, node_type, mastery, tn)

    return nodes


@router.get("/links")
async def graph_links() -> list[dict]:
    """Return Knowledge Graph links — clean, meaningful connections only."""
    state = get_session_state()

    if MOCK_MODE:
        if not state.conversation_history:
            return []
        current_turn = state.turn
        return [
            GraphLink(**link).model_dump()
            for link in MOCK_GRAPH_LINKS
            if link["turn_introduced"] <= current_turn
        ]

    # Build node IDs from accepted validated units only (matching graph_nodes)
    node_ids: set[str] = set()
    for t in state.conversation_history:
        t_data = t.model_dump()
        resp = t_data["response"]
        units = resp.get("validated_user_units") or []
        accepted = [u.get("text", "") for u in units if u.get("is_accepted")]
        for word in _pedagogical_items(accepted):
            if word:
                node_ids.add(_to_id(word))

    links: list[dict] = []
    seen: set[tuple[str, str]] = set()

    def _add_link(src: str, tgt: str, rel: str, turn: int, reason_detail: str, evidence_units: list[str]):
        """Add a link if both endpoints exist and it's not a duplicate."""
        src_id = _to_id(src)
        tgt_id = _to_id(tgt)
        if not src_id or not tgt_id or src_id == tgt_id:
            return
        if src_id not in node_ids or tgt_id not in node_ids:
            return
        key = (min(src_id, tgt_id), max(src_id, tgt_id))
        if key in seen:
            return
        seen.add(key)
        links.append(
            GraphLink(
                source=src_id,
                target=tgt_id,
                relationship=rel,
                reason=rel,
                reason_detail=reason_detail,
                evidence_units=evidence_units[:2],
                turn_introduced=turn,
            ).model_dump()
        )

    # Strategy 1: AI-provided explicit graph links (highest quality)
    for t in state.conversation_history:
        t_data = t.model_dump()
        resp = t_data["response"]
        tn = t_data["turn_number"]
        for gl in resp.get("graph_links") or []:
            rel_map = {"semantic": "semantic", "conjugation": "conjugation",
                       "prerequisite": "prerequisite", "correction": "reactivation"}
            _add_link(gl.get("source", ""), gl.get("target", ""),
                      rel_map.get(gl.get("type", ""), "semantic"), tn,
                      "Explicit pedagogical relationship provided by tutor.",
                      [gl.get("source", ""), gl.get("target", "")])

    # Strategy 2: Canonical pattern relations (shared canonical key)
    for t in state.conversation_history:
        t_data = t.model_dump()
        resp = t_data["response"]
        tn = t_data["turn_number"]
        units = resp.get("validated_user_units") or []
        accepted_units = [u for u in units if u.get("is_accepted")]
        by_key: dict[str, list[str]] = {}
        for u in accepted_units:
            key = u.get("canonical_key", "")
            text = u.get("text", "")
            if not key or not text:
                continue
            by_key.setdefault(key, []).append(text)
        for key, texts in by_key.items():
            if len(texts) < 2:
                continue
            texts = list(dict.fromkeys(texts))
            for i in range(len(texts) - 1):
                _add_link(
                    texts[i],
                    texts[i + 1],
                    "conjugation" if key.startswith("pattern:") else "semantic",
                    tn,
                    f"Units share canonical key '{key}'.",
                    [texts[i], texts[i + 1]],
                )

    # Strategy 3: Mission/reactivation links (agent output drives meaningful reuse)
    for t in state.conversation_history:
        t_data = t.model_dump()
        resp = t_data["response"]
        tn = t_data["turn_number"]
        units = resp.get("validated_user_units") or []
        accepted_units = [u for u in units if u.get("is_accepted")]
        accepted = _pedagogical_items([u.get("text", "") for u in accepted_units])
        if not accepted:
            continue

        mission_units = [
            u.get("text", "")
            for u in accepted_units
            if float(u.get("mission_relevance", 0.0) or 0.0) >= 0.55
        ]
        mission_units = _pedagogical_items(mission_units) or accepted[:1]

        reactivated = _pedagogical_items(resp.get("reactivated_elements") or [])
        if not reactivated:
            continue

        for old_unit in reactivated[:2]:
            for new_unit in mission_units[:2]:
                if _norm_text(old_unit) == _norm_text(new_unit):
                    continue
                _add_link(
                    old_unit,
                    new_unit,
                    "mission",
                    tn,
                    "Tutor reused fading knowledge inside a new mission objective.",
                    [old_unit, new_unit],
                )

    # Readability guardrail: cap node degree so graph does not collapse into a spiral
    priority = {"mission": 5, "reactivation": 4, "prerequisite": 3, "conjugation": 2, "semantic": 1}
    sorted_links = sorted(
        links,
        key=lambda l: (priority.get(l.get("relationship", "semantic"), 0), l.get("turn_introduced", 0)),
        reverse=True,
    )
    degree: dict[str, int] = {}
    capped_links: list[dict] = []
    for link in sorted_links:
        src = link["source"]
        tgt = link["target"]
        if degree.get(src, 0) >= 4 or degree.get(tgt, 0) >= 4:
            continue
        degree[src] = degree.get(src, 0) + 1
        degree[tgt] = degree.get(tgt, 0) + 1
        capped_links.append(link)

    logger.info("Graph links generated: %d links for %d nodes", len(capped_links), len(node_ids))
    return capped_links
