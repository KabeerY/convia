import React from "react";
import { groupPlanItems, itemPlanLabel } from "./lib/itinerary";
import {datePlus} from './lib/calendar';

function dayDate(startDate, dayIndex) {
  const date = new Date(`${String(startDate || "").slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return `Day ${dayIndex}`;
  date.setUTCDate(date.getUTCDate() + dayIndex - 1);
  return new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(date);
}

function itemTime(value, timezone) {
  if (!value) return "Flexible";
  try { return new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: timezone || "Asia/Kolkata" }).format(new Date(value)); }
  catch { return "Flexible"; }
}

export default function PlanDays({ items, trip, timezone, selectedDay, onDayChange }) {
  const allDays = groupPlanItems(items);
  const days = selectedDay ? allDays.filter(d=>datePlus(trip.start_date,d.dayIndex-1)===selectedDay) : allDays;
  if (!allDays.length) return <div className="wm-empty wm-empty-small"><h3>The itinerary starts here.</h3><p>Suggest the first activity and invite your group to decide.</p></div>;
  return <div className="wm-day-list"><div className="cc-day-tabs">{allDays.map(d=><button key={d.dayIndex} className={datePlus(trip.start_date,d.dayIndex-1)===selectedDay?"active":""} onClick={()=>onDayChange?.(datePlus(trip.start_date,d.dayIndex-1))}>{dayDate(trip.start_date,d.dayIndex)}</button>)}</div>{days.map(({ dayIndex, items: dayItems }) => <section className="wm-day-section" key={dayIndex} aria-label={`Day ${dayIndex}`}><div className="wm-day-header"><span className="wm-day-number">DAY {String(dayIndex).padStart(2, "0")}</span><strong>{dayDate(trip.start_date, dayIndex)}</strong><small>{dayItems.length} stop{dayItems.length === 1 ? "" : "s"}</small></div><div className="wm-item-list">{dayItems.map((item, index) => <article className="wm-plan-item" key={item.logical_item_id || item.item_id || index}><div className="wm-time">{itemTime(item.starts_at, timezone)}</div><div><span className="wm-kicker">{item.item_type || "ACTIVITY"}</span><h3>{item.title}</h3><p>{itemPlanLabel(item)}</p></div><span className={`wm-status ${item.decision_locked ? "wm-status-locked" : ""}`}>{item.decision_locked ? "Locked" : item.locked ? "Fixed" : item.status || "Planned"}</span></article>)}</div></section>)}</div>;
}
