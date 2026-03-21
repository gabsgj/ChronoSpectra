from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

ConfigDict = dict[str, Any]

DEFAULT_ENVIRONMENT: ConfigDict = {
    "BACKEND_URL": "http://localhost:8000",
    "FRONTEND_URL": "http://localhost:5173",
    "VITE_BACKEND_URL": "http://localhost:8000",
    "ZERODHA_API_KEY": "",
    "ZERODHA_ACCESS_TOKEN": "",
    "ANGEL_ONE_API_KEY": "",
    "ANGEL_ONE_CLIENT_ID": "",
    "ANGEL_ONE_PASSWORD": "",
    "ANGEL_ONE_TOTP_SECRET": "",
    "APP_ENV": "development",
    "LOG_LEVEL": "INFO",
}
DEFAULT_LOCAL_TRAINING = {
    "enabled": False,
    "auto_place_models": True,
    "_note": (
        "When enabled, FastAPI trains models locally using the training pipeline "
        "instead of Colab. Set enabled:true offline to regenerate models, then "
        "set false before deploying to production."
    ),
}
DEFAULT_RETRAIN_ON_STARTUP = {
    "enabled": False,
    "_note": (
        "When true, FastAPI retrains all stale or missing models on startup. "
        "Use offline only. Always set false before pushing to production."
    ),
}
DEFAULT_STOCK_COLORS = [
    "#00D4AA",
    "#4C9AFF",
    "#FFB020",
    "#A06DFF",
    "#FF7A59",
]
DEFAULT_STOCK_COLOR_MAP = {
    "RELIANCE": "#00D4AA",
    "TCS": "#4C9AFF",
    "HDFCBANK": "#FFB020",
    "INFY": "#A06DFF",
    "WIPRO": "#FF7A59",
}


def load_runtime_environment(base_dir: str | Path | None = None) -> ConfigDict:
    project_root = _resolve_project_root(base_dir)
    env_payload: ConfigDict = dict(DEFAULT_ENVIRONMENT)
    for env_path in _candidate_env_paths(project_root):
        env_payload.update(_read_env_file(env_path))
    for key in DEFAULT_ENVIRONMENT:
        if key in os.environ:
            env_payload[key] = os.environ[key]
    env_payload["ALLOWED_FRONTEND_ORIGINS"] = _split_csv(
        str(env_payload.get("FRONTEND_URL", ""))
    )
    return env_payload


def load_config(path: str | Path) -> ConfigDict:
    config_path = Path(path).expanduser().resolve()
    raw_config = json.loads(config_path.read_text(encoding="utf-8"))
    if not isinstance(raw_config, dict):
        raise ValueError("stocks.json must contain a top-level JSON object.")
    raw_config.setdefault("app_name", "ChronoSpectra")
    raw_config.setdefault("version", "1.2.0")
    raw_config["local_training"] = _merge_defaults(
        DEFAULT_LOCAL_TRAINING,
        raw_config.get("local_training"),
    )
    raw_config["retrain_on_startup"] = _merge_defaults(
        DEFAULT_RETRAIN_ON_STARTUP,
        raw_config.get("retrain_on_startup"),
    )
    raw_config["stocks"] = _normalize_stocks(raw_config.get("stocks", []))
    active_stocks = [stock for stock in raw_config["stocks"] if stock.get("enabled", True)]
    raw_config["active_stocks"] = active_stocks
    raw_config["active_tickers"] = [stock["ticker"] for stock in active_stocks]
    raw_config["stock_ids"] = [stock["id"] for stock in active_stocks]
    raw_config["config_path"] = str(config_path)
    return raw_config


def find_stock(config: ConfigDict, stock_id: str) -> ConfigDict | None:
    for stock in config["stocks"]:
        if stock["id"] == stock_id:
            return stock
    return None


def find_exchange(config: ConfigDict, exchange_name: str) -> ConfigDict | None:
    return config["exchanges"].get(exchange_name.upper())


def _resolve_project_root(base_dir: str | Path | None) -> Path:
    if base_dir is not None:
        return Path(base_dir).expanduser().resolve()
    return Path(__file__).resolve().parents[1]


def _candidate_env_paths(project_root: Path) -> list[Path]:
    return [
        project_root / ".env",
        project_root / "backend" / ".env",
        project_root / "frontend" / ".env",
    ]


def _read_env_file(path: Path) -> ConfigDict:
    if not path.exists():
        return {}
    payload: ConfigDict = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if stripped.startswith("export "):
            stripped = stripped.removeprefix("export ").strip()
        key, separator, value = stripped.partition("=")
        if separator != "=":
            continue
        payload[key.strip()] = _strip_wrapping_quotes(value.strip())
    return payload


def _strip_wrapping_quotes(value: str) -> str:
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        return value[1:-1]
    return value


def _split_csv(value: str) -> list[str]:
    origins = [entry.strip() for entry in value.split(",") if entry.strip()]
    return origins or [str(DEFAULT_ENVIRONMENT["FRONTEND_URL"])]


def _merge_defaults(defaults: ConfigDict, value: Any) -> ConfigDict:
    if not isinstance(value, dict):
        return dict(defaults)
    return {**defaults, **value}


def _normalize_stocks(value: Any) -> list[ConfigDict]:
    if not isinstance(value, list):
        raise ValueError("stocks.json must define a 'stocks' array.")
    normalized_stocks: list[ConfigDict] = []
    used_colors: set[str] = set()
    for index, stock in enumerate(value):
        if not isinstance(stock, dict):
            raise ValueError("Each stock entry must be a JSON object.")
        normalized_stock = dict(stock)
        normalized_stock.setdefault("enabled", True)
        stock_id = str(normalized_stock.get("id", "")).upper()
        fallback_color = DEFAULT_STOCK_COLOR_MAP.get(
            stock_id,
            DEFAULT_STOCK_COLORS[index % len(DEFAULT_STOCK_COLORS)],
        )
        resolved_color = str(normalized_stock.get("color") or fallback_color)
        if resolved_color.lower() in used_colors:
            resolved_color = DEFAULT_STOCK_COLORS[index % len(DEFAULT_STOCK_COLORS)]
        used_colors.add(resolved_color.lower())
        normalized_stock["color"] = resolved_color
        normalized_stocks.append(normalized_stock)
    return normalized_stocks
