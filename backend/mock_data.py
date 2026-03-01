"""
Mock data for Neural-Sync Language Lab.

Pre-scripted 5-turn French conversation following Krashen's i+1 theory,
progressing from A1 to A2 CEFR level. Includes Knowledge Graph nodes
and links representing the learner's growing linguistic brain.

This module is the data contract for the entire app:
- Services return data from MOCK_CONVERSATION in mock mode
- Graph endpoints serve MOCK_GRAPH_NODES and MOCK_GRAPH_LINKS
- Frontend renders these structures in the UI
"""

# ---------------------------------------------------------------------------
# 5-Turn French Conversation (i+1 progression: A1 -> A1+ -> A2)
# ---------------------------------------------------------------------------
# Each turn contains:
#   - turn_number: 1-indexed turn
#   - user_said: What the user spoke in French (STT output)
#   - response: Full TutorResponse with all pedagogical fields

MOCK_CONVERSATION = [
    {
        "turn_number": 1,
        "user_said": "Bonjour",
        "response": {
            "spoken_response": "Bonjour ! Comment tu t'appelles ?",
            "translation_hint": "Hello! What is your name?",
            "vocabulary_breakdown": [
                {"word": "comment", "translation": "how/what", "part_of_speech": "adverb"},
                {"word": "tu", "translation": "you (informal)", "part_of_speech": "pronoun"},
                {"word": "t'appelles", "translation": "are called", "part_of_speech": "verb (s'appeler)"},
            ],
            "new_elements": ["comment", "tu t'appelles"],
            "reactivated_elements": ["bonjour"],
            "user_level_assessment": "A1",
            "border_update": "You can greet someone. Next: introduce yourself by name.",
            "mastery_scores": {
                "bonjour": 0.8,
                "comment": 0.3,
                "tu t'appelles": 0.2,
            },
            "user_vocabulary": ["bonjour"],
        },
    },
    {
        "turn_number": 2,
        "user_said": "Je m'appelle Marie",
        "response": {
            "spoken_response": "Enchanté, Marie ! Tu habites où ?",
            "translation_hint": "Nice to meet you, Marie! Where do you live?",
            "vocabulary_breakdown": [
                {"word": "enchanté", "translation": "nice to meet you", "part_of_speech": "adjective"},
                {"word": "habites", "translation": "live", "part_of_speech": "verb (habiter)"},
                {"word": "où", "translation": "where", "part_of_speech": "adverb"},
            ],
            "new_elements": ["enchanté", "tu habites", "où"],
            "reactivated_elements": ["tu t'appelles", "bonjour"],
            "user_level_assessment": "A1",
            "border_update": "You can introduce yourself. Next: talk about where you live.",
            "mastery_scores": {
                "bonjour": 0.9,
                "comment": 0.5,
                "tu t'appelles": 0.6,
                "je m'appelle": 0.7,
                "enchanté": 0.3,
                "tu habites": 0.2,
                "où": 0.3,
            },
            "user_vocabulary": ["je m'appelle"],
        },
    },
    {
        "turn_number": 3,
        "user_said": "J'habite à Paris",
        "response": {
            "spoken_response": "Ah, Paris ! C'est une belle ville. Tu aimes Paris ?",
            "translation_hint": "Ah, Paris! It's a beautiful city. Do you like Paris?",
            "vocabulary_breakdown": [
                {"word": "c'est", "translation": "it is", "part_of_speech": "pronoun + verb"},
                {"word": "belle", "translation": "beautiful", "part_of_speech": "adjective"},
                {"word": "ville", "translation": "city", "part_of_speech": "noun"},
                {"word": "aimes", "translation": "like/love", "part_of_speech": "verb (aimer)"},
            ],
            "new_elements": ["c'est", "belle", "ville", "tu aimes"],
            "reactivated_elements": ["tu habites", "où"],
            "user_level_assessment": "A1+",
            "border_update": "You can say where you live. Next: express preferences and opinions.",
            "mastery_scores": {
                "bonjour": 0.95,
                "tu t'appelles": 0.75,
                "je m'appelle": 0.8,
                "tu habites": 0.6,
                "j'habite": 0.7,
                "où": 0.5,
                "c'est": 0.3,
                "belle": 0.25,
                "ville": 0.3,
                "tu aimes": 0.2,
            },
            "user_vocabulary": ["j'habite", "Paris"],
        },
    },
    {
        "turn_number": 4,
        "user_said": "Oui, j'aime beaucoup Paris",
        "response": {
            "spoken_response": "Moi aussi ! Qu'est-ce que tu aimes faire à Paris ?",
            "translation_hint": "Me too! What do you like to do in Paris?",
            "vocabulary_breakdown": [
                {"word": "moi aussi", "translation": "me too", "part_of_speech": "pronoun + adverb"},
                {"word": "qu'est-ce que", "translation": "what (question form)", "part_of_speech": "interrogative"},
                {"word": "faire", "translation": "to do", "part_of_speech": "verb (infinitive)"},
            ],
            "new_elements": ["qu'est-ce que", "faire"],
            "reactivated_elements": ["tu aimes", "j'habite", "bonjour"],
            "user_level_assessment": "A1+",
            "border_update": "You can express what you like. Next: describe activities and hobbies.",
            "mastery_scores": {
                "bonjour": 0.98,
                "tu t'appelles": 0.8,
                "je m'appelle": 0.85,
                "tu habites": 0.7,
                "j'habite": 0.8,
                "tu aimes": 0.6,
                "j'aime": 0.7,
                "beaucoup": 0.5,
                "qu'est-ce que": 0.25,
                "faire": 0.2,
            },
            "user_vocabulary": ["j'aime", "beaucoup"],
        },
    },
    {
        "turn_number": 5,
        "user_said": "J'aime visiter les musées et manger des croissants",
        "response": {
            "spoken_response": "Excellent ! Tu parles déjà très bien. Les musées de Paris sont magnifiques !",
            "translation_hint": "Excellent! You already speak very well. The museums of Paris are magnificent!",
            "vocabulary_breakdown": [
                {"word": "parles", "translation": "speak", "part_of_speech": "verb (parler)"},
                {"word": "déjà", "translation": "already", "part_of_speech": "adverb"},
                {"word": "très bien", "translation": "very well", "part_of_speech": "adverb"},
                {"word": "magnifiques", "translation": "magnificent", "part_of_speech": "adjective"},
            ],
            "new_elements": ["tu parles", "déjà", "magnifiques"],
            "reactivated_elements": ["tu aimes", "faire", "belle", "ville"],
            "user_level_assessment": "A2",
            "border_update": "You can describe activities and preferences with detail. You've reached A2 — keep practicing!",
            "mastery_scores": {
                "bonjour": 1.0,
                "tu t'appelles": 0.85,
                "je m'appelle": 0.9,
                "tu habites": 0.8,
                "j'habite": 0.85,
                "tu aimes": 0.75,
                "j'aime": 0.8,
                "faire": 0.5,
                "visiter": 0.6,
                "musées": 0.5,
                "tu parles": 0.3,
                "magnifiques": 0.25,
            },
            "user_vocabulary": ["visiter", "musées", "manger", "croissants"],
        },
    },
]


# ---------------------------------------------------------------------------
# Knowledge Graph Nodes (12 nodes)
# ---------------------------------------------------------------------------
# Each node represents a vocabulary item or sentence structure.
# Fields:
#   - id: unique identifier (string)
#   - label: display text
#   - type: "vocab" | "sentence" | "grammar"
#   - mastery: float 0.0-1.0 (drives node color: red->yellow->green)
#   - level: CEFR level where this element was introduced
#   - turn_introduced: which turn this node first appears (for progressive reveal)

MOCK_GRAPH_NODES = [
    # User-spoken words only (from user_vocabulary + reactivated_elements)
    # usage_count = number of turns where the user actually said/reused this word
    # Turn 1: user said "bonjour"
    {"id": "bonjour", "label": "bonjour", "type": "vocab", "mastery": 1.0, "level": "A1", "turn_introduced": 1, "usage_count": 1},
    # Turn 2: user said "je m'appelle"; reactivated: tu t'appelles, bonjour
    {"id": "je_mappelle", "label": "je m'appelle", "type": "sentence", "mastery": 0.9, "level": "A1", "turn_introduced": 2, "usage_count": 1},
    {"id": "tu_tappelles", "label": "tu t'appelles", "type": "sentence", "mastery": 0.85, "level": "A1", "turn_introduced": 2, "usage_count": 1},
    # Turn 3: user said "j'habite", "Paris"; reactivated: tu habites, où
    {"id": "jhabite", "label": "j'habite", "type": "sentence", "mastery": 0.85, "level": "A1", "turn_introduced": 3, "usage_count": 1},
    {"id": "paris", "label": "Paris", "type": "vocab", "mastery": 0.7, "level": "A1", "turn_introduced": 3, "usage_count": 2},
    # Turn 4: user said "j'aime", "beaucoup"; reactivated: tu aimes, j'habite, bonjour
    {"id": "jaime", "label": "j'aime", "type": "sentence", "mastery": 0.8, "level": "A1+", "turn_introduced": 4, "usage_count": 2},
    {"id": "beaucoup", "label": "beaucoup", "type": "vocab", "mastery": 0.5, "level": "A1+", "turn_introduced": 4, "usage_count": 1},
    {"id": "tu_aimes", "label": "tu aimes", "type": "sentence", "mastery": 0.75, "level": "A1+", "turn_introduced": 4, "usage_count": 1},
    # Turn 5: user said "visiter", "musées", "manger", "croissants"; reactivated: tu aimes, faire, belle, ville
    {"id": "visiter", "label": "visiter", "type": "vocab", "mastery": 0.6, "level": "A2", "turn_introduced": 5, "usage_count": 1},
    {"id": "musees", "label": "musées", "type": "vocab", "mastery": 0.5, "level": "A2", "turn_introduced": 5, "usage_count": 1},
    {"id": "manger", "label": "manger", "type": "vocab", "mastery": 0.5, "level": "A2", "turn_introduced": 5, "usage_count": 1},
    {"id": "croissants", "label": "croissants", "type": "vocab", "mastery": 0.4, "level": "A2", "turn_introduced": 5, "usage_count": 1},
]


# ---------------------------------------------------------------------------
# Knowledge Graph Links (11 links)
# ---------------------------------------------------------------------------
# Each link represents a relationship between nodes.
# Fields:
#   - source: source node id
#   - target: target node id
#   - relationship: "prerequisite" | "semantic" | "reactivation" | "conjugation"
#   - turn_introduced: which turn this link first appears (for progressive reveal)

MOCK_GRAPH_LINKS = [
    # Turn 1→2: learning progression chain
    {"source": "bonjour", "target": "je_mappelle", "relationship": "prerequisite", "turn_introduced": 2},
    # Turn 2: reactivated tu t'appelles links to user's je m'appelle (conjugation pair)
    {"source": "tu_tappelles", "target": "je_mappelle", "relationship": "conjugation", "turn_introduced": 2},
    # Turn 2→3: learning progression chain
    {"source": "je_mappelle", "target": "jhabite", "relationship": "prerequisite", "turn_introduced": 3},
    # Turn 3: where-question semantic context
    {"source": "je_mappelle", "target": "paris", "relationship": "semantic", "turn_introduced": 3},
    # Turn 3: j'habite → Paris (semantic — location)
    {"source": "jhabite", "target": "paris", "relationship": "semantic", "turn_introduced": 3},
    # Turn 3→4: learning progression chain
    {"source": "paris", "target": "jaime", "relationship": "prerequisite", "turn_introduced": 4},
    # Turn 4: tu aimes (reactivated) ↔ j'aime (user said) — conjugation pair
    {"source": "tu_aimes", "target": "jaime", "relationship": "conjugation", "turn_introduced": 4},
    # Turn 4→5: learning progression chain
    {"source": "beaucoup", "target": "visiter", "relationship": "prerequisite", "turn_introduced": 5},
    # Turn 5: semantic pairs
    {"source": "visiter", "target": "musees", "relationship": "semantic", "turn_introduced": 5},
    {"source": "manger", "target": "croissants", "relationship": "semantic", "turn_introduced": 5},
    {"source": "jaime", "target": "paris", "relationship": "semantic", "turn_introduced": 5},
]
