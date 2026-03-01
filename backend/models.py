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


class ResponseGraphLink(BaseModel):
    """An explicit graph link returned by the AI tutor."""

    source: str = Field(..., description="Source word/phrase")
    target: str = Field(..., description="Target word/phrase")
    type: str = Field(..., description="Relationship type: semantic, conjugation, prerequisite, correction")


class ValidatedUnit(BaseModel):
    """A validated learning unit extracted from the user's utterance."""

    text: str = Field(..., description="Unit text (word/chunk/pattern)")
    kind: str = Field(..., description="Unit kind: chunk, word, or pattern")
    source: str = Field(..., description="Source origin: as_said or corrected")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Validation confidence")
    is_accepted: bool = Field(..., description="Whether this unit is accepted into the graph")
    reject_reason: Optional[str] = Field(
        default=None, description="Optional rejection reason when is_accepted is false"
    )
    canonical_key: str = Field(
        default="",
        description="Canonical grouping key used to deduplicate overlapping concepts",
    )
    mission_relevance: float = Field(
        default=0.0,
        ge=0.0,
        le=1.0,
        description="Relevance score to current speaking mission",
    )


class CorrectionItem(BaseModel):
    """A concise correction item for user feedback."""

    as_said: str = Field(..., description="Original phrase as spoken by user")
    corrected: str = Field(..., description="Corrected phrase")
    rule: str = Field(..., description="Short grammar rule explanation")
    severity: str = Field(..., description="Correction severity: minor or major")


class TutorResponse(BaseModel):
    """Full pedagogical response from the AI tutor for a single turn.

    Contains the spoken French response, translation hints, vocabulary
    breakdown, i+1 elements, CEFR assessment, and mastery scores.
    """

    spoken_response: str = Field(..., description="Tutor's spoken French response")
    translation_hint: str = Field(..., description="English translation of the response")
    corrected_form: str = Field(
        default="",
        description="Corrected version of user's sentence (empty if no errors)",
    )
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
    graph_links: list[ResponseGraphLink] = Field(
        default_factory=list,
        description="Explicit relationships between concepts for the knowledge graph",
    )
    user_vocabulary: list[str] = Field(
        default_factory=list,
        description="Key vocabulary extracted from the USER's input (not the tutor's response)",
    )
    validated_user_units: list[ValidatedUnit] = Field(
        default_factory=list,
        description="Validated user units used as source of truth for graph nodes",
    )
    corrections: list[CorrectionItem] = Field(
        default_factory=list,
        description="Concise correction feedback items",
    )
    quality_score: float = Field(
        default=0.0,
        ge=0.0,
        le=1.0,
        description="Quality score for this turn (grammar + relevance)",
    )
    latency_ms: dict[str, int] = Field(
        default_factory=dict,
        description="Latency breakdown in milliseconds: stt, llm, total",
    )
    next_mission_hint: str = Field(
        default="",
        description="Suggested next short speaking mission",
    )
    mission_progress: dict[str, int] = Field(
        default_factory=dict,
        description="Mission progress counters: done, total, percent",
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
    usage_count: int = Field(
        default=1, ge=0, description="Number of turns where the user actually used this word"
    )


class GraphLink(BaseModel):
    """An edge in the Knowledge Graph representing a relationship between nodes."""

    source: str = Field(..., description="Source node id")
    target: str = Field(..., description="Target node id")
    relationship: str = Field(
        ...,
        description="Relationship type: prerequisite, semantic, reactivation, or conjugation",
    )
    reason: str = Field(
        default="",
        description="Human-readable reason explaining why this link exists",
    )
    reason_detail: str = Field(
        default="",
        description="Detailed explanation for this relationship",
    )
    evidence_units: list[str] = Field(
        default_factory=list,
        description="One or two canonical evidence units supporting this link",
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
    mission_state: dict = Field(
        default_factory=lambda: {
            "current_hint": "Mission A1-A2: Introduce yourself in two short sentences.",
            "tasks": [
                {"id": "quality", "label": "Reach at least 70% quality", "done": False},
                {"id": "units", "label": "Validate at least 2 useful units", "done": False},
                {"id": "turns", "label": "Complete 2 turns in this session", "done": False},
            ],
            "done": 0,
            "total": 3,
            "percent": 0,
        },
        description="Current mission state and progress",
    )
    diagnostics: list[dict] = Field(
        default_factory=list,
        description="Last conversation turn diagnostics (timings and quality)",
    )
