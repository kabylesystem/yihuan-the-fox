"""
Supabase persistence layer for multi-profile session storage.

Stores conversation history and mastery scores per profile so data
persists across backend restarts and page refreshes.
"""

import logging
import os
from typing import Optional

from supabase import create_client, Client

logger = logging.getLogger(__name__)

_client: Optional[Client] = None


def _get_client() -> Client:
    global _client
    if _client is None:
        url = os.getenv("SUPABASE_URL", "")
        key = os.getenv("SUPABASE_ANON_KEY", "")
        if not url or not key:
            raise RuntimeError("SUPABASE_URL and SUPABASE_ANON_KEY must be set")
        _client = create_client(url, key)
    return _client


def list_profiles() -> list[dict]:
    """Return all profiles [{id, name, created_at}]."""
    res = _get_client().table("profiles").select("*").order("created_at").execute()
    return res.data


def create_profile(name: str) -> dict:
    """Create a new profile and return it."""
    res = _get_client().table("profiles").insert({"name": name}).execute()
    return res.data[0] if res.data else {}


def load_session(profile_id: str) -> Optional[dict]:
    """Load session state for a profile. Returns None if no session exists."""
    res = (
        _get_client()
        .table("sessions")
        .select("*")
        .eq("profile_id", profile_id)
        .execute()
    )
    if res.data:
        return res.data[0]
    return None


def save_session(profile_id: str, conversation_history: list, mastery_scores: dict, level: str, turn: int) -> None:
    """Upsert session state for a profile."""
    import json

    payload = {
        "profile_id": profile_id,
        "conversation_history": conversation_history,
        "mastery_scores": mastery_scores,
        "level": level,
        "turn": turn,
        "updated_at": "now()",
    }

    # Try update first, then insert
    existing = load_session(profile_id)
    if existing:
        _get_client().table("sessions").update(payload).eq("profile_id", profile_id).execute()
    else:
        _get_client().table("sessions").insert(payload).execute()

    logger.info("Saved session for profile %s (turn %d, %d history entries)", profile_id, turn, len(conversation_history))
