"""
Pydantic models for Neural-Sync Language Lab.

Defines the data contract between backend services, routes, and frontend.
All API request/response data flows through these validated models.
"""

from typing import Optional
from pydantic import BaseModel, Field


class VocabularyItem(BaseModel):
    """A single vocabulary entry in a tutor response breakdown."""

    word: str = Field(..., description="The French word or phrase")
    translation: str = Field(..., description="English translation")
    part_of_speech: str = Field(..., description="Grammatical category (e.g. noun, verb)")


class TutorResponse(BaseModel):
    """Full pedagogical response from the AI tutor for a single turn.

    Contains the spoken French response, translation hints, vocabulary
    breakdown, i+1 elements, CEFR assessment, and mastery scores.
    """

    spoken_response: str = Field(..., description="Tutor's spoken French response")
    translation_hint: str = Field(..., description="English translation of the response")
    vocabulary_breakdown: list[VocabularyItem] = Field(
        default_factory=list,
        description="Detailed breakdown of key vocabulary in the response",
    )
    new_elements: list[str] = Field(
        default_factory=list,
        description="New linguistic elements introduced this turn (i+1)",
    )
    reactivated_elements: list[str] = Field(
        default_factory=list,
        description="Previously learned elements reactivated for retrieval practice",
    )
    user_level_assessment: str = Field(
        ..., description="Current CEFR level assessment (e.g. A1, A1+, A2)"
    )
    border_update: str = Field(
        ..., description="Description of the learner's expanding linguistic border"
    )
    mastery_scores: dict[str, float] = Field(
        default_factory=dict,
        description="Mastery scores (0.0-1.0) for tracked vocabulary/structures",
    )


class ConversationTurn(BaseModel):
    """A single conversation turn containing user input and tutor response."""

    turn_number: int = Field(..., ge=1, description="1-indexed turn number")
    user_said: str = Field(..., description="What the user spoke in French (STT output)")
    response: TutorResponse = Field(..., description="Full tutor response for this turn")


class GraphNode(BaseModel):
    """A node in the Knowledge Graph representing a vocabulary item or structure."""

    id: str = Field(..., description="Unique node identifier")
    label: str = Field(..., description="Display text for the node")
    type: str = Field(..., description="Node type: vocab, sentence, or grammar")
    mastery: float = Field(
        ..., ge=0.0, le=1.0, description="Mastery score (0.0-1.0) driving node color"
    )
    level: str = Field(..., description="CEFR level where this element was introduced")
    turn_introduced: int = Field(
        ..., ge=1, description="Turn number when this node first appears"
    )


class GraphLink(BaseModel):
    """An edge in the Knowledge Graph representing a relationship between nodes."""

    source: str = Field(..., description="Source node id")
    target: str = Field(..., description="Target node id")
    relationship: str = Field(
        ...,
        description="Relationship type: prerequisite, semantic, reactivation, or conjugation",
    )
    turn_introduced: int = Field(
        ..., ge=1, description="Turn number when this link first appears"
    )


class SessionState(BaseModel):
    """Current session state tracking conversation progress."""

    turn: int = Field(default=1, ge=1, description="Current turn number")
    level: str = Field(default="A1", description="Current CEFR level")
    mastery_scores: dict[str, float] = Field(
        default_factory=dict,
        description="Accumulated mastery scores for all tracked elements",
    )
    conversation_history: list[ConversationTurn] = Field(
        default_factory=list,
        description="List of completed conversation turns",
    )
    demo_complete: bool = Field(
        default=False,
        description="Whether all mock turns have been exhausted",
    )
