from __future__ import annotations

from typing import Mapping

import pandas as pd


class DailyAligner:
    def align(self, daily_tracks: Mapping[str, pd.DataFrame]) -> pd.DataFrame:
        prepared_tracks = [
            self._prepare_track(track_name, frame)
            for track_name, frame in daily_tracks.items()
        ]
        non_empty_tracks = [frame for frame in prepared_tracks if not frame.empty]
        if not non_empty_tracks:
            return pd.DataFrame()
        aligned_frame = pd.concat(non_empty_tracks, axis=1, join="inner")
        return aligned_frame.sort_index().dropna(how="any")

    def _prepare_track(self, track_name: str, frame: pd.DataFrame) -> pd.DataFrame:
        if frame.empty:
            return pd.DataFrame(columns=[track_name])
        normalized_frame = frame.copy()
        normalized_frame.index = pd.to_datetime(normalized_frame.index).tz_localize(None)
        normalized_frame.index = normalized_frame.index.normalize()
        value_column = (
            "close" if "close" in normalized_frame.columns else normalized_frame.columns[0]
        )
        return normalized_frame[[value_column]].rename(columns={value_column: track_name})
