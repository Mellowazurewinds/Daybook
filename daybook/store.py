"""SQLite persistence for Daybook's private, local activity log."""

from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator


def default_database_path() -> Path:
    override = os.environ.get("DAYBOOK_DATA_DIR")
    if override:
        return Path(override).expanduser() / "daybook.sqlite3"
    if os.name == "nt":
        base = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData/Local"))
    else:
        base = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local/share"))
    return base / "Daybook" / "daybook.sqlite3"


class Store:
    def __init__(self, path: Path | None = None) -> None:
        self.path = path or default_database_path()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS activities (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    day TEXT NOT NULL,
                    time TEXT NOT NULL DEFAULT '',
                    end_time TEXT NOT NULL DEFAULT '',
                    title TEXT NOT NULL,
                    category TEXT NOT NULL,
                    notes TEXT NOT NULL DEFAULT '',
                    minutes INTEGER NOT NULL DEFAULT 0 CHECK (minutes BETWEEN 0 AND 1440),
                    outcome TEXT NOT NULL DEFAULT 'progress',
                    energy INTEGER CHECK (energy IS NULL OR energy BETWEEN 1 AND 5),
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX IF NOT EXISTS activities_day_idx ON activities(day);
                CREATE INDEX IF NOT EXISTS activities_category_idx ON activities(category);
                CREATE TABLE IF NOT EXISTS goals (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    category TEXT NOT NULL,
                    target_minutes_week INTEGER NOT NULL CHECK (target_minutes_week BETWEEN 1 AND 10080),
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
                """
            )
            columns = {row["name"] for row in connection.execute("PRAGMA table_info(activities)")}
            if "outcome" not in columns:
                connection.execute("ALTER TABLE activities ADD COLUMN outcome TEXT NOT NULL DEFAULT 'progress'")
            if "end_time" not in columns:
                connection.execute("ALTER TABLE activities ADD COLUMN end_time TEXT NOT NULL DEFAULT ''")

    def add_activity(self, item: dict[str, Any]) -> dict[str, Any]:
        with self._connect() as connection:
            cursor = connection.execute(
                """INSERT INTO activities(day, time, end_time, title, category, notes, minutes, outcome, energy)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (item["day"], item["time"], item.get("end_time", ""), item["title"], item["category"], item["notes"], item["minutes"], item["outcome"], item["energy"]),
            )
            row = connection.execute("SELECT * FROM activities WHERE id = ?", (cursor.lastrowid,)).fetchone()
        return dict(row)

    def update_activity(self, activity_id: int, item: dict[str, Any]) -> dict[str, Any] | None:
        with self._connect() as connection:
            cursor = connection.execute(
                """UPDATE activities SET day=?, time=?, end_time=?, title=?, category=?, notes=?, minutes=?, outcome=?, energy=?
                   WHERE id=?""",
                (item["day"], item["time"], item.get("end_time", ""), item["title"], item["category"], item["notes"], item["minutes"], item["outcome"], item["energy"], activity_id),
            )
            if not cursor.rowcount:
                return None
            row = connection.execute("SELECT * FROM activities WHERE id = ?", (activity_id,)).fetchone()
        return dict(row)

    def list_activities(self, start_day: str, end_day: str) -> list[dict[str, Any]]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT * FROM activities WHERE day BETWEEN ? AND ? ORDER BY day DESC, time DESC, id DESC",
                (start_day, end_day),
            ).fetchall()
        return [dict(row) for row in rows]

    def delete_activity(self, activity_id: int) -> bool:
        with self._connect() as connection:
            cursor = connection.execute("DELETE FROM activities WHERE id = ?", (activity_id,))
        return cursor.rowcount > 0

    def add_goal(self, title: str, category: str, target_minutes_week: int) -> dict[str, Any]:
        with self._connect() as connection:
            cursor = connection.execute(
                "INSERT INTO goals(title, category, target_minutes_week) VALUES (?, ?, ?)",
                (title, category, target_minutes_week),
            )
            row = connection.execute("SELECT * FROM goals WHERE id = ?", (cursor.lastrowid,)).fetchone()
        return dict(row)

    def list_goals(self) -> list[dict[str, Any]]:
        with self._connect() as connection:
            rows = connection.execute("SELECT * FROM goals ORDER BY id DESC").fetchall()
        return [dict(row) for row in rows]

    def delete_goal(self, goal_id: int) -> bool:
        with self._connect() as connection:
            cursor = connection.execute("DELETE FROM goals WHERE id = ?", (goal_id,))
        return cursor.rowcount > 0

    def close(self) -> None:
        """Present for a predictable lifecycle; connections are short-lived."""

