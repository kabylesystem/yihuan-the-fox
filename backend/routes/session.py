"""
Session management routes for Neural-Sync Language Lab.

Provides REST endpoints for querying and resetting the current
conversation session state (turn number, CEFR level, mastery scores,
and conversation history).
"""

from fastapi import APIRouter

from backend.models import SessionState

router = APIRouter(prefix="/api/session", tags=["session"])

# In-memory session state — single-user demo, no persistence needed.
# Services and the conversation WebSocket handler update this state;
# these endpoints expose it to the frontend for polling / display.
_session_state = SessionState()


def get_session_state() -> SessionState:
    """Return the shared session state instance.

    Other modules (e.g., the conversation WebSocket handler) import this
    function to read or mutate the session state directly.
    """
    return _session_state


def reset_session_state() -> None:
    """Reset the shared session state to defaults.

    Replaces the module-level reference so all readers see the new state.
    """
    global _session_state
    _session_state = SessionState()


@router.get("/state")
async def session_state() -> dict:
    """Return the current session state.

    Response includes turn number, CEFR level, accumulated mastery
    scores, full conversation history, and demo completion flag.
    """
    state = get_session_state()
    return state.model_dump()


@router.get("/diagnostics")
async def session_diagnostics() -> dict:
    """Return the last 20 turn diagnostics for latency/quality monitoring."""
    state = get_session_state()
    return {"items": state.diagnostics[-20:]}


@router.post("/reset")
async def session_reset() -> dict:
    """Reset session to initial state (turn 1, level A1, empty history).

    Also resets the OpenAI conversation history so the AI starts fresh.
    Returns confirmation with the reset turn number.
    """
    reset_session_state()

    # Reset OpenAI conversation history
    from backend.routes.conversation import _openai_service
    _openai_service.reset()

    return {"status": "reset", "turn": 1}


@router.post("/reset-hard")
async def session_reset_hard() -> dict:
    """Hard reset: clear session + model context + memory cache."""
    reset_session_state()

    from backend.routes.conversation import _openai_service, _backboard_service

    _openai_service.reset()
    await _backboard_service.reset()

    return {"status": "reset-hard", "turn": 1}
