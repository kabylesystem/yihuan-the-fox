from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse

app = FastAPI(
    title="Neural-Sync Language Lab",
    description="Voice-first adaptive language learning platform API",
    version="0.1.0",
)

# CORS middleware — allow frontend dev server origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_class=PlainTextResponse)
async def health_check():
    """Health check endpoint."""
    return "OK"


# Mount route routers (imported conditionally so app starts even if
# route modules are not yet created during incremental development)
def _mount_routes() -> None:
    try:
        from backend.routes.session import router as session_router
        app.include_router(session_router)
    except ImportError:
        pass

    try:
        from backend.routes.graph import router as graph_router
        app.include_router(graph_router)
    except ImportError:
        pass

    try:
        from backend.routes.conversation import router as conversation_router
        app.include_router(conversation_router)
    except ImportError:
        pass


_mount_routes()
