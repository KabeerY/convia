export type Profile = {
  interests?: string[];
  pace?: string | null;
  budget_band?: string | null;
};
export type GenomeInput = {
  profile?: Profile;
  member_passports?: Profile[];
  member_count?: number;
};
const pace = ["relaxed", "balanced", "active"];
const budget = ["shoestring", "value", "mid", "premium", "luxury"];

export function matchProfile(passport: Profile = {}, group: Profile = {}) {
  let score = 0;
  let coverage = 0;
  const reasons: string[] = [];
  const interests = new Set(
    (passport.interests || []).map((value) => value.toLowerCase()),
  );
  const groupInterests = (group.interests || []).map((value) =>
    value.toLowerCase(),
  );
  if (interests.size && groupInterests.length) {
    coverage += 0.5;
    const shared = groupInterests.filter((value) => interests.has(value));
    score +=
      0.5 * ((2 * shared.length) / (interests.size + groupInterests.length));
    if (shared.length)
      reasons.push(`Both into ${shared.slice(0, 2).join(" and ")}`);
  }
  const paceA = pace.indexOf(passport.pace || ""),
    paceB = pace.indexOf(group.pace || "");
  if (paceA >= 0 && paceB >= 0) {
    coverage += 0.25;
    score += 0.25 * Math.max(0, 1 - Math.abs(paceA - paceB) * 0.5);
    if (paceA === paceB) reasons.push(`A shared ${passport.pace} pace`);
    else reasons.push("A pace difference to discuss");
  }
  const budgetA = budget.indexOf(passport.budget_band || ""),
    budgetB = budget.indexOf(group.budget_band || "");
  if (budgetA >= 0 && budgetB >= 0) {
    coverage += 0.25;
    score += 0.25 * Math.max(0, 1 - Math.abs(budgetA - budgetB) * 0.4);
    if (budgetA === budgetB) reasons.push("Similar spending comfort");
    else reasons.push("Check the group’s budget expectations");
  }
  return {
    match_score: coverage > 0 ? Number((score / coverage).toFixed(3)) : null,
    coverage: Number(coverage.toFixed(2)),
    match_reasons: reasons,
  };
}

export function groupGenome(input: GenomeInput = {}) {
  const profile = input.profile || {};
  const passports = input.member_passports || [];
  const anchors = new Map<string, number>();
  for (const member of passports)
    for (const interest of member.interests || [])
      anchors.set(interest, (anchors.get(interest) || 0) + 1);
  const memberAnchors = [...anchors.entries()]
    .filter(
      ([, count]) => count >= Math.max(2, Math.ceil(passports.length / 2)),
    )
    .map(([name]) => name);
  const shared_anchors = [
    ...new Set([...memberAnchors, ...(profile.interests || [])]),
  ].slice(0, 4);
  const tensions: string[] = [];
  if (new Set(passports.map((person) => person.pace).filter(Boolean)).size > 1)
    tensions.push("Pace");
  if (
    new Set(passports.map((person) => person.budget_band).filter(Boolean))
      .size > 1
  )
    tensions.push("Budget");
  const unknown: string[] = [];
  if (passports.length < (input.member_count || 0))
    unknown.push("Some member Passports");
  if (!profile.pace && !passports.some((person) => person.pace))
    unknown.push("Group pace");
  if (!profile.budget_band && !passports.some((person) => person.budget_band))
    unknown.push("Budget comfort");
  return {
    shared_anchors,
    tensions,
    unknown,
    evidence: {
      confirmed_members: passports.length,
      member_count: input.member_count || 0,
      trip_self_description: Boolean(profile.interests?.length),
    },
  };
}
