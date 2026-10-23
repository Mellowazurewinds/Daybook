# Daybook

**Daybook is a private progress tracker for your days.** Log what you did, what moved forward, how long it took, and—if you want—your energy. Daybook turns those entries into daily, weekly, monthly, and yearly recaps and suggests a next focus using the goals and patterns you actually recorded.

The first version is local-first and uses only Python's standard library, SQLite, HTML, CSS, and JavaScript. Your log stays on this computer; the app does not require an account, a cloud service, or an AI API.

## Run it

The easiest option is to double-click `Daybook.exe` in this folder. It contains the app and Python runtime, opens Daybook in your browser, and stores your log on this computer.

Keep its console window open while using Daybook; close that window to stop the app. If Windows asks whether to allow it through the firewall, choose **Cancel**—Daybook only listens on this computer.

To run from source in VS Code instead, Python 3.11 or later is required. Open this folder, choose **Terminal → New Terminal**, then run:

```powershell
.\run_daybook.bat
```

Daybook opens [http://127.0.0.1:8765](http://127.0.0.1:8765) in your default browser automatically. Keep the terminal open while using it, and stop the app with **Ctrl+C** in the terminal.

This launcher uses the Python runtime bundled with Codex when it is available, so it does not depend on `py` finding a registered Python installation. Otherwise, it tries installed Python. You can also double-click `run_daybook.bat` to run from source.

To rebuild `Daybook.exe` after changing the source, double-click `build_daybook.bat`. The first build downloads the packaging tool from the Python package registry.

The app uses Python's built-in web server and does not need package installation or port forwarding. It listens only on this computer.

On Windows, the SQLite database is stored under `%LOCALAPPDATA%\Daybook\daybook.sqlite3`. To choose another data folder in PowerShell:

```powershell
$env:DAYBOOK_DATA_DIR = "D:\DaybookData"
python -m daybook.server
```

Use **Export my data** in the app to preview your complete activity record and download it as a PNG card.

## What it does

- Record an activity, category, notes, duration, outcome, optional time, and optional 1–5 energy rating.
- Review daily, weekly, monthly, and yearly totals and written recaps.
- Compare logged time with the previous day, week, or month.
- Add personal goals with weekly time targets and see progress for the selected period.
- Surface suggestions only when there is supporting log or goal evidence; sparse periods explicitly say that conclusions are limited.
- Review or delete individual entries and export your complete activity record as a PNG card.
- Correct an entry later without removing and recreating it.

Suggestions are descriptive prompts, not diagnoses or judgments. Unlogged time remains unknown. The current pattern rules are deterministic and visible in `daybook/analytics.py`; they do not infer activities that were never entered.

## Project structure

- `daybook/server.py` — loopback-only web server and JSON endpoints
- `daybook/store.py` — SQLite schema and data access
- `daybook/analytics.py` — period comparison, summaries, and pattern rules
- `daybook/static/` — responsive interface
- `docs/PRODUCT_PLAN.md` — scope, architecture, and milestones

## Current limits

This is an early MVP. It does not yet have account sync, automatic calendar imports, multi-user support, or continuous integration. Pattern suggestions need a growing personal log and explicit goals to become specific. These are planned deliberately rather than simulated with fabricated history.

## Run the checks

Python 3.11 or later is needed. From the project folder:

```powershell
python -m unittest discover -s tests -v
python -m compileall -q daybook tests
```

The regression checks cover date windows, sparse-data wording, summary aggregation, input validation, and SQLite add/edit/delete behavior. They use temporary databases and do not need third-party packages.

