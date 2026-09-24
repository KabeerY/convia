import React, { useState } from "react";

const hours = [8, 10, 12, 14, 16, 18, 20];
const localHour = (value, timezone) => {
  if (!value) return 10;
  try {
    return Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: timezone || "Asia/Kolkata" }).format(new Date(value)));
  } catch { return 10; }
};
const timeLabel = (value, timezone) => value ? new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: timezone || "Asia/Kolkata" }).format(new Date(value)) : "Flexible";
const tripDate = (start, day) => {
  const value = new Date(`${start}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + day - 1);
  return value.toISOString().slice(0, 10);
};
const at = (date, hour, timezone) => {
  const [year, month, day] = date.split("-").map(Number);
  const target = Date.UTC(year, month - 1, day, hour);
  const formatter = new Intl.DateTimeFormat("en-GB", { timeZone: timezone || "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  let instant = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map((part) => [part.type, Number(part.value)]));
    instant += target - Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  }
  return new Date(instant).toISOString();
};
const displayDate = (date) => new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));

export default function PlanCalendar({ trip, items, forks = [], timezone, version, busy, onMove, onFork }) {
  const [pending, setPending] = useState(null);
  const [alternative, setAlternative] = useState("");
  const [rejoinNote, setRejoinNote] = useState("Meet back at the café");
  const count = Math.max(1, Math.round((Date.parse(trip.end_date) - Date.parse(trip.start_date)) / 86400000) + 1);
  const days = Array.from({ length: count }, (_, index) => ({ index: index + 1, date: tripDate(trip.start_date, index + 1) }));
  const visible = items.filter((item) => item.status !== "removed" && item.status !== "replaced");
  const branchByItem = new Map(forks.flatMap((fork) => [[fork.source_item_id, "PATH A"], [fork.alternative_item_id, "PATH B"]]));

  function beginMove(item, day, hour) {
    if (!item?.item_id) return;
    if (item.day_index === day && localHour(item.starts_at, timezone) === hour) return;
    setPending({ kind: "move", item, day, hour });
  }

  async function confirm(event) {
    event.preventDefault();
    if (!pending) return;
    const date = tripDate(trip.start_date, pending.day);
    const start = at(date, pending.hour, timezone);
    const duration = Math.max(30, (Date.parse(pending.item.ends_at) - Date.parse(pending.item.starts_at)) / 60000 || 60);
    if (pending.kind === "move") {
      const success = await onMove({ source_item_id: pending.item.item_id, base_itinerary_version: version, day_index: pending.day, starts_at: start, ends_at: new Date(Date.parse(start) + duration * 60000).toISOString() });
      if (success) setPending(null);
      return;
    }
    const sourceStart = pending.item.starts_at || start;
    const sourceEnd = pending.item.ends_at || new Date(Date.parse(sourceStart) + 3600000).toISOString();
    const reunion = new Date(Date.parse(sourceEnd) + 3600000).toISOString();
    const success = await onFork({ source_item_id: pending.item.item_id, base_itinerary_version: version, alternative: { title: alternative.trim(), item_type: "poi", day_index: pending.item.day_index, starts_at: sourceStart, ends_at: sourceEnd }, rejoin_at: reunion, rejoin_note: rejoinNote.trim() });
    if (success) { setPending(null); setAlternative(""); }
  }

  return <div className="wm-calendar-wrap">
    <div className="wm-calendar-guide"><span>Drag an activity to a different time to propose a move.</span><span>Every change goes through your group’s vote.</span></div>
    <div className="wm-calendar-scroll"><div className="wm-calendar" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(225px, 1fr))` }}>
      {days.map(({ index, date }) => <section className="wm-calendar-day" key={index} aria-label={`Day ${index}, ${displayDate(date)}`}>
        <header><span className="wm-kicker">DAY {String(index).padStart(2, "0")}</span><strong>{displayDate(date)}</strong><small>{visible.filter((item) => item.day_index === index).length} plans</small></header>
        {hours.map((hour) => <div className="wm-calendar-slot" key={hour} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const item = visible.find((entry) => entry.item_id === event.dataTransfer.getData("text/plain")); beginMove(item, index, hour); }}>
          <span className="wm-calendar-hour">{String(hour).padStart(2, "0")}:00</span>
          <div className="wm-calendar-slot-content">{visible.filter((item) => item.day_index === index && Math.max(8, Math.min(20, Math.floor(localHour(item.starts_at, timezone) / 2) * 2)) === hour).map((item) => <article className={`wm-calendar-item${item.decision_locked ? " is-locked" : ""}${branchByItem.has(item.item_id) ? " is-branch" : ""}`} key={item.item_id} draggable onDragStart={(event) => event.dataTransfer.setData("text/plain", item.item_id)}>
            <div className="wm-calendar-item-top"><span>{branchByItem.get(item.item_id) || item.item_type || "ACTIVITY"}</span><span>{item.decision_locked ? "● Locked" : "⋮⋮"}</span></div>
            <strong>{item.title}</strong><small>{timeLabel(item.starts_at, timezone)} – {timeLabel(item.ends_at, timezone)}</small>
            <button type="button" onClick={() => { setAlternative(""); setPending({ kind: "fork", item, day: index, hour }); }}>Fork this moment ↗</button>
          </article>)}</div>
        </div>)}
        {forks.filter((fork) => fork.day_index === index).map((fork) => <div className="wm-calendar-rejoin" key={fork.fork_id}><span>↘ REJOIN</span><strong>{fork.rejoin_note || "Together again"}</strong><small>{timeLabel(fork.rejoin_at, timezone)}</small></div>)}
      </section>)}
    </div></div>
    {pending && <div className="wm-calendar-dialog-backdrop" role="presentation" onClick={() => setPending(null)}><form className="wm-panel wm-calendar-dialog wm-form" onSubmit={confirm} onClick={(event) => event.stopPropagation()}>
      <div className="wm-panel-title"><div><span className="wm-kicker">A CHANGE FOR THE GROUP</span><h2>{pending.kind === "move" ? "Move this moment?" : "Take two paths?"}</h2></div><button type="button" className="wm-icon-button" onClick={() => setPending(null)} aria-label="Close">×</button></div>
      <p>{pending.kind === "move" ? `Move “${pending.item.title}” to Day ${pending.day} at ${String(pending.hour).padStart(2, "0")}:00. The group must approve it first.` : `Keep “${pending.item.title}” as Path A and offer an alternative Path B, then reunite the group.`}</p>
      {pending.kind === "fork" && <><label>Path B activity<input value={alternative} onChange={(event) => setAlternative(event.target.value)} placeholder="Slow café and market walk" required maxLength={200} /></label><label>Where to meet again<input value={rejoinNote} onChange={(event) => setRejoinNote(event.target.value)} maxLength={160} /></label></>}
      <button className="wm-primary" disabled={busy || !Number.isInteger(version)}>{busy ? "Sending…" : "Send to group vote →"}</button>
    </form></div>}
  </div>;
}
