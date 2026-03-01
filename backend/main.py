import logging
import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse

logger = logging.getLogger(__name__)

# Ensure the project root is on sys.path so `from backend.x import y`
# works regardless of whether uvicorn is started from the project root
# (uvicorn backend.main:app) or from within the backend/ directory
# (cd backend && uvicorn main:app).
_project_root = str(Path(__file__).resolve().parent.parent)
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)

app = FastAPI(
    title="Neural-Sync Language Lab",
    description="Voice-first adaptive language learning platform API",
    version="0.1.0",
)

# CORS middleware — allow frontend dev server origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_class=PlainTextResponse)
async def health_check():
    """Health check endpoint."""
    return "OK"


# Mount route routers — log warnings if any fail to import so
# missing routes are immediately visible in the server logs.
def _mount_routes() -> None:
    try:
        from backend.routes.session import router as session_router
        app.include_router(session_router)
    except Exception as exc:
        logger.warning("Failed to mount session routes: %s", exc)

    try:
        from backend.routes.graph import router as graph_router
        app.include_router(graph_router)
    except Exception as exc:
        logger.warning("Failed to mount graph routes: %s", exc)

    try:
        from backend.routes.conversation import router as conversation_router
        app.include_router(conversation_router)
    except Exception as exc:
        logger.warning("Failed to mount conversation routes: %s", exc)


_mount_routes()
