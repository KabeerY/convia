export function localParts(value, timezone = "Asia/Kolkata") {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(value))
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
    input: `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`,
  };
}
export function zonedInstant(input, timezone = "Asia/Kolkata") {
  const target = Date.parse(`${input}:00Z`);
  let instant = target;
  for (let i = 0; i < 4; i++) {
    const local = localParts(instant, timezone).input;
    const delta = target - Date.parse(`${local}:00Z`);
    if (!delta) return new Date(instant).toISOString();
    instant += delta;
  }
  throw new Error(
    "That local time does not exist in the trip timezone. Choose a different time.",
  );
}
export const datePlus = (date, days) =>
  new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000)
    .toISOString()
    .slice(0, 10);
export const snapMinutes = (value) =>
  Math.max(0, Math.min(1425, Math.round(value / 15) * 15));
export const timeString = (value) =>
  `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
export const overlaps = (a, b) =>
  Date.parse(a.starts_at) < Date.parse(b.ends_at) &&
  Date.parse(a.ends_at) > Date.parse(b.starts_at);
export function branchOrder(branches, parent = null) {
  return branches
    .filter((b) => b.parent_branch_id === parent)
    .flatMap((b) => [b, ...branchOrder(branches, b.branch_id)]);
}
// Assign concurrent events separate horizontal lanes without changing their times.
export function layoutEvents(events) {
  const sorted = [...events].sort(
    (a, b) => a.top - b.top || b.bottom - a.bottom,
  );
  const groups = [];
  let group = [],
    end = -Infinity;
  for (const event of sorted) {
    if (event.top >= end && group.length) {
      groups.push(group);
      group = [];
      end = -Infinity;
    }
    group.push(event);
    end = Math.max(end, event.bottom);
  }
  if (group.length) groups.push(group);
  return groups.flatMap((group) => {
    const ends = [];
    const placed = group.map((event) => {
      let lane = ends.findIndex((end) => end <= event.top);
      if (lane < 0) lane = ends.length;
      ends[lane] = event.bottom;
      return { ...event, lane };
    });
    return placed.map((event) => ({ ...event, laneCount: ends.length }));
  });
}
