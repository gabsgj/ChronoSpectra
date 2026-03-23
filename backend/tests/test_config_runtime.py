from __future__ import annotations

import re
import sys
import unittest
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from config import resolve_allowed_frontend_origin_regex


class RuntimeEnvironmentCorsTests(unittest.TestCase):
    def test_allows_lan_mobile_origins_for_local_dev_frontend(self) -> None:
        regex = resolve_allowed_frontend_origin_regex(
            {
                "APP_ENV": "development",
                "FRONTEND_URL": "http://localhost:5173",
            }
        )

        self.assertIsNotNone(regex)
        assert regex is not None
        self.assertIsNotNone(re.match(regex, "http://192.168.1.25:5173"))
        self.assertIsNotNone(re.match(regex, "http://10.0.0.8:5173"))
        self.assertIsNotNone(re.match(regex, "http://localhost:5173"))
        self.assertIsNone(re.match(regex, "https://chronospectra.example.com"))

    def test_production_does_not_expand_local_dev_frontend_origins(self) -> None:
        regex = resolve_allowed_frontend_origin_regex(
            {
                "APP_ENV": "production",
                "FRONTEND_URL": "http://localhost:5173",
            }
        )

        self.assertIsNone(regex)


if __name__ == "__main__":
    unittest.main()
