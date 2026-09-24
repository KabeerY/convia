export function groupPlanItems(items) {
  const days = new Map();
  for (const item of items) {
    if (item.status === "removed" || item.status === "replaced") continue;
    const dayIndex = Number.isInteger(item.day_index) && item.day_index > 0 ? item.day_index : 1;
    if (!days.has(dayIndex)) days.set(dayIndex, []);
    days.get(dayIndex).push(item);
  }
  return [...days.entries()]
    .sort(([left], [right]) => left - right)
    .map(([dayIndex, dayItems]) => ({
      dayIndex,
      items: dayItems.sort((left, right) =>
        (left.sort_order ?? 999) - (right.sort_order ?? 999) ||
        String(left.starts_at ?? "").localeCompare(String(right.starts_at ?? ""))),
    }));
}

export function itemPlanLabel(item) {
  if (item.decision_locked === true) return "Group-approved · locked";
  if (item.locked === true) return "Fixed booking";
  return item.status || "Planned";
}
