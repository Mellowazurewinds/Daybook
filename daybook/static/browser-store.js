/* Browser-only storage used by the public Cloudflare demo. Data never leaves this browser. */
(() => {
  const key = "daybook-demo-v1";
  const read = () => {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "{}");
      return {activities: Array.isArray(value.activities) ? value.activities : [], goals: Array.isArray(value.goals) ? value.goals : [], nextActivityId: value.nextActivityId || 1, nextGoalId: value.nextGoalId || 1};
    } catch { return {activities: [], goals: [], nextActivityId: 1, nextGoalId: 1}; }
  };
  const save = (data) => localStorage.setItem(key, JSON.stringify(data));
  const today = () => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  };
  const bounds = (period, selected) => {
    const d = new Date(`${selected}T12:00:00`);
    let start, end;
    if (period === "day") start = end = new Date(d);
    else if (period === "week") { start = new Date(d); start.setDate(d.getDate() - ((d.getDay() + 6) % 7)); end = new Date(start); end.setDate(start.getDate() + 6); }
    else if (period === "month") { start = new Date(d.getFullYear(), d.getMonth(), 1); end = new Date(d.getFullYear(), d.getMonth() + 1, 0); }
    else if (period === "year") { start = new Date(d.getFullYear(), 0, 1); end = new Date(d.getFullYear(), 11, 31); }
    else throw Error("Choose day, week, month, or year.");
    const iso = (value) => value.toISOString().slice(0, 10);
    const previousStart = new Date(start), previousEnd = new Date(end);
    if (period === "day") previousStart.setDate(start.getDate() - 1), previousEnd.setDate(end.getDate() - 1);
    else if (period === "week") previousStart.setDate(start.getDate() - 7), previousEnd.setDate(end.getDate() - 7);
    else if (period === "month") { previousStart.setMonth(start.getMonth() - 1); previousEnd.setDate(0); previousStart.setDate(1); }
    else previousStart.setFullYear(start.getFullYear() - 1), previousEnd.setFullYear(end.getFullYear() - 1);
    return {start: iso(start), end: iso(end), previousStart: iso(previousStart), previousEnd: iso(previousEnd)};
  };
  const stats = (entries) => {
    const categories = {}, days = new Set(), outcomes = {completed: 0, progress: 0, ongoing: 0, rest: 0}, energy = [];
    for (const row of entries) { categories[row.category] = (categories[row.category] || 0) + Number(row.minutes); days.add(row.day); outcomes[row.outcome || "progress"]++; if (row.energy != null) energy.push(Number(row.energy)); }
    return {activities: entries.length, minutes: entries.reduce((n, row) => n + Number(row.minutes), 0), active_days: days.size, ...outcomes, categories: Object.fromEntries(Object.entries(categories).sort((a,b) => b[1]-a[1])), average_energy: energy.length ? Math.round(energy.reduce((a,b)=>a+b,0)/energy.length*10)/10 : null};
  };
  const duration = (mins) => { const h = Math.floor(mins/60), m = mins%60; return h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`; };
  function summary(period, selected, rows, goals) {
    const b = bounds(period, selected), current = rows.filter(r => r.day >= b.start && r.day <= b.end), previous = rows.filter(r => r.day >= b.previousStart && r.day <= b.previousEnd);
    const s = stats(current), p = stats(previous), label = {day:"Daily",week:"Weekly",month:"Monthly",year:"Yearly"}[period], suggestions = [];
    const enough = s.active_days >= (period === "day" ? 1 : 3) && s.activities >= (period === "day" ? 1 : 5);
    let conclusion;
    if (!current.length) { conclusion = "No activities are logged for this period, so there is not enough evidence to conclude how it went. That does not mean you did nothing."; suggestions.push({title:"Start with a quick log",reason:"A short note about one thing you did is enough to begin building a reliable history."}); }
    else {
      const [top, topMinutes] = Object.entries(s.categories)[0], share = s.minutes ? Math.round(topMinutes/s.minutes*100) : 0;
      conclusion = period === "day" ? `You logged ${s.activities} ${s.activities===1?"activity":"activities"} across ${Object.keys(s.categories).length} ${Object.keys(s.categories).length===1?"area":"areas"} for ${duration(s.minutes)}. You marked ${s.completed} completed and ${s.progress} as progress made. ${top} was your largest logged area (${duration(topMinutes)}).` : `You logged ${s.activities} activities across ${s.active_days} days, totaling ${duration(s.minutes)}. You marked ${s.completed} completed and ${s.progress} as progress made. ${top} took the largest share of tracked time (${share}%).`;
      if (period === "week" && s.active_days < 5) conclusion += ` Your log covers ${s.active_days} of 7 days; unlogged days are unknown, not assumed to be inactive.`;
      if (s.average_energy !== null) conclusion += ` Average self-rated energy was ${s.average_energy}/5.`;
      if (s.rest) conclusion += ` You also recorded ${s.rest} rest or reset ${s.rest===1?"activity":"activities"}.`;
      if (previous.length) { const delta=s.minutes-p.minutes, change=delta>0?`${duration(delta)} more`:delta<0?`${duration(-delta)} less`:"the same amount"; conclusion += ` Compared with the previous ${period}, you logged ${change} time.`; }
      if (!enough && period !== "day") suggestions.push({title:"Build a little more history",reason:"This period has fewer than five entries or three logged days, so broader patterns may be misleading."});
      if (s.minutes > 0 && share >= 65) suggestions.push({title:`Check whether ${top} had the balance you wanted`,reason:`It accounts for ${share}% of the time you logged. If another priority matters this period, consider reserving a small block for it.`});
      if (goals.length) for (const goal of goals) { const actual=Object.entries(s.categories).filter(([c])=>c.toLowerCase()===goal.category.toLowerCase()).reduce((n,[,v])=>n+v,0), expected=Math.floor(Number(goal.target_minutes_week)*((new Date(`${b.end}T12:00:00`)-new Date(`${b.start}T12:00:00`))/86400000+1)/7); if(actual<expected*.6) suggestions.push({title:`Make room for ${goal.title}`,reason:`Your goal is ${goal.target_minutes_week} min/week in ${goal.category}; this period shows ${actual} min logged versus roughly ${expected} min at that pace.`}); else if(actual>=expected) suggestions.push({title:`You made room for ${goal.title}`,reason:`You logged ${actual} min in ${goal.category}, meeting or exceeding the period-scaled target of about ${expected} min.`}); }
      if (!suggestions.length) suggestions.push({title:"Keep logging what matters",reason:"No clear gap stands out from the evidence in this period. Keep tracking your chosen priorities to make future comparisons more useful."});
    }
    return {period,label,start:b.start,end:b.end,previous_start:b.previousStart,previous_end:b.previousEnd,stats:s,previous_stats:p,conclusion,suggestions:suggestions.slice(0,5),highlights:(period==="day"?current:current.slice(0,8)).map(r=>({title:r.title,category:r.category,day:r.day,time:r.time,minutes:Number(r.minutes),notes:r.notes,outcome:r.outcome||"progress"})),enough_pattern_data:enough};
  }
  function validateActivity(row) {
    const title=String(row.title||"").trim(), category=String(row.category||"").trim(), notes=String(row.notes||"").trim(), day=String(row.day||today()), start=String(row.time||""), end=String(row.end_time||"");
    if(!title||title.length>120) throw Error("Activity name is required and must be 120 characters or fewer.");
    if(!category||category.length>40) throw Error("Choose a category up to 40 characters long.");
    if(notes.length>2000) throw Error("Notes must be 2,000 characters or fewer.");
    if(!/^\d{4}-\d\d-\d\d$/.test(day)||Number.isNaN(Date.parse(day))) throw Error("Enter a valid date.");
    if(start&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(start)||end&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(end)) throw Error("Enter a valid time.");
    const outcome=String(row.outcome||"progress"); if(!["completed","progress","ongoing","rest"].includes(outcome)) throw Error("Choose a valid activity outcome.");
    if(end&&!start) throw Error("Add a start time before setting an end time.");
    let minutes=Number(row.minutes||0); if(end){const a=start.split(":").map(Number),z=end.split(":").map(Number);minutes=z[0]*60+z[1]-a[0]*60-a[1];if(minutes<0)minutes+=1440;}
    if(!Number.isInteger(minutes)||minutes<0||minutes>1440) throw Error("Duration must be between 0 and 1,440 minutes.");
    const energy=row.energy===""||row.energy==null?null:Number(row.energy);if(energy!==null&&(!Number.isInteger(energy)||energy<1||energy>5))throw Error("Energy rating must be between 1 and 5.");
    return {...row,title,category,notes,day,time:start,end_time:end,minutes,outcome,energy};
  }
  const fail = (message) => { throw Error(message); };
  window.daybookBrowserApi = {async request(url, options={}) {
    const data=read(), method=options.method||"GET", parsed=new URL(url,location.href), path=parsed.pathname, body=options.body?JSON.parse(options.body):{};
    if(method==="GET"&&path==="/api/summary") return summary(parsed.searchParams.get("period")||"day",parsed.searchParams.get("date")||today(),data.activities,data.goals);
    if(method==="GET"&&path==="/api/entries") { const from=parsed.searchParams.get("from")||today().slice(0,7)+"-01",to=parsed.searchParams.get("to")||today(); return {entries:data.activities.filter(r=>r.day>=from&&r.day<=to).sort((a,b)=>b.day.localeCompare(a.day)||b.time.localeCompare(a.time)||b.id-a.id)}; }
    if(method==="GET"&&path==="/api/goals") return {goals:data.goals};
    if(method==="GET"&&path==="/api/export") return {format_version:1,exported_on:today(),activities:data.activities,goals:data.goals};
    let match=path.match(/^\/api\/(entries|goals)\/(\d+)$/);
    if(method==="DELETE"&&match) { const rows=match[1]==="entries"?data.activities:data.goals, i=rows.findIndex(r=>r.id===Number(match[2])); if(i<0)return fail("Item not found."); rows.splice(i,1);save(data);return {deleted:true}; }
    if(method==="PUT"&&(match=path.match(/^\/api\/entries\/(\d+)$/))) { const i=data.activities.findIndex(r=>r.id===Number(match[1]));if(i<0)return fail("Activity not found.");data.activities[i]={...validateActivity(body),id:Number(match[1])};save(data);return {entry:data.activities[i]}; }
    if(method==="POST"&&path==="/api/entries") { const entry={...validateActivity(body),id:data.nextActivityId++};data.activities.push(entry);save(data);return {entry}; }
    if(method==="POST"&&path==="/api/goals") { const title=String(body.title||"").trim(),category=String(body.category||"").trim(),target=Number(body.target_minutes_week);if(!title||title.length>100) return fail("Goal name is required and must be 100 characters or fewer.");if(!category||category.length>40)return fail("Goal category is required and must be 40 characters or fewer.");if(!Number.isInteger(target)||target<1||target>10080)return fail("Weekly target must be between 1 and 10,080 minutes.");const goal={id:data.nextGoalId++,title,category,target_minutes_week:target};data.goals.unshift(goal);save(data);return {goal}; }
    return fail("Not found.");
  }};
})();
