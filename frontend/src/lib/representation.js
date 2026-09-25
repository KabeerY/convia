export function genderRepresentationLabel(rep) {
  if (!rep || typeof rep.active_traveller_count !== "number") return null;
  const travellers = rep.active_traveller_count;
  const women = rep.women_public_count ?? 0;
  if (travellers === 0) return "Women — not enough traveller data yet";
  const pct = rep.women_public_percentage;
  const pctText = typeof pct === "number" && Number.isFinite(pct) ? `${Math.round(pct)}%` : "—";
  return `${women} of ${travellers} travellers publicly self-describe as women — ${pctText}`;
}

export function pendingLabel(rep) {
  if (!rep || typeof rep.pending_request_count !== "number" || rep.pending_request_count === 0) return null;
  const n = rep.pending_request_count;
  return `${n} pending ${n === 1 ? "request" : "requests"}`;
}
