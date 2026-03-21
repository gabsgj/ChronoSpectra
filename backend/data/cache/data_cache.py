from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Callable, Generic, TypeVar

CacheValue = TypeVar("CacheValue")


@dataclass(slots=True)
class CacheEntry(Generic[CacheValue]):
    value: CacheValue
    expires_at: datetime

    def is_expired(self, now: datetime) -> bool:
        return now >= self.expires_at


class DataCache:
    def __init__(self, default_ttl_seconds: int = 300) -> None:
        self.default_ttl_seconds = default_ttl_seconds
        self._entries: dict[str, CacheEntry[Any]] = {}

    def get(self, key: str) -> Any | None:
        entry = self._entries.get(key)
        if entry is None:
            return None
        now = datetime.now(UTC)
        if entry.is_expired(now):
            self._entries.pop(key, None)
            return None
        return entry.value

    def set(self, key: str, value: Any, ttl_seconds: int | None = None) -> Any:
        ttl = ttl_seconds or self.default_ttl_seconds
        expires_at = datetime.now(UTC) + timedelta(seconds=ttl)
        self._entries[key] = CacheEntry(value=value, expires_at=expires_at)
        return value

    def get_or_set(
        self,
        key: str,
        loader: Callable[[], CacheValue],
        ttl_seconds: int | None = None,
    ) -> CacheValue:
        cached_value = self.get(key)
        if cached_value is not None:
            return cached_value
        loaded_value = loader()
        self.set(key, loaded_value, ttl_seconds)
        return loaded_value

    def clear(self) -> None:
        self._entries.clear()
