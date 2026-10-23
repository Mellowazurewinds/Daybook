# Daybook — Product Plan

## Product promise

Help a person understand how their days are going, notice patterns across a week or month, and choose a reasonable focus for what comes next.

Daybook is a **progress tracker for life outside a single activity**: Strava-like reflection over work, learning, health, relationships, home responsibilities, rest, and personal projects. It treats logged information as a partial record, never as the whole person.

## User loop

1. Add short activity notes during or after the day.
2. Mark whether the activity was completed, progress made, still ongoing, or rest/reset.
3. Review a written recap with time and activity evidence.
4. Add a goal to define what matters personally.
5. Use daily, weekly, and monthly comparisons to choose the next focus.

## Summary behavior

- **Daily:** activities logged, completed and progress counts, time by area, optional self-rated energy, and notes describing the recorded activities.
- **Weekly:** active log days, total activities/time, most-recorded areas, change from the previous week, goal pace, and repeated time-of-day patterns when enough entries exist.
- **Monthly:** longer-range activity mix, time, completion counts, change from the previous month, and progress against goals scaled to the calendar period.
- **Suggestions:** name the observation, cite the supporting count/time/goal, and offer one possible next step. If the record is sparse, say so. If a goal is below pace, suggest reviewing or reserving time; do not label the person as failing.

The first implementation uses explicit, deterministic rules. This creates explainable behavior and a reference baseline. Future statistical methods can be compared against that baseline; generative summaries are not required for the product promise.

## Technical architecture

- **Interface:** semantic HTML, responsive CSS, and browser JavaScript; no third-party packages or remotely loaded resources.
- **Application:** Python standard-library HTTP server bound to `127.0.0.1`, JSON endpoints, request validation, and a small analytics module.
- **Persistence:** SQLite stored in the operating-system user's application-data directory. Database access is isolated from request handling and analytics.
- **Analytics:** date-window calculations, category/time totals, previous-period comparisons, goal-pace checks, and minimum sample-size thresholds.
- **Privacy:** no login, telemetry, external API, or network listener beyond the local machine. User can export JSON and delete an entry. Backups and encryption are future design decisions.

## Resume value

- **Python/data analysis:** date-window aggregation, data validation, explainable heuristics, sample-size handling, and later cohort/trend analysis over real user data.
- **Software development:** HTTP APIs, SQLite modeling and migration, input validation, maintainable module boundaries, front-end usability, export, documentation, and later automated testing/CI.
- **Product engineering:** privacy-first defaults, uncertainty language, evidence-linked recommendations, accessibility, and user correction of the record.

## Milestones

### 1. Useful local MVP — current

Activity capture, outcomes, categories, duration, optional energy/time, date navigation, day/week/month summaries, period comparison, goal tracking, evidence-based suggestions, entry correction and deletion, data export, and a small standard-library regression suite.

### 2. Trust and quality

Add backup/import with schema validation, broader keyboard and screen-reader review, API persistence tests, and GitHub Actions after the project is hosted in a Git repository. Add fixture histories to make summary output reproducible.

### 3. Better personal patterns

Measure goal consistency, activity timing, workload balance, rest, and trends over several periods. Let users dismiss or correct an observation. Require sufficient history for each insight and expose why it appeared.

### 4. Portfolio demo

Add a demo mode using clearly labeled synthetic sample data, a short walkthrough, screenshots or a screen recording, setup guide, and a release checklist. Never mix sample activity into a real user's private database.

### Stretch

- Optional encrypted backup and explicit import/export between devices.
- Calendar import with preview and user approval.
- More robust trend analysis and user-defined analysis windows.
- Optional AI-generated prose only if it can cite the same underlying evidence and run without sending private logs to a service by default.

## Non-goals

No fitness-device integrations, social feed, streak pressure, public leaderboard, automatic surveillance, diagnoses, or pretending an incomplete log proves that time was wasted.
