from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager, suppress
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import load_config, load_runtime_environment
from data.cache.data_cache import DataCache
from retraining.scheduler import start_retraining_scheduler
from routes.api_models import ConfigResponse, HealthResponse
from routes import data, live, model, notebook, retraining, signal, training
from startup_actions import schedule_startup_actions

BASE_DIR = Path(__file__).resolve().parent
CONFIG_PATH = BASE_DIR.parent / "stocks.json"
ENVIRONMENT = load_runtime_environment(BASE_DIR.parent)
APP_CONFIG = load_config(CONFIG_PATH)
logging.basicConfig(level=str(ENVIRONMENT["LOG_LEVEL"]).upper())
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.data_cache = DataCache(default_ttl_seconds=300)
    scheduler = start_retraining_scheduler(app.state.config)
    app.state.retraining_scheduler = scheduler
    startup_tasks = schedule_startup_actions(app)
    app.state.startup_tasks = startup_tasks
    if startup_tasks:
        logger.info("Scheduled %s startup action(s).", len(startup_tasks))
    yield
    for task in startup_tasks:
        if task.done():
            continue
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task
    if scheduler is not None:
        scheduler.shutdown(wait=False)


app = FastAPI(
    title=str(APP_CONFIG.get("app_name", "ChronoSpectra API")),
    version=str(APP_CONFIG.get("version", "1.2.0")),
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(ENVIRONMENT["ALLOWED_FRONTEND_ORIGINS"]),
    allow_origin_regex=ENVIRONMENT.get("ALLOWED_FRONTEND_ORIGIN_REGEX"),
    allow_methods=["*"],
    allow_headers=["*"],
)
logger.info("Allowed CORS origins: %s", ", ".join(ENVIRONMENT["ALLOWED_FRONTEND_ORIGINS"]))
if ENVIRONMENT.get("ALLOWED_FRONTEND_ORIGIN_REGEX"):
    logger.info(
        "Allowed CORS origin regex: %s",
        ENVIRONMENT["ALLOWED_FRONTEND_ORIGIN_REGEX"],
    )
app.state.config = APP_CONFIG
app.state.environment = ENVIRONMENT

app.include_router(data.router, prefix="/data")
app.include_router(signal.router, prefix="/signal")
app.include_router(model.router, prefix="/model")
app.include_router(training.router, prefix="/training")
app.include_router(retraining.router, prefix="/retraining")
app.include_router(live.router, prefix="/live")
app.include_router(notebook.router, prefix="/notebook")

# Keep legacy `/api/*` callers working without changing the primary route surface.
app.include_router(data.router, prefix="/api/data", include_in_schema=False)
app.include_router(signal.router, prefix="/api/signal", include_in_schema=False)
app.include_router(model.router, prefix="/api/model", include_in_schema=False)
app.include_router(training.router, prefix="/api/training", include_in_schema=False)
app.include_router(retraining.router, prefix="/api/retraining", include_in_schema=False)
app.include_router(live.router, prefix="/api/live", include_in_schema=False)
app.include_router(notebook.router, prefix="/api/notebook", include_in_schema=False)


@app.get("/health", response_model=HealthResponse)
def healthcheck() -> HealthResponse:
    return HealthResponse(status="ok")


@app.get("/api/health", response_model=HealthResponse, include_in_schema=False)
def healthcheck_legacy() -> HealthResponse:
    return healthcheck()


@app.get("/config", response_model=ConfigResponse)
def get_config() -> ConfigResponse:
    return ConfigResponse(root=app.state.config)


@app.get("/api/config", response_model=ConfigResponse, include_in_schema=False)
def get_config_legacy() -> ConfigResponse:
    return get_config()
