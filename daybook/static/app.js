const state = {period: "day", date: localDateString(new Date()), summary: null};
let editingEntryId = null;
let legacyMinutesOnEdit = null;
let durationFieldsChanged = false;
let exportCardData = null;
let exportCardSvgUrl = null;
const $ = (selector) => document.querySelector(selector);
const commonAreas = ["Work", "Learning", "Health", "Relationships", "Home", "Rest", "Personal project"];

function setupAreaPickers() {
  document.querySelectorAll(".category-picker").forEach((picker) => {
    const input = picker.querySelector("input");
    const toggle = picker.querySelector(".category-picker-toggle");
    const menu = picker.querySelector(".category-options-menu");
    const close = () => {
      menu.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
    };
    const open = (filter = "") => {
      const matching = commonAreas.filter((area) => area.toLowerCase().includes(filter.toLowerCase()));
      menu.replaceChildren();
      for (const area of matching) {
        const option = document.createElement("button");
        option.type = "button";
        option.className = "category-option";
        option.setAttribute("role", "option");
        option.setAttribute("aria-selected", String(input.value.toLowerCase() === area.toLowerCase()));
        option.textContent = area;
        option.addEventListener("click", () => {
          input.value = area;
          input.dispatchEvent(new Event("input", {bubbles: true}));
          close();
          input.focus();
        });
        menu.append(option);
      }
      menu.hidden = false;
      toggle.setAttribute("aria-expanded", "true");
    };
    toggle.addEventListener("click", () => {
      if (menu.hidden) open();
      else close();
    });
    input.addEventListener("input", () => {
      if (!menu.hidden) open(input.value);
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        open();
      } else if (event.key === "Escape") {
        close();
      }
    });
    document.addEventListener("click", (event) => {
      if (!picker.contains(event.target)) close();
    });
  });
}

function syncStyledSelect(select) {
  const picker = select?.closest(".styled-select");
  if (picker) picker.querySelector(".styled-select-trigger > span:first-child").textContent = select.selectedOptions[0]?.textContent || "";
}

function setupStyledSelects() {
  document.querySelectorAll(".styled-select").forEach((picker) => {
    const select = picker.querySelector("select");
    const trigger = picker.querySelector(".styled-select-trigger");
    const menu = picker.querySelector(".styled-select-menu");
    const close = (returnFocus = false) => {
      menu.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      if (returnFocus) trigger.focus();
    };
    const open = () => {
      menu.replaceChildren();
      for (const item of select.options) {
        const option = document.createElement("button");
        option.type = "button";
        option.className = "category-option";
        option.setAttribute("role", "option");
        option.setAttribute("aria-selected", String(item.value === select.value));
        option.textContent = item.textContent;
        option.addEventListener("click", () => {
          select.value = item.value;
          select.dispatchEvent(new Event("change", {bubbles: true}));
          close(true);
        });
        menu.append(option);
      }
      menu.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
    };
    select.addEventListener("change", () => syncStyledSelect(select));
    trigger.addEventListener("click", () => menu.hidden ? open() : close());
    trigger.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (menu.hidden) open();
        menu.querySelector('[aria-selected="true"]')?.focus();
      }
    });
    menu.addEventListener("keydown", (event) => {
      const options = [...menu.querySelectorAll(".category-option")];
      const index = options.indexOf(document.activeElement);
      if (event.key === "Escape") close(true);
      else if (event.key === "ArrowDown") { event.preventDefault(); options[Math.min(index + 1, options.length - 1)]?.focus(); }
      else if (event.key === "ArrowUp") { event.preventDefault(); options[Math.max(index - 1, 0)]?.focus(); }
      else if (event.key === "Home") { event.preventDefault(); options[0]?.focus(); }
      else if (event.key === "End") { event.preventDefault(); options.at(-1)?.focus(); }
      else if (event.key === "Tab") close();
    });
    document.addEventListener("click", (event) => {
      if (!picker.contains(event.target)) close();
    });
    syncStyledSelect(select);
  });
  document.querySelectorAll("form").forEach((form) => form.addEventListener("reset", () => requestAnimationFrame(() => form.querySelectorAll(".styled-select-native").forEach(syncStyledSelect))));
}

function confirmAction(title, message) {
  const dialog = $("#confirm-dialog");
  $("#confirm-title").textContent = title;
  $("#confirm-message").textContent = message;
  dialog.returnValue = "cancel";
  return new Promise((resolve) => {
    dialog.addEventListener("close", () => resolve(dialog.returnValue === "confirm"), {once: true});
    dialog.showModal();
  });
}

function localDateString(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function formatMinutes(value) {
  const minutes = Number(value || 0);
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours && remainder) return `${hours}h ${remainder}m`;
  if (hours) return `${hours}h`;
  return `${remainder}m`;
}

function escapeXml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;"}[character]));
}

function wrapCardText(value, maxCharacters) {
  const words = String(value || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    if (line && `${line} ${word}`.length > maxCharacters) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function cardText(x, y, value, size = 16, color = "#1f302d", weight = 400) {
  return `<text x="${x}" y="${y}" fill="${color}" font-family="Segoe UI,Arial,sans-serif" font-size="${size}" font-weight="${weight}" font-variant-numeric="lining-nums tabular-nums">${escapeXml(value)}</text>`;
}

function buildExportCard(data) {
  const width = 1100;
  const margin = 52;
  const inner = width - margin * 2;
  const activities = data.activities || [];
  const goals = data.goals || [];
  const minutes = activities.reduce((sum, entry) => sum + Number(entry.minutes || 0), 0);
  const days = new Set(activities.map((entry) => entry.day)).size;
  const areas = new Set(activities.map((entry) => entry.category)).size;
  const pieces = [];
  let y = 0;
  pieces.push(`<rect width="100%" height="100%" fill="#e8efe7"/><rect x="20" y="20" width="1060" height="${0}" rx="24" fill="#f3f7f1" stroke="#d9e3d8"/>`);
  y = 78;
  pieces.push(`<rect x="${margin}" y="48" width="40" height="40" rx="12" fill="#6f927f"/>`);
  pieces.push(cardText(margin + 13, 77, "d", 29, "#ffffff", 800));
  pieces.push(cardText(margin + 54, 76, "Daybook", 28, "#1f302d", 800));
  pieces.push(cardText(width - margin, 72, `EXPORTED ${new Date().toLocaleDateString(undefined, {year: "numeric", month: "long", day: "numeric"}).toUpperCase()}`, 12, "#64756b", 700).replace(`x="${width - margin}"`, `x="${width - margin}" text-anchor="end"`));
  y = 132;
  pieces.push(cardText(margin, y, "YOUR PERSONAL ACTIVITY RECORD", 12, "#4f705e", 700));
  y += 28;
  pieces.push(cardText(margin, y, "Everything you’ve logged, together in one place.", 22, "#1f302d", 600));
  y += 42;
  const stats = [["ACTIVITIES", `${activities.length}`], ["TIME LOGGED", formatMinutes(minutes)], ["DAYS WITH LOGS", `${days}`], ["AREAS", `${areas}`]];
  const gap = 14;
  const statWidth = (inner - gap * 3) / 4;
  stats.forEach(([label, value], index) => {
    const x = margin + index * (statWidth + gap);
    pieces.push(`<rect x="${x}" y="${y}" width="${statWidth}" height="86" rx="12" fill="#f5f8f3" stroke="#e3e9df"/>`);
    pieces.push(cardText(x + 16, y + 26, label, 10, "#64756b", 700));
    pieces.push(cardText(x + 16, y + 61, value, 23, "#1f302d", 700));
  });
  y += 120;
  pieces.push(cardText(margin, y, "YOUR PRIORITIES", 12, "#4f705e", 700));
  y += 18;
  if (!goals.length) {
    pieces.push(cardText(margin, y + 17, "No priorities saved.", 14, "#64756b"));
    y += 42;
  } else {
    for (const goal of goals) {
      const rowHeight = 50;
      pieces.push(`<rect x="${margin}" y="${y}" width="${inner}" height="${rowHeight}" rx="9" fill="#edf3eb" stroke="#d9e3d8"/>`);
      pieces.push(cardText(margin + 14, y + 21, goal.title, 14, "#1f302d", 600));
      pieces.push(cardText(margin + 14, y + 39, `${goal.category} · ${formatMinutes(goal.target_minutes_week)} per week`, 11, "#64756b"));
      pieces.push(cardText(width - margin - 14, y + 29, `Priority #${goal.id}`, 10, "#64756b", 400).replace(`x="${width - margin - 14}"`, `x="${width - margin - 14}" text-anchor="end"`));
      y += rowHeight + 7;
    }
    y += 10;
  }
  pieces.push(cardText(margin, y, "ACTIVITY LOG", 12, "#4f705e", 700));
  y += 18;
  if (!activities.length) {
    pieces.push(cardText(margin, y + 17, "No activities logged yet.", 14, "#64756b"));
    y += 42;
  } else {
    for (const entry of activities) {
      const titleLines = wrapCardText(entry.title, 100);
      const noteLines = entry.notes ? wrapCardText(entry.notes, 112) : [];
      const details = [
        `${entry.day}${entry.time ? ` · starts ${entry.time}` : " · no start time"}${entry.end_time ? ` · ends ${entry.end_time}` : " · no end time"} · ${formatMinutes(entry.minutes)} · ${entry.outcome || "Progress made"}${entry.energy ? ` · energy ${entry.energy}/5` : " · energy not rated"}`,
        `Area: ${entry.category}`,
        ...noteLines.map((line) => `Note: ${line}`),
      ];
      const rowHeight = 20 + titleLines.length * 18 + details.length * 18 + 10;
      pieces.push(`<rect x="${margin}" y="${y}" width="${inner}" height="${rowHeight}" rx="9" fill="#edf3eb" stroke="#d9e3d8"/>`);
      let lineY = y + 22;
      for (const titleLine of titleLines) {
        pieces.push(cardText(margin + 14, lineY, titleLine, 14, "#1f302d", 600));
        lineY += 18;
      }
      for (const detail of details) {
        pieces.push(cardText(margin + 14, lineY, detail, 11, "#64756b"));
        lineY += 18;
      }
      pieces.push(cardText(width - margin - 14, y + 22, `Activity #${entry.id}`, 10, "#64756b", 400).replace(`x="${width - margin - 14}"`, `x="${width - margin - 14}" text-anchor="end"`));
      y += rowHeight + 8;
    }
  }
  y += 40;
  pieces.push(cardText(margin, y, "Your Daybook data stays on this device.", 11, "#64756b"));
  const height = y + 38;
  pieces[0] = `<rect width="100%" height="100%" fill="#e8efe7"/><rect x="20" y="20" width="1060" height="${height - 40}" rx="24" fill="#f3f7f1" stroke="#d9e3d8"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${pieces.join("")}</svg>`;
}

async function openExportPreview() {
  const dialog = $("#export-dialog");
  const preview = $("#export-card-preview");
  const status = $("#export-status");
  const download = $("#export-download");
  download.disabled = true;
  preview.hidden = true;
  status.hidden = false;
  status.textContent = "Preparing your card…";
  if (exportCardSvgUrl) URL.revokeObjectURL(exportCardSvgUrl);
  dialog.showModal();
  try {
    exportCardData = await request("/api/export");
    const svg = buildExportCard(exportCardData);
    exportCardSvgUrl = URL.createObjectURL(new Blob([svg], {type: "image/svg+xml;charset=utf-8"}));
    preview.onload = () => {
      preview.hidden = false;
      status.hidden = true;
      download.disabled = false;
    };
    preview.onerror = () => {
      status.textContent = "The preview couldn’t be created. Please close it and try again.";
    };
    preview.src = exportCardSvgUrl;
  } catch (error) {
    status.textContent = error instanceof TypeError || /failed to fetch|networkerror/i.test(error.message)
      ? "Daybook couldn’t reach your saved data. Check that Daybook is running, then try again."
      : error.message || "Daybook couldn’t prepare the export. Please try again.";
  }
}

function elapsedMinutes(startTime, endTime) {
  const toMinutes = (value) => {
    const [hours, minutes] = value.split(":").map(Number);
    return hours * 60 + minutes;
  };
  const difference = toMinutes(endTime) - toMinutes(startTime);
  return difference < 0 ? difference + 1440 : difference;
}

function clockDurationMinutes(value) {
  if (!value) return 0;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function updateDurationPreview() {
  const form = $("#activity-form");
  const start = form.elements.time.value;
  const end = form.elements.end_time.value;
  const preview = $("#duration-result");
  if (start && end) {
    preview.textContent = formatMinutes(elapsedMinutes(start, end));
  } else if (!durationFieldsChanged && legacyMinutesOnEdit !== null) {
    preview.textContent = formatMinutes(legacyMinutesOnEdit);
  } else {
    preview.textContent = "—";
  }
}

function formatDate(value, options = {month: "short", day: "numeric"}) {
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, options);
}

function daysBetween(start, end) {
  const toUtcDay = (value) => {
    const [year, month, day] = value.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((toUtcDay(end) - toUtcDay(start)) / 86400000) + 1;
}

function escapeText(value) {
  return String(value ?? "");
}

async function request(url, options = {}) {
  const response = await fetch(url, {headers: {"Content-Type": "application/json"}, ...options});
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Something went wrong.");
  return payload;
}

async function refresh() {
  const params = new URLSearchParams({period: state.period, date: state.date});
  try {
    const summary = await request(`/api/summary?${params}`);
    state.summary = summary;
    renderSummary(summary);
    await Promise.all([renderEntries(summary.start, summary.end), renderGoals()]);
  } catch (error) {
    $("#conclusion").textContent = error.message;
  }
}

function renderSummary(summary) {
  const stats = summary.stats;
  const totalDays = daysBetween(summary.start, summary.end);
  $("#period-range").textContent = summary.period === "day"
    ? formatDate(summary.start, {weekday: "long", month: "long", day: "numeric"})
    : summary.period === "year"
      ? new Date(`${summary.start}T12:00:00`).getFullYear()
      : `${formatDate(summary.start)} — ${formatDate(summary.end, {month: "short", day: "numeric", year: "numeric"})}`;
  $("#recap-title").textContent = summary.period === "day" ? "Your day, in perspective" : `${summary.label} perspective`;
  $("#entries-heading").textContent = summary.period === "day" ? "Today’s activity" : `${summary.label} activity`;
  $("#metric-time").textContent = formatMinutes(stats.minutes);
  $("#metric-time-note").textContent = `${Object.keys(stats.categories).length} ${Object.keys(stats.categories).length === 1 ? "area" : "areas"} tracked`;
  $("#metric-activities").textContent = stats.activities;
  $("#metric-completed").textContent = `${stats.completed} marked complete · ${stats.progress} progress made`;
  $("#metric-days").textContent = `${stats.active_days} / ${totalDays}`;
  $("#metric-days-note").textContent = summary.period === "day" ? (stats.active_days ? "At least one entry logged" : "No entry logged yet") : "days with at least one entry";
  $("#metric-energy").textContent = stats.average_energy === null ? "—" : `${stats.average_energy} / 5`;
  $("#conclusion").textContent = summary.conclusion;
  renderHighlights(summary.highlights);
  renderCategories(stats.categories);
  renderSuggestions(summary.suggestions);
}

function renderHighlights(items) {
  const container = $("#highlights");
  container.replaceChildren();
  if (!items.length) return;
  const label = document.createElement("div");
  label.className = "minor-heading";
  label.textContent = "WHAT YOU LOGGED";
  container.append(label);
  for (const item of items) {
    const row = document.createElement("div");
    row.className = "highlight-row";
    const icon = document.createElement("span");
    icon.className = "highlight-icon";
    icon.textContent = item.outcome === "completed" ? "✓" : item.outcome === "rest" ? "·" : "↗";
    const main = document.createElement("div");
    const title = document.createElement("div");
    title.className = "highlight-title";
    title.textContent = escapeText(item.title);
    main.append(title);
    if (item.notes) {
      const detail = document.createElement("div");
      detail.className = "highlight-detail";
      detail.textContent = escapeText(item.notes);
      main.append(detail);
    }
    const meta = document.createElement("span");
    meta.className = "highlight-meta";
    meta.textContent = `${item.category} · ${formatMinutes(item.minutes)}`;
    row.append(icon, main, meta);
    container.append(row);
  }
}

function renderCategories(categories) {
  const container = $("#category-bars");
  container.replaceChildren();
  const rows = Object.entries(categories);
  if (!rows.length) {
    const empty = document.createElement("p");
    empty.className = "empty-inline";
    empty.textContent = "No activity has been logged in this period yet.";
    container.append(empty);
    return;
  }
  const max = Math.max(1, ...rows.map(([, minutes]) => minutes));
  for (const [name, minutes] of rows) {
    const row = document.createElement("div");
    row.className = "category-row";
    const title = document.createElement("span");
    title.className = "category-name";
    title.textContent = escapeText(name);
    const track = document.createElement("div");
    track.className = "bar-track";
    const fill = document.createElement("div");
    fill.className = "bar-fill";
    fill.style.width = `${Math.max(2, minutes / max * 100)}%`;
    track.append(fill);
    const duration = document.createElement("span");
    duration.className = "category-duration";
    duration.textContent = formatMinutes(minutes);
    row.append(title, track, duration);
    container.append(row);
  }
}

function renderSuggestions(items) {
  const container = $("#suggestions");
  container.replaceChildren();
  for (const item of items) {
    const card = document.createElement("article");
    card.className = "suggestion";
    const title = document.createElement("h3");
    title.textContent = escapeText(item.title);
    const reason = document.createElement("p");
    reason.textContent = escapeText(item.reason);
    card.append(title, reason);
    container.append(card);
  }
}

async function renderEntries(start, end) {
  const payload = await request(`/api/entries?${new URLSearchParams({from: start, to: end})}`);
  const container = $("#entry-list");
  container.replaceChildren();
  if (!payload.entries.length) {
    const empty = document.createElement("p");
    empty.className = "empty-inline";
    empty.textContent = "Nothing logged for this period yet. Add an activity above whenever you’re ready.";
    container.append(empty);
    return;
  }
  for (const entry of payload.entries) {
    const row = document.createElement("article");
    row.className = "entry-row";
    const date = document.createElement("span");
    date.className = "entry-date";
    const timeRange = entry.time
      ? `${entry.time}${entry.end_time ? `–${entry.end_time}` : ""}`
      : (entry.end_time || "");
    date.textContent = `${formatDate(entry.day)}${timeRange ? ` · ${timeRange}` : ""}`;
    const main = document.createElement("div");
    main.className = "entry-main";
    const title = document.createElement("strong");
    title.textContent = escapeText(entry.title);
    main.append(title);
    if (entry.notes) {
      const notes = document.createElement("p");
      notes.textContent = escapeText(entry.notes);
      main.append(notes);
    }
    const category = document.createElement("span");
    category.className = "entry-category";
    category.textContent = escapeText(entry.category);
    const duration = document.createElement("span");
    duration.className = "entry-duration";
    const durationValue = document.createElement("strong");
    durationValue.textContent = formatMinutes(entry.minutes);
    const sessionStatus = document.createElement("span");
    sessionStatus.className = "entry-state";
    sessionStatus.textContent = entry.end_time
      ? "Session ended"
      : (entry.outcome === "ongoing" ? "Task still in progress" : entry.outcome);
    duration.append(durationValue, sessionStatus);
    const actions = document.createElement("div");
    actions.className = "entry-actions";
    if (entry.time && !entry.end_time && entry.day === localDateString(new Date())) {
      const endSession = document.createElement("button");
      endSession.className = "end-session-button";
      endSession.type = "button";
      endSession.setAttribute("aria-label", `End session for ${entry.title} now`);
      endSession.textContent = "End session";
      endSession.addEventListener("click", async () => {
        const now = new Date();
        const endTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
        const updated = {...entry, end_time: endTime, minutes: elapsedMinutes(entry.time, endTime)};
        endSession.disabled = true;
        endSession.textContent = "Ending…";
        try {
          await request(`/api/entries/${entry.id}`, {method: "PUT", body: JSON.stringify(updated)});
          await refresh();
        } catch (error) {
          endSession.disabled = false;
          endSession.textContent = "End session";
          $("#form-message").textContent = error.message;
        }
      });
      actions.append(endSession);
    }
    const remove = document.createElement("button");
    remove.className = "delete-entry";
    remove.type = "button";
    remove.setAttribute("aria-label", `Delete ${entry.title}`);
    remove.textContent = "×";
    const edit = document.createElement("button");
    edit.className = "edit-entry";
    edit.type = "button";
    edit.setAttribute("aria-label", `Edit ${entry.title}`);
    edit.textContent = "Edit";
    edit.addEventListener("click", () => {
      const form = $("#activity-form");
      for (const key of ["title", "category", "notes", "day", "time", "end_time", "outcome", "energy"]) {
        form.elements[key].value = entry[key] ?? "";
      }
      form.querySelectorAll(".styled-select-native").forEach(syncStyledSelect);
      legacyMinutesOnEdit = entry.end_time ? null : Number(entry.minutes || 0);
      durationFieldsChanged = false;
      updateDurationPreview();
      editingEntryId = entry.id;
      form.querySelector(".primary-button").innerHTML = 'Save changes <span aria-hidden="true">↗</span>';
      $("#cancel-edit").hidden = false;
      $("#form-message").textContent = `Editing “${entry.title}”.`;
      form.scrollIntoView({behavior: "smooth", block: "center"});
      form.elements.title.focus();
    });
    actions.append(edit, remove);
    remove.addEventListener("click", async () => {
      if (!await confirmAction("Remove this activity?", `Remove “${entry.title}” from your log?`)) return;
      try {
        await request(`/api/entries/${entry.id}`, {method: "DELETE"});
        await refresh();
      } catch (error) {
        $("#form-message").textContent = error.message;
      }
    });
    row.append(date, main, category, duration, actions);
    container.append(row);
  }
}

function cancelEdit() {
  editingEntryId = null;
  legacyMinutesOnEdit = null;
  durationFieldsChanged = false;
  const form = $("#activity-form");
  form.reset();
  updateDurationPreview();
  form.elements.day.value = state.date;
  form.querySelector(".primary-button").innerHTML = 'Add to my log <span aria-hidden="true">↗</span>';
  $("#cancel-edit").hidden = true;
  $("#form-message").textContent = "Edit cancelled.";
}

async function renderGoals() {
  const payload = await request("/api/goals");
  const container = $("#goal-list");
  container.replaceChildren();
  if (!payload.goals.length) {
    const empty = document.createElement("p");
    empty.className = "empty-inline";
    empty.textContent = "No goals yet. Add one to make suggestions personal.";
    container.append(empty);
    return;
  }
  for (const goal of payload.goals) {
    const card = document.createElement("div");
    card.className = "goal-item";
    const heading = document.createElement("div");
    heading.className = "goal-heading";
    const title = document.createElement("strong");
    title.textContent = escapeText(goal.title);
    const remove = document.createElement("button");
    remove.className = "delete-goal";
    remove.type = "button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Remove priority ${goal.title}`);
    remove.addEventListener("click", async () => {
      if (!await confirmAction("Remove this priority?", `Remove “${goal.title}” from your priorities?`)) return;
      remove.disabled = true;
      try {
        await request(`/api/goals/${goal.id}`, {method: "DELETE"});
        await refresh();
      } catch (error) {
        remove.disabled = false;
        $("#form-message").textContent = error.message;
      }
    });
    heading.append(title, remove);
    const detail = document.createElement("span");
    const summary = state.summary;
    const days = summary ? daysBetween(summary.start, summary.end) : 7;
    const expected = Math.round(goal.target_minutes_week * days / 7);
    const actual = summary ? Object.entries(summary.stats.categories).reduce((total, [category, minutes]) => total + (category.toLowerCase() === goal.category.toLowerCase() ? minutes : 0), 0) : 0;
    const periodName = summary?.period === "day" ? "today" : summary?.period === "month" ? "this month" : summary?.period === "year" ? "this year" : "this week";
    detail.textContent = `${goal.category} · ${formatMinutes(actual)} of ~${formatMinutes(expected)} ${periodName}`;
    const track = document.createElement("div");
    track.className = "goal-track";
    const fill = document.createElement("div");
    fill.className = "goal-fill";
    fill.style.width = `${expected ? Math.min(100, actual / expected * 100) : 0}%`;
    track.append(fill);
    card.append(heading, detail, track);
    container.append(card);
  }
}

document.querySelectorAll(".period-tab").forEach((button) => {
  button.addEventListener("click", () => {
    state.period = button.dataset.period;
    document.querySelectorAll(".period-tab").forEach((tab) => tab.classList.toggle("active", tab === button));
    refresh();
  });
});

$("#review-date").value = state.date;
$("#review-date").addEventListener("change", (event) => {
  state.date = event.target.value || localDateString(new Date());
  refresh();
});

$("#activity-form").elements.day.value = state.date;
$("#activity-form").elements.time.value = `${String(new Date().getHours()).padStart(2, "0")}:${String(new Date().getMinutes()).padStart(2, "0")}`;
for (const field of [$("#activity-form").elements.time, $("#activity-form").elements.end_time]) {
  field.addEventListener("input", () => {
    durationFieldsChanged = true;
    updateDurationPreview();
  });
}
$("#activity-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const payload = Object.fromEntries(data.entries());
  payload.minutes = payload.time && payload.end_time
    ? elapsedMinutes(payload.time, payload.end_time)
    : (!durationFieldsChanged && legacyMinutesOnEdit !== null ? legacyMinutesOnEdit : 0);
  payload.energy = payload.energy ? Number(payload.energy) : null;
  $("#form-message").textContent = "Saving…";
  try {
    await request(editingEntryId ? `/api/entries/${editingEntryId}` : "/api/entries", {method: editingEntryId ? "PUT" : "POST", body: JSON.stringify(payload)});
    const loggedDate = payload.day;
    form.reset();
    editingEntryId = null;
    legacyMinutesOnEdit = null;
    durationFieldsChanged = false;
    updateDurationPreview();
    form.querySelector(".primary-button").innerHTML = 'Add to my log <span aria-hidden="true">↗</span>';
    $("#cancel-edit").hidden = true;
    form.elements.day.value = loggedDate;
    state.date = loggedDate;
    $("#review-date").value = loggedDate;
    $("#form-message").textContent = "Added to your log.";
    await refresh();
  } catch (error) {
    $("#form-message").textContent = error.message;
  }
});

$("#cancel-edit").addEventListener("click", cancelEdit);

$("#goal-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form).entries());
  try {
    const targetDays = Number(payload.target_days);
    const remainingMinutes = clockDurationMinutes(payload.target_clock);
    payload.target_minutes_week = targetDays * 1440 + remainingMinutes;
    if (!Number.isInteger(targetDays) || targetDays < 0 || targetDays > 7 || payload.target_minutes_week < 1 || payload.target_minutes_week > 10080) {
      throw new Error("Choose a weekly target between 15 minutes and 7 full days.");
    }
    delete payload.target_days;
    delete payload.target_clock;
    await request("/api/goals", {method: "POST", body: JSON.stringify(payload)});
    form.reset();
    $("#form-message").textContent = "Priority added. Your summaries will use it as context.";
    await refresh();
  } catch (error) {
    $("#form-message").textContent = error.message;
  }
});

refresh();
setupAreaPickers();
setupStyledSelects();

$("#export-trigger").addEventListener("click", openExportPreview);
$("#export-close").addEventListener("click", () => $("#export-dialog").close());
$("#export-cancel").addEventListener("click", () => $("#export-dialog").close());
$("#export-download").addEventListener("click", async () => {
  if (!exportCardSvgUrl) return;
  const button = $("#export-download");
  const status = $("#export-status");
  button.disabled = true;
  try {
    const image = new Image();
    image.src = exportCardSvgUrl;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext("2d").drawImage(image, 0, 0);
    const png = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!png) throw new Error("The card image is too large to download. Try exporting fewer activities at a time.");
    const downloadUrl = URL.createObjectURL(png);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = `daybook-activity-record-${new Date().toISOString().slice(0, 10)}.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
  } catch (error) {
    status.hidden = false;
    status.textContent = error.message || "The card couldn’t be downloaded. Please try again.";
  } finally {
    button.disabled = false;
  }
});
