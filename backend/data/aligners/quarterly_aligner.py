from __future__ import annotations

from typing import Mapping

import pandas as pd


class QuarterlyAligner:
    def align(self, quarterly_tracks: Mapping[str, pd.DataFrame]) -> pd.DataFrame:
        prepared_tracks = [
            self._prepare_track(track_name, frame)
            for track_name, frame in quarterly_tracks.items()
        ]
        non_empty_tracks = [frame for frame in prepared_tracks if not frame.empty]
        if not non_empty_tracks:
            return pd.DataFrame()
        aligned_frame = pd.concat(non_empty_tracks, axis=1, join="outer")
        return aligned_frame.sort_index()

    def _prepare_track(self, track_name: str, frame: pd.DataFrame) -> pd.DataFrame:
        if frame.empty:
            return pd.DataFrame(columns=[track_name])
        normalized_frame = frame.copy()
        normalized_frame["quarter"] = pd.to_datetime(
            normalized_frame["quarter"]
        ).dt.tz_localize(None)
        normalized_frame = normalized_frame.set_index("quarter")
        return normalized_frame[["value_crores"]].rename(columns={"value_crores": track_name})
