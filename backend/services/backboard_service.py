"""
Backboard.io Memory & Mastery Tracking Service.

Mock mode: Uses in-memory dict for mastery scores and learner profile.
Real mode: Connects to Backboard SDK for persistent memory, with custom
           backend logic for mastery score tracking and CEFR assessment.
"""

import os
from backend.config import MOCK_MODE


class BackboardService:
    """Memory and mastery tracking service wrapping Backboard SDK."""

    def __init__(self):
        self.mock_mode = MOCK_MODE
        self._mastery_scores: dict[str, float] = {}
        self._learner_profile: dict = {
            "level": "A1",
            "total_turns": 0,
            "border_update": "",
        }
        if not self.mock_mode:
            self._init_real_client()

    def _init_real_client(self):
        """Initialize Backboard SDK client for persistent memory.

        Uses BackboardClient from the `backboard` package (not backboard_sdk).
        The client is async-only — all methods must be awaited.
        """
        from backboard import BackboardClient

        api_key = os.getenv("BACKBOARD_API_KEY", "")
        self._client = BackboardClient(api_key=api_key)
        self._assistant_id = None
        self._thread_id = None

    async def update_mastery(self, scores: dict[str, float]) -> None:
        """Update mastery scores for vocabulary/structures.

        Merges new scores into the existing mastery dictionary.
        Scores are floats from 0.0 (no mastery) to 1.0 (full mastery).

        Args:
            scores: Dictionary mapping vocabulary/structure keys to mastery floats.
        """
        if self.mock_mode:
            self._mock_update_mastery(scores)
            return
        await self._real_update_mastery(scores)

    def _mock_update_mastery(self, scores: dict[str, float]) -> None:
        """Store mastery scores in-memory, merging with existing scores.

        Args:
            scores: Dictionary of mastery scores to merge.
        """
        for key, value in scores.items():
            self._mastery_scores[key] = max(0.0, min(1.0, float(value)))

    async def _real_update_mastery(self, scores: dict[str, float]) -> None:
        """Persist mastery scores via Backboard SDK.

        Sends a structured message to Backboard with mastery data,
        using memory='Auto' for automatic fact extraction.

        Args:
            scores: Dictionary of mastery scores to persist.
        """
        if not self._thread_id:
            await self._ensure_thread()

        score_text = ", ".join(
            f"{word}: {score:.2f}" for word, score in scores.items()
        )
        await self._client.add_message(
            thread_id=self._thread_id,
            content=f"Mastery scores updated: {score_text}",
            memory="Auto",
            stream=False,
        )
        # Also update local cache for immediate reads
        for key, value in scores.items():
            self._mastery_scores[key] = max(0.0, min(1.0, float(value)))

    async def get_mastery(self) -> dict[str, float]:
        """Retrieve current mastery scores.

        Returns:
            Dictionary mapping vocabulary/structure keys to mastery floats.
        """
        if self.mock_mode:
            return self._mock_get_mastery()
        return await self._real_get_mastery()

    def _mock_get_mastery(self) -> dict[str, float]:
        """Return mastery scores from in-memory store.

        Returns:
            Copy of the current mastery scores dictionary.
        """
        return dict(self._mastery_scores)

    async def _real_get_mastery(self) -> dict[str, float]:
        """Retrieve mastery scores from local cache.

        Backboard provides generic memory — mastery score tracking
        is handled by custom backend logic with local cache.

        Returns:
            Dictionary of current mastery scores.
        """
        return dict(self._mastery_scores)

    async def update_profile(
        self, level: str, turn: int, border_update: str
    ) -> None:
        """Update the learner profile with current session state.

        Args:
            level: Current CEFR level assessment (e.g., "A1", "A1+", "A2").
            turn: Current conversation turn number.
            border_update: Description of the learner's expanding linguistic ability.
        """
        if self.mock_mode:
            self._mock_update_profile(level, turn, border_update)
            return
        await self._real_update_profile(level, turn, border_update)

    def _mock_update_profile(
        self, level: str, turn: int, border_update: str
    ) -> None:
        """Update learner profile in-memory.

        Args:
            level: Current CEFR level.
            turn: Current turn number.
            border_update: Latest border update text.
        """
        self._learner_profile["level"] = level
        self._learner_profile["total_turns"] = turn
        self._learner_profile["border_update"] = border_update

    async def _real_update_profile(
        self, level: str, turn: int, border_update: str
    ) -> None:
        """Persist learner profile updates via Backboard SDK.

        Args:
            level: Current CEFR level.
            turn: Current turn number.
            border_update: Latest border update text.
        """
        if not self._thread_id:
            await self._ensure_thread()

        await self._client.add_message(
            thread_id=self._thread_id,
            content=(
                f"Learner profile: CEFR level {level}, "
                f"completed {turn} turns. "
                f"Current ability: {border_update}"
            ),
            memory="Auto",
            stream=False,
        )
        self._learner_profile["level"] = level
        self._learner_profile["total_turns"] = turn
        self._learner_profile["border_update"] = border_update

    async def get_profile(self) -> dict:
        """Retrieve the current learner profile.

        Returns:
            Dictionary with level, total_turns, and border_update fields.
        """
        if self.mock_mode:
            return self._mock_get_profile()
        return await self._real_get_profile()

    def _mock_get_profile(self) -> dict:
        """Return learner profile from in-memory store.

        Returns:
            Copy of the current learner profile dictionary.
        """
        return dict(self._learner_profile)

    async def _real_get_profile(self) -> dict:
        """Retrieve learner profile from local cache.

        Returns:
            Dictionary with current learner profile data.
        """
        return dict(self._learner_profile)

    async def reset(self) -> None:
        """Reset all mastery scores and learner profile to defaults.

        Used when the session is reset to start a new conversation.
        """
        self._mastery_scores = {}
        self._learner_profile = {
            "level": "A1",
            "total_turns": 0,
            "border_update": "",
        }
        if not self.mock_mode and self._thread_id:
            # Create a fresh thread for the new session
            self._thread_id = None

    async def _ensure_thread(self) -> None:
        """Ensure a Backboard assistant and thread exist for this session.

        Creates them lazily on first real-mode API call.
        """
        if not self._assistant_id:
            assistant = await self._client.create_assistant(
                name="Neural-Sync Tutor",
                system_prompt=(
                    "You are tracking a French language learner's progress. "
                    "Remember their mastery scores, CEFR level, and linguistic "
                    "ability borders as they advance through conversation turns."
                ),
            )
            self._assistant_id = assistant.assistant_id

        thread = await self._client.create_thread(
            assistant_id=self._assistant_id,
        )
        self._thread_id = thread.thread_id
