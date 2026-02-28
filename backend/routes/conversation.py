"""
Conversation WebSocket endpoint for Neural-Sync Language Lab.

Handles real-time voice conversation flow over WebSocket at /ws/conversation.
Orchestrates the STT -> OpenAI -> Backboard -> TTS pipeline for each turn
and returns a TutorResponse JSON payload per turn.

Frontend sends:
    {"type": "text", "content": "Bonjour"}       — text input (mock/text mode)
    {"type": "audio", "content": "<base64>"}      — audio input (real STT mode)

Backend responds:
    {"type": "turn_response", "turn": {...}}       — full conversation turn
    {"type": "demo_complete", "message": "..."}    — all mock turns exhausted
    {"type": "error", "message": "..."}            — error during processing
"""

import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from backend.config import MOCK_MODE
from backend.mock_data import MOCK_CONVERSATION
from backend.models import ConversationTurn, TutorResponse
from backend.routes.session import get_session_state
from backend.services.backboard_service import BackboardService
from backend.services.openai_service import OpenAIService
from backend.services.speechmatics_service import SpeechmaticsService
from backend.services.tts_service import TTSService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["conversation"])

# Shared service instances — single-user demo, instantiated once.
_stt_service = SpeechmaticsService()
_openai_service = OpenAIService()
_backboard_service = BackboardService()
_tts_service = TTSService()


@router.websocket("/ws/conversation")
async def conversation_ws(websocket: WebSocket) -> None:
    """WebSocket endpoint for real-time conversation with the AI tutor.

    Each message from the client triggers one conversation turn through
    the full pipeline: STT (if audio) -> OpenAI -> Backboard -> TTS.
    The session state is updated after each turn and the full
    ConversationTurn is sent back to the client as JSON.
    """
    await websocket.accept()

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json(
                    {"type": "error", "message": "Invalid JSON"}
                )
                continue

            msg_type = message.get("type", "")
            content = message.get("content", "")

            if msg_type not in ("text", "audio"):
                await websocket.send_json(
                    {"type": "error", "message": f"Unknown message type: {msg_type}"}
                )
                continue

            # Check if demo is already complete
            state = get_session_state()
            if state.demo_complete:
                await websocket.send_json({
                    "type": "demo_complete",
                    "message": "Demo complete! Reset to try again.",
                })
                continue

            try:
                turn_result = await _process_turn(
                    msg_type=msg_type,
                    content=content,
                    state=state,
                )
                await websocket.send_json(turn_result)
            except Exception as exc:
                logger.exception("Error processing conversation turn")
                await websocket.send_json(
                    {"type": "error", "message": str(exc)}
                )

    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")


async def _process_turn(
    msg_type: str,
    content: str,
    state: "SessionState",
) -> dict:
    """Process a single conversation turn through the full pipeline.

    Steps:
        1. STT — transcribe audio to text (or use text directly)
        2. OpenAI — generate i+1 tutor response
        3. Backboard — update mastery scores and learner profile
        4. TTS — synthesize tutor's spoken response to audio / browser signal
        5. Session — update session state with the completed turn

    Args:
        msg_type: "text" or "audio" indicating the input type.
        content: User text or base64-encoded audio bytes.
        state: Current session state (mutated in place).

    Returns:
        Dictionary with type="turn_response" and the full turn payload,
        or type="demo_complete" when all mock turns are exhausted.
    """
    # 0-indexed turn for service calls (state.turn is 1-indexed)
    turn_index = state.turn - 1
    total_mock_turns = len(MOCK_CONVERSATION)

    # ── Step 1: STT ──────────────────────────────────────────────────
    if msg_type == "audio":
        import base64

        audio_bytes = base64.b64decode(content)
        user_text = await _stt_service.transcribe(audio_bytes, turn_index)
    else:
        # In mock mode the frontend sends text directly; STT is bypassed.
        # Still run through the service so mock data drives the response.
        if _stt_service.mock_mode:
            user_text = _stt_service._mock_transcribe(turn_index)
        else:
            user_text = content

    if not user_text:
        return {"type": "error", "message": "Empty input — try again."}

    # ── Step 2: OpenAI (i+1 response generation) ─────────────────────
    response_data = await _openai_service.generate_response(
        user_text, turn_index
    )
    tutor_response = TutorResponse(**response_data)

    # ── Step 3: Backboard (mastery & profile tracking) ───────────────
    await _backboard_service.update_mastery(tutor_response.mastery_scores)
    await _backboard_service.update_profile(
        level=tutor_response.user_level_assessment,
        turn=state.turn,
        border_update=tutor_response.border_update,
    )

    # ── Step 4: TTS (synthesize tutor spoken response) ───────────────
    tts_result = await _tts_service.synthesize(tutor_response.spoken_response)

    # ── Step 5: Update session state ─────────────────────────────────
    turn = ConversationTurn(
        turn_number=state.turn,
        user_said=user_text,
        response=tutor_response,
    )
    state.conversation_history.append(turn)
    state.level = tutor_response.user_level_assessment
    state.mastery_scores.update(tutor_response.mastery_scores)
    state.turn += 1

    # Check if all mock turns have been exhausted (only in mock mode)
    if MOCK_MODE and state.turn > total_mock_turns:
        state.demo_complete = True

    # ── Build response payload ───────────────────────────────────────
    payload: dict = {
        "type": "turn_response",
        "turn": turn.model_dump(),
        "tts": tts_result,
        "session": {
            "turn": state.turn,
            "level": state.level,
            "demo_complete": state.demo_complete,
        },
    }

    return payload
