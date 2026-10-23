"""Small dependency-free HTTP server for the local Daybook app."""

from __future__ import annotations

import json
import mimetypes
import re
import threading
import webbrowser
import os
from datetime import date, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from .analytics import build_summary, period_bounds
from .store import Store

APP_ROOT = Path(__file__).parent
STATIC_ROOT = APP_ROOT / "static"
STORE: Store | None = None
MAX_BODY_BYTES = 128_000


def get_store() -> Store:
    global STORE
    if STORE is None:
        STORE = Store()
    return STORE


class DaybookHandler(BaseHTTPRequestHandler):
    server_version = "Daybook/0.1"

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        query = parse_qs(parsed.query)
        try:
            if parsed.path == "/" or parsed.path in {"/index.html", "/app.js", "/styles.css"}:
                self._serve_static("index.html" if parsed.path == "/" else parsed.path.lstrip("/"))
            elif parsed.path == "/api/summary":
                period = query.get("period", ["day"])[0]
                selected = date.fromisoformat(query.get("date", [date.today().isoformat()])[0])
                if period not in {"day", "week", "month", "year"}:
                    raise ValueError("Choose day, week, month, or year.")
                start, end, previous_start, previous_end = period_bounds(period, selected)
                store = get_store()
                current = store.list_activities(start.isoformat(), end.isoformat())
                previous = store.list_activities(previous_start.isoformat(), previous_end.isoformat())
                summary = build_summary(period, selected, current, previous, store.list_goals())
                self._send_json(summary)
            elif parsed.path == "/api/entries":
                start = query.get("from", [(date.today().replace(day=1)).isoformat()])[0]
                end = query.get("to", [date.today().isoformat()])[0]
                date.fromisoformat(start)
                date.fromisoformat(end)
                store = get_store()
                self._send_json({"entries": store.list_activities(start, end)})
            elif parsed.path == "/api/goals":
                store = get_store()
                self._send_json({"goals": store.list_goals()})
            elif parsed.path == "/api/export":
                store = get_store()
                self._send_json({
                    "format_version": 1,
                    "exported_on": date.today().isoformat(),
                    "activities": store.list_activities("0001-01-01", "9999-12-31"),
                    "goals": store.list_goals(),
                })
            else:
                self._send_json({"error": "Not found."}, status=404)
        except (ValueError, TypeError) as error:
            self._send_json({"error": str(error) or "Invalid request."}, status=400)
        except Exception:
            self._send_json({"error": "Daybook could not complete that request."}, status=500)

    def do_POST(self) -> None:
        try:
            payload = self._read_json()
            store = get_store()
            if self.path == "/api/entries":
                self._send_json({"entry": store.add_activity(self._validate_activity(payload))}, status=201)
            elif self.path == "/api/goals":
                self._send_json({"goal": store.add_goal(*self._validate_goal(payload))}, status=201)
            else:
                self._send_json({"error": "Not found."}, status=404)
        except (ValueError, TypeError, json.JSONDecodeError) as error:
            self._send_json({"error": str(error) or "Invalid request."}, status=400)
        except Exception:
            self._send_json({"error": "Daybook could not save that item."}, status=500)

    def do_DELETE(self) -> None:
        match = re.fullmatch(r"/api/(entries|goals)/(\d+)", self.path)
        if not match:
            self._send_json({"error": "Not found."}, status=404)
            return
        record_type, record_id = match.groups()
        store = get_store()
        deleted = store.delete_activity(int(record_id)) if record_type == "entries" else store.delete_goal(int(record_id))
        self._send_json({"deleted": deleted}, status=200 if deleted else 404)

    def do_PUT(self) -> None:
        match = re.fullmatch(r"/api/entries/(\d+)", self.path)
        if not match:
            self._send_json({"error": "Not found."}, status=404)
            return
        try:
            payload = self._read_json()
            store = get_store()
            entry = store.update_activity(int(match.group(1)), self._validate_activity(payload))
            self._send_json({"entry": entry}, status=200 if entry else 404)
        except (ValueError, TypeError, json.JSONDecodeError) as error:
            self._send_json({"error": str(error) or "Invalid request."}, status=400)
        except Exception:
            self._send_json({"error": "Daybook could not update that item."}, status=500)

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        if length < 1 or length > MAX_BODY_BYTES:
            raise ValueError("Request body is empty or too large.")
        payload = json.loads(self.rfile.read(length))
        if not isinstance(payload, dict):
            raise ValueError("Expected a JSON object.")
        return payload

    @staticmethod
    def _validate_activity(payload: dict) -> dict:
        title = str(payload.get("title", "")).strip()
        category = str(payload.get("category", "")).strip()
        notes = str(payload.get("notes", "")).strip()
        day = str(payload.get("day", date.today().isoformat()))
        entry_time = str(payload.get("time", "")).strip()
        end_time = str(payload.get("end_time", "")).strip()
        if not title or len(title) > 120:
            raise ValueError("Activity name is required and must be 120 characters or fewer.")
        if not category or len(category) > 40:
            raise ValueError("Choose a category up to 40 characters long.")
        if len(notes) > 2000:
            raise ValueError("Notes must be 2,000 characters or fewer.")
        outcome = str(payload.get("outcome", "progress"))
        if outcome not in {"completed", "progress", "ongoing", "rest"}:
            raise ValueError("Choose a valid activity outcome.")
        date.fromisoformat(day)
        if entry_time:
            time.fromisoformat(entry_time)
        if end_time:
            time.fromisoformat(end_time)
            if not entry_time:
                raise ValueError("Add a start time before setting an end time.")
            start = time.fromisoformat(entry_time)
            end = time.fromisoformat(end_time)
            minutes = (end.hour * 60 + end.minute) - (start.hour * 60 + start.minute)
            if minutes < 0:
                minutes += 1440
        else:
            # Keep accepting saved durations from older clients and entries.
            minutes = int(payload.get("minutes", 0))
        if not 0 <= minutes <= 1440:
            raise ValueError("Duration must be between 0 and 1,440 minutes.")
        raw_energy = payload.get("energy")
        energy = None if raw_energy in (None, "") else int(raw_energy)
        if energy is not None and not 1 <= energy <= 5:
            raise ValueError("Energy rating must be between 1 and 5.")
        return {"day": day, "time": entry_time, "end_time": end_time, "title": title, "category": category, "notes": notes, "minutes": minutes, "outcome": outcome, "energy": energy}

    @staticmethod
    def _validate_goal(payload: dict) -> tuple[str, str, int]:
        title = str(payload.get("title", "")).strip()
        category = str(payload.get("category", "")).strip()
        target = int(payload.get("target_minutes_week", 0))
        if not title or len(title) > 100:
            raise ValueError("Goal name is required and must be 100 characters or fewer.")
        if not category or len(category) > 40:
            raise ValueError("Goal category is required and must be 40 characters or fewer.")
        if not 1 <= target <= 10080:
            raise ValueError("Weekly target must be between 1 and 10,080 minutes.")
        return title, category, target

    def _serve_static(self, filename: str) -> None:
        allowed = {"index.html", "app.js", "styles.css"}
        if filename not in allowed:
            self._send_json({"error": "Not found."}, status=404)
            return
        path = STATIC_ROOT / filename
        body = path.read_bytes()
        content_type = {".html": "text/html", ".js": "text/javascript", ".css": "text/css"}.get(Path(filename).suffix, mimetypes.guess_type(filename)[0] or "application/octet-stream")
        self.send_response(200)
        self.send_header("Content-Type", f"{content_type}; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def _send_json(self, payload: dict, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: object) -> None:
        # Keep normal activity out of the console; startup/errors are enough for this local app.
        return


def main() -> None:
    port = int(os.environ.get("DAYBOOK_PORT", "8765"))
    get_store()
    server = ThreadingHTTPServer(("127.0.0.1", port), DaybookHandler)
    url = f"http://127.0.0.1:{port}/"
    print(f"Daybook is running at {url} (local machine only). Press Ctrl+C to stop.")
    # Give the server a moment to enter its request loop before opening the page.
    threading.Timer(0.5, webbrowser.open, args=(url,)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nDaybook stopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
