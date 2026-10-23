"""Evidence-led summaries and pattern suggestions for logged activity."""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date, timedelta
from typing import Any


def period_bounds(period: str, selected: date) -> tuple[date, date, date, date]:
    if period == "day":
        start = end = selected
        previous_start = previous_end = selected - timedelta(days=1)
    elif period == "week":
        start = selected - timedelta(days=selected.weekday())
        end = start + timedelta(days=6)
        previous_start = start - timedelta(days=7)
        previous_end = end - timedelta(days=7)
    elif period == "month":
        start = selected.replace(day=1)
        next_month = (start.replace(day=28) + timedelta(days=4)).replace(day=1)
        end = next_month - timedelta(days=1)
        previous_end = start - timedelta(days=1)
        previous_start = previous_end.replace(day=1)
    elif period == "year":
        start = selected.replace(month=1, day=1)
        end = selected.replace(month=12, day=31)
        previous_start = start.replace(year=start.year - 1)
        previous_end = end.replace(year=end.year - 1)
    else:
        raise ValueError("Period must be day, week, month, or year.")
    return start, end, previous_start, previous_end


def _stats(entries: list[dict[str, Any]]) -> dict[str, Any]:
    categories: Counter[str] = Counter()
    days: set[str] = set()
    energy_values: list[int] = []
    outcomes: Counter[str] = Counter()
    for entry in entries:
        categories[entry["category"]] += int(entry["minutes"])
        days.add(entry["day"])
        outcomes[entry.get("outcome", "progress")] += 1
        if entry["energy"] is not None:
            energy_values.append(int(entry["energy"]))
    return {
        "activities": len(entries),
        "minutes": sum(int(entry["minutes"]) for entry in entries),
        "active_days": len(days),
        "completed": outcomes["completed"],
        "progress": outcomes["progress"],
        "ongoing": outcomes["ongoing"],
        "rest": outcomes["rest"],
        "categories": dict(categories.most_common()),
        "average_energy": round(sum(energy_values) / len(energy_values), 1) if energy_values else None,
    }


def _hours_label(minutes: int) -> str:
    hours, remainder = divmod(minutes, 60)
    if hours and remainder:
        return f"{hours}h {remainder}m"
    if hours:
        return f"{hours}h"
    return f"{remainder}m"


def build_summary(period: str, selected: date, current: list[dict[str, Any]], previous: list[dict[str, Any]], goals: list[dict[str, Any]]) -> dict[str, Any]:
    start, end, previous_start, previous_end = period_bounds(period, selected)
    current_stats = _stats(current)
    previous_stats = _stats(previous)
    label = {"day": "Daily", "week": "Weekly", "month": "Monthly", "year": "Yearly"}[period]
    suggestions: list[dict[str, str]] = []
    enough_pattern_data = current_stats["active_days"] >= (1 if period == "day" else 3) and current_stats["activities"] >= (1 if period == "day" else 5)

    if not current:
        conclusion = "No activities are logged for this period, so there is not enough evidence to conclude how it went. That does not mean you did nothing."
        suggestions.append({"title": "Start with a quick log", "reason": "A short note about one thing you did is enough to begin building a reliable history."})
    else:
        top_category, top_minutes = next(iter(current_stats["categories"].items()))
        focus_share = round(top_minutes / current_stats["minutes"] * 100) if current_stats["minutes"] else 0
        if period == "day":
            conclusion = f"You logged {current_stats['activities']} {('activity' if current_stats['activities'] == 1 else 'activities')} across {len(current_stats['categories'])} {('area' if len(current_stats['categories']) == 1 else 'areas')} for {_hours_label(current_stats['minutes'])}. You marked {current_stats['completed']} completed and {current_stats['progress']} as progress made. {top_category} was your largest logged area ({_hours_label(top_minutes)})."
        else:
            conclusion = f"You logged {current_stats['activities']} activities across {current_stats['active_days']} days, totaling {_hours_label(current_stats['minutes'])}. You marked {current_stats['completed']} completed and {current_stats['progress']} as progress made. {top_category} took the largest share of tracked time ({focus_share}%)."
            if period == "week" and current_stats["active_days"] < 5:
                conclusion += f" Your log covers {current_stats['active_days']} of 7 days; unlogged days are unknown, not assumed to be inactive."
        if current_stats["average_energy"] is not None:
            conclusion += f" Average self-rated energy was {current_stats['average_energy']}/5."
        if current_stats["rest"]:
            conclusion += f" You also recorded {current_stats['rest']} rest or reset {('activity' if current_stats['rest'] == 1 else 'activities')}."
        if previous:
            delta = current_stats["minutes"] - previous_stats["minutes"]
            if delta > 0:
                comparison = f"{_hours_label(delta)} more"
            elif delta < 0:
                comparison = f"{_hours_label(abs(delta))} less"
            else:
                comparison = "the same amount"
            comparison_period = {"day": "day", "week": "week", "month": "month", "year": "year"}[period]
            conclusion += f" Compared with the previous {comparison_period}, you logged {comparison} time."

        if not enough_pattern_data and period != "day":
            suggestions.append({"title": "Build a little more history", "reason": "This period has fewer than five entries or three logged days, so broader patterns may be misleading."})
        if current_stats["minutes"] > 0 and focus_share >= 65 and len(current_stats["categories"]) > 0:
            suggestions.append({"title": f"Check whether {top_category} had the balance you wanted", "reason": f"It accounts for {focus_share}% of the time you logged. If another priority matters this period, consider reserving a small block for it."})

    # Goals are explicit user priorities. We scale weekly targets to the selected period.
    if goals and current:
        period_days = (end - start).days + 1
        for goal in goals:
            actual = sum(minutes for category, minutes in current_stats["categories"].items() if category.casefold() == goal["category"].casefold())
            expected = int(int(goal["target_minutes_week"]) * period_days / 7)
            if actual < expected * 0.6:
                suggestions.append({"title": f"Make room for {goal['title']}", "reason": f"Your goal is {goal['target_minutes_week']} min/week in {goal['category']}; this period shows {actual} min logged versus roughly {expected} min at that pace."})
            elif actual >= expected:
                suggestions.append({"title": f"You made room for {goal['title']}", "reason": f"You logged {actual} min in {goal['category']}, meeting or exceeding the period-scaled target of about {expected} min."})

    # Time-of-day observations require repeated sessions and are stated as tendencies.
    by_category_hour: dict[str, Counter[str]] = defaultdict(Counter)
    for entry in current:
        if entry["time"]:
            hour = int(entry["time"].split(":")[0])
            band = "morning" if 5 <= hour < 12 else "afternoon" if 12 <= hour < 17 else "evening" if 17 <= hour < 22 else "late night"
            by_category_hour[entry["category"]][band] += 1
    for category, counts in by_category_hour.items():
        band, count = counts.most_common(1)[0]
        if count >= 4 and period != "day":
            suggestions.append({"title": f"Your {category} sessions often happen in the {band}", "reason": f"{count} of your time-stamped {category} entries this period were logged in the {band}. You could try protecting that window for this activity."})

    if not suggestions:
        suggestions.append({"title": "Keep logging what matters", "reason": "No clear gap stands out from the evidence in this period. Keep tracking your chosen priorities to make future comparisons more useful."})

    highlights = [
        {"title": entry["title"], "category": entry["category"], "day": entry["day"], "time": entry["time"], "minutes": int(entry["minutes"]), "notes": entry["notes"], "outcome": entry.get("outcome", "progress")}
        for entry in (current if period == "day" else current[:8])
    ]
    return {
        "period": period,
        "label": label,
        "start": start.isoformat(),
        "end": end.isoformat(),
        "previous_start": previous_start.isoformat(),
        "previous_end": previous_end.isoformat(),
        "stats": current_stats,
        "previous_stats": previous_stats,
        "conclusion": conclusion,
        "suggestions": suggestions[:5],
        "highlights": highlights,
        "enough_pattern_data": enough_pattern_data,
    }
