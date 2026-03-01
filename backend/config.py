import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# Load .env from project root (one level up from backend/)
_env_path = Path(__file__).resolve().parent.parent / ".env"
# In pytest, keep config deterministic from env vars set by tests.
if "pytest" not in sys.modules:
    load_dotenv(_env_path)

# Mock Mode Toggle
# When True, all services return pre-scripted data without API calls
# When False, real API integrations are used (requires valid API keys)
MOCK_MODE = os.getenv("MOCK_MODE", "true").lower() in ("true", "1", "yes")

# Speechmatics - Real-time Speech-to-Text
SPEECHMATICS_API_KEY = os.getenv("SPEECHMATICS_API_KEY", "")

# Backboard.io - Memory & Mastery Tracking
BACKBOARD_API_KEY = os.getenv("BACKBOARD_API_KEY", "")

# OpenAI - AI Tutor (GPT) + Text-to-Speech
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_ORG_ID = os.getenv("OPENAI_ORG_ID", "")
