export const travelContextPrompt = `I am creating a travel Passport in Convia. Based ONLY on travel preferences I have clearly expressed in this chat, return exactly one JSON object with this shape:
{"interests":[],"pace":null,"budget_band":null}

Allowed interests: Adventure, Culture, Food, Nature, Wellness, Photography, History, Nightlife.
Allowed pace: relaxed, balanced, active.
Allowed budget_band: shoestring, value, mid, premium, luxury.

Use only those exact labels. If a preference is not clearly supported, leave interests empty or use null. Do not infer budget from my job, location, identity or lifestyle. Do not include my name, personal details, quotes, messages, explanations or chat history. Return JSON only, with no Markdown.`;

const allowedInterests = new Map(
  ["Adventure", "Culture", "Food", "Nature", "Wellness", "Photography", "History", "Nightlife"]
    .map((label) => [label.toLowerCase(), label]),
);
const allowedPaces = new Set(["relaxed", "balanced", "active"]);
const allowedBudgets = new Set(["shoestring", "value", "mid", "premium", "luxury"]);

export function parseTravelContext(text) {
  const source = text.trim();
  if (!source || source.length > 12000) throw new Error("Paste a travel-only JSON answer under 12,000 characters.");
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(source);
  let value;
  try { value = JSON.parse(match ? match[1] : source); }
  catch { throw new Error("This is not valid JSON. Ask your AI to return only the JSON object shown in the prompt."); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("The answer must be one JSON object.");
  const rawInterests = value.interests;
  const interests = Array.isArray(rawInterests)
    ? [...new Set(rawInterests.filter((item) => typeof item === "string").map((item) => allowedInterests.get(item.trim().toLowerCase())).filter(Boolean))]
    : [];
  const pace = typeof value.pace === "string" && allowedPaces.has(value.pace.trim().toLowerCase()) ? value.pace.trim().toLowerCase() : "";
  const budgetBand = typeof value.budget_band === "string" && allowedBudgets.has(value.budget_band.trim().toLowerCase()) ? value.budget_band.trim().toLowerCase() : "";
  if (!interests.length && !pace && !budgetBand) throw new Error("No supported travel preferences were found. You can fill your Passport manually instead.");
  return { interests, pace, budget_band: budgetBand };
}
