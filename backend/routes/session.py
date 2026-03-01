"""
Session management routes with Supabase persistence and multi-profile support.
"""

import logging
from fastapi import APIRouter

from backend.models import SessionState, ConversationTurn

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/session", tags=["session"])

# In-memory session state + current profile tracking
_session_state = SessionState()
_current_profile_id: str | None = None


def get_session_state() -> SessionState:
    return _session_state


def reset_session_state() -> None:
    global _session_state
    _session_state = SessionState()


def get_current_profile_id() -> str | None:
    return _current_profile_id


# ── Profile endpoints ──────────────────────────────────────────────────

@router.get("/profiles")
async def list_profiles() -> list[dict]:
    """List all available profiles."""
    try:
        from backend.services.supabase_service import list_profiles
        return list_profiles()
    except Exception as e:
        logger.warning("Supabase unavailable, returning empty profiles: %s", e)
        return []


@router.post("/profiles")
async def create_profile(body: dict) -> dict:
    """Create a new profile with a given name."""
    name = body.get("name", "").strip()
    if not name:
        return {"error": "Name is required"}
    try:
        from backend.services.supabase_service import create_profile
        return create_profile(name)
    except Exception as e:
        logger.error("Failed to create profile: %s", e)
        return {"error": str(e)}


@router.post("/switch-profile")
async def switch_profile(body: dict) -> dict:
    """Switch to a different profile, loading its session from Supabase."""
    global _session_state, _current_profile_id

    profile_id = body.get("profile_id", "")
    if not profile_id:
        return {"error": "profile_id is required"}

    # Save current session first (if we have one)
    if _current_profile_id:
        await _save_current_session()

    # Load session from Supabase
    _current_profile_id = profile_id
    try:
        from backend.services.supabase_service import load_session
        data = load_session(profile_id)
        if data and data.get("conversation_history"):
            _session_state = SessionState(
                conversation_history=[ConversationTurn(**t) for t in data["conversation_history"]],
                mastery_scores=data.get("mastery_scores", {}),
                level=data.get("level", "A1"),
                turn=data.get("turn", 1),
            )
            logger.info("Loaded session for profile %s: %d turns", profile_id, len(_session_state.conversation_history))
        else:
            _session_state = SessionState()
            logger.info("New session for profile %s", profile_id)
    except Exception as e:
        logger.warning("Failed to load session from Supabase: %s", e)
        _session_state = SessionState()

    # Reset OpenAI conversation context to match loaded history
    from backend.routes.conversation import _openai_service
    _openai_service.reset()
    # Replay history into OpenAI context
    for turn in _session_state.conversation_history:
        _openai_service.inject_turn(turn.user_said, turn.response.spoken_response)

    return {"status": "ok", "profile_id": profile_id, "turns": len(_session_state.conversation_history)}


async def _save_current_session() -> None:
    """Save current session to Supabase."""
    if not _current_profile_id:
        return
    try:
        from backend.services.supabase_service import save_session
        state = _session_state
        save_session(
            _current_profile_id,
            [t.model_dump() for t in state.conversation_history],
            state.mastery_scores,
            state.level,
            state.turn,
        )
    except Exception as e:
        logger.warning("Failed to save session to Supabase: %s", e)


async def save_after_turn() -> None:
    """Called after each conversation turn to persist to Supabase."""
    await _save_current_session()


# ── Existing endpoints ─────────────────────────────────────────────────

@router.get("/state")
async def session_state() -> dict:
    state = get_session_state()
    return state.model_dump()


@router.get("/diagnostics")
async def session_diagnostics() -> dict:
    state = get_session_state()
    return {"items": state.diagnostics[-20:]}


@router.post("/reset")
async def session_reset() -> dict:
    reset_session_state()
    from backend.routes.conversation import _openai_service
    _openai_service.reset()
    # Save empty session
    await _save_current_session()
    return {"status": "reset", "turn": 1}


@router.post("/reset-hard")
async def session_reset_hard() -> dict:
    reset_session_state()
    from backend.routes.conversation import _openai_service, _backboard_service
    _openai_service.reset()
    await _backboard_service.reset()
    await _save_current_session()
    return {"status": "reset-hard", "turn": 1}
