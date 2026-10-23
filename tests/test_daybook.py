"""Focused regression checks for Daybook's date rules, API validation, and storage."""

from datetime import date
import json
import tempfile
import unittest
from pathlib import Path
from threading import Thread
from urllib.request import Request, urlopen

from daybook.analytics import build_summary, period_bounds
from daybook import server
from daybook.server import DaybookHandler
from daybook.store import Store


def activity(day: str = "2026-10-19", **overrides: object) -> dict:
    item = {
        "day": day, "time": "09:30", "title": "Study", "category": "Learning",
        "notes": "Read a chapter", "minutes": 45, "outcome": "completed", "energy": 4,
    }
    item.update(overrides)
    return item


class AnalyticsTests(unittest.TestCase):
    def test_week_and_month_bounds_include_calendar_edges(self) -> None:
        self.assertEqual(period_bounds("week", date(2026, 10, 19)), (
            date(2026, 10, 19), date(2026, 10, 25), date(2026, 10, 12), date(2026, 10, 18),
        ))
        self.assertEqual(period_bounds("month", date(2026, 3, 31)), (
            date(2026, 3, 1), date(2026, 3, 31), date(2026, 2, 1), date(2026, 2, 28),
        ))

    def test_empty_period_is_explicit_about_unknown_time(self) -> None:
        summary = build_summary("week", date(2026, 10, 19), [], [], [])
        self.assertEqual(summary["stats"]["activities"], 0)
        self.assertIn("not enough evidence", summary["conclusion"])
        self.assertFalse(summary["enough_pattern_data"])

    def test_summary_aggregates_activity_and_energy(self) -> None:
        entries = [activity(), activity("2026-10-20", minutes=30, energy=None, outcome="progress")]
        summary = build_summary("week", date(2026, 10, 19), entries, [], [])
        self.assertEqual(summary["stats"]["minutes"], 75)
        self.assertEqual(summary["stats"]["active_days"], 2)
        self.assertEqual(summary["stats"]["average_energy"], 4)
        self.assertEqual(summary["stats"]["completed"], 1)


class ValidationTests(unittest.TestCase):
    def test_activity_validation_accepts_optional_fields_and_strips_text(self) -> None:
        clean = DaybookHandler._validate_activity(activity(title="  Study  ", time="", energy=""))
        self.assertEqual(clean["title"], "Study")
        self.assertEqual(clean["time"], "")
        self.assertIsNone(clean["energy"])

    def test_activity_validation_rejects_out_of_range_values(self) -> None:
        for invalid in (activity(minutes=1441), activity(energy=6), activity(outcome="unknown")):
            with self.subTest(invalid=invalid):
                with self.assertRaises(ValueError):
                    DaybookHandler._validate_activity(invalid)


class StoreTests(unittest.TestCase):
    def test_add_update_delete_round_trip(self) -> None:
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as directory:
            store = Store(Path(directory) / "daybook.sqlite3")
            saved = store.add_activity(activity())
            changed = store.update_activity(saved["id"], activity(title="Updated", minutes=60))
            self.assertEqual(changed["title"], "Updated")
            self.assertEqual(changed["minutes"], 60)
            self.assertIsNone(store.update_activity(999, activity()))
            self.assertTrue(store.delete_activity(saved["id"]))
            self.assertFalse(store.delete_activity(saved["id"]))
            self.assertEqual(store.list_activities("2026-10-19", "2026-10-19"), [])


class ApiTests(unittest.TestCase):
    def test_create_edit_and_list_entry_over_http(self) -> None:
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as directory:
            previous_store = server.STORE
            server.STORE = Store(Path(directory) / "daybook.sqlite3")
            httpd = server.ThreadingHTTPServer(("127.0.0.1", 0), DaybookHandler)
            thread = Thread(target=httpd.serve_forever, daemon=True)
            thread.start()
            base = f"http://127.0.0.1:{httpd.server_port}"
            try:
                with urlopen(base) as response:
                    self.assertIn("text/html", response.headers["Content-Type"])
                created = self._json_request(base, "/api/entries", "POST", activity())
                entry_id = created["entry"]["id"]
                updated = self._json_request(base, f"/api/entries/{entry_id}", "PUT", activity(title="Corrected"))
                self.assertEqual(updated["entry"]["title"], "Corrected")
                with urlopen(f"{base}/api/entries?from=2026-10-19&to=2026-10-19") as response:
                    self.assertEqual(json.load(response)["entries"][0]["title"], "Corrected")
            finally:
                httpd.shutdown()
                httpd.server_close()
                thread.join()
                server.STORE = previous_store

    @staticmethod
    def _json_request(base: str, path: str, method: str, payload: dict) -> dict:
        request = Request(base + path, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"}, method=method)
        with urlopen(request) as response:
            return json.load(response)


if __name__ == "__main__":
    unittest.main()
