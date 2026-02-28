"""
Conversation WebSocket endpoint for Echo Neural Language Lab.

Handles real-time voice conversation flow over WebSocket at /ws/conversation.
Orchestrates the STT -> OpenAI -> Backboard -> TTS pipeline for each turn.
Sends progress status messages during processing so the frontend can show updates.

Frontend sends:
    {"type": "text", "content": "Bonjour"}       — text input
    {"type": "audio", "content": "<base64>"}      — audio input (webm/opus)

Backend responds:
    {"type": "status", "step": "..."}             — progress update
    {"type": "turn_response", "turn": {...}}       — full conversation turn
    {"type": "demo_complete", "message": "..."}    — all mock turns exhausted
    {"type": "error", "message": "..."}            — error during processing
"""

import asyncio
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
    """WebSocket endpoint for real-time conversation with the AI tutor."""
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

            state = get_session_state()
            if state.demo_complete:
                await websocket.send_json({
                    "type": "demo_complete",
                    "message": "Demo complete! Reset to try again.",
                })
                continue

            try:
                turn_result = await _process_turn(
                    websocket=websocket,
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
    websocket: WebSocket,
    msg_type: str,
    content: str,
    state: "SessionState",
) -> dict:
    """Process a single conversation turn through the full pipeline.

    Sends status messages via WebSocket during processing so the
    frontend can show progress updates to the user.
    """
    turn_index = state.turn - 1
    total_mock_turns = len(MOCK_CONVERSATION)

    # ── Step 1: STT ──────────────────────────────────────────────────
    if msg_type == "audio":
        await websocket.send_json({"type": "status", "step": "transcribing"})
        import base64

        audio_bytes = base64.b64decode(content)
        user_text = await _stt_service.transcribe(audio_bytes, turn_index)
    else:
        if _stt_service.mock_mode:
            user_text = _stt_service._mock_transcribe(turn_index)
        else:
            user_text = content

    if not user_text:
        return {"type": "error", "message": "Could not understand audio — try again or type instead."}

    # ── Step 2: OpenAI (i+1 response generation) ─────────────────────
    await websocket.send_json({"type": "status", "step": "thinking"})
    response_data = await _openai_service.generate_response(
        user_text, turn_index
    )
    tutor_response = TutorResponse(**response_data)

    # ── Step 3+4: TTS + Backboard in parallel ────────────────────────
    await websocket.send_json({"type": "status", "step": "speaking"})

    async def _backboard_update():
        try:
            await _backboard_service.update_mastery(tutor_response.mastery_scores)
            await _backboard_service.update_profile(
                level=tutor_response.user_level_assessment,
                turn=state.turn,
                border_update=tutor_response.border_update,
            )
        except Exception as exc:
            logger.error("Backboard update failed (non-fatal): %s", exc)

    # Fire-and-forget Backboard update — it's slow (~12s) but non-critical.
    # Don't await it; let it complete in the background.
    asyncio.create_task(_backboard_update())

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

    if MOCK_MODE and state.turn > total_mock_turns:
        state.demo_complete = True

    # ── Build response payload ───────────────────────────────────────
    return {
        "type": "turn_response",
        "turn": turn.model_dump(),
        "tts": tts_result,
        "session": {
            "turn": state.turn,
            "level": state.level,
            "demo_complete": state.demo_complete,
        },
    }
