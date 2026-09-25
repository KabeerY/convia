import { z } from "zod";

export const trippySuggestionSchema = z.object({
  message: z.string().max(500),
  action: z.enum(["none", "add", "move", "fork"]),
  title: z.string().max(200).optional(),
  source_item_id: z.string().max(128).optional(),
  item_type: z
    .enum([
      "poi",
      "meal",
      "guide",
      "free",
      "transfer",
      "hotel",
      "flight",
      "package",
    ])
    .optional(),
  day_index: z.number().int().positive().optional(),
  starts_at: z.iso.datetime({ offset: true }).optional(),
  ends_at: z.iso.datetime({ offset: true }).optional(),
  rejoin_at: z.iso.datetime({ offset: true }).optional(),
  rejoin_note: z.string().max(160).optional(),
});
export type TrippySuggestion = z.infer<typeof trippySuggestionSchema>;

export type TrippyChatMessage = {
  role: "user" | "assistant";
  content: string;
  sender_name?: string;
};

export type TrippyServiceAnswer = {
  answer: string;
  change_set_id?: string | null;
};

export function trippyServiceConfigured() {
  const url = process.env.TRIPPY_SERVICE_URL || "";
  const token = process.env.TRIPPY_SERVICE_TOKEN || "";
  return (
    url.startsWith("https://") &&
    token.length >= 20 &&
    !token.startsWith("replace-")
  );
}

export async function askTrippyService(
  query: string,
  context: TrippyChatMessage[],
  tripId: string,
  userId: string,
): Promise<TrippyServiceAnswer> {
  const serviceUrl = process.env.TRIPPY_SERVICE_URL || "";
  const serviceToken = process.env.TRIPPY_SERVICE_TOKEN || "";
  if (!trippyServiceConfigured()) throw new Error("TRIPPY_NOT_CONFIGURED");
  const response = await fetch(`${serviceUrl.replace(/\/$/, "")}/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Trippy-Service-Token": serviceToken,
    },
    body: JSON.stringify({
      query,
      context: context.slice(-15),
      trip_id: tripId,
      user_id: userId,
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`TRIPPY_SERVICE_${response.status}`);
  const payload = z
    .object({
      answer: z.string().trim().min(1),
      change_set_id: z.string().nullable().optional(),
    })
    .parse(await response.json());
  return {
    answer: payload.answer.slice(0, 1000),
    ...(payload.change_set_id ? { change_set_id: payload.change_set_id } : {}),
  };
}

export function trippyConfigured() {
  const key = process.env.GEMINI_API_KEY || "";
  return key.length >= 20 && !/replace|example|paste|your[-_]?key/i.test(key);
}

export async function askTrippy(
  request: string,
  context: unknown,
): Promise<TrippySuggestion> {
  const key = process.env.GEMINI_API_KEY;
  if (!trippyConfigured() || !key) throw new Error("TRIPPY_NOT_CONFIGURED");
  const configuredModel = process.env.GEMINI_TEXT_MODEL;
  const model =
    configuredModel && !/replace|verified/i.test(configuredModel)
      ? configuredModel
      : "gemini-2.5-flash-lite";
  if (!/^[a-zA-Z0-9._-]+$/.test(model)) throw new Error("TRIPPY_MODEL_INVALID");
  const prompt = [
    "You are Trippy, a careful group-trip planning assistant. Return ONLY a JSON object.",
    "Allowed action: none, add, move, fork. You may propose one bounded itinerary change, never vote or commit.",
    "Use only source_item_id values from the supplied current itinerary. New activities must be inside the trip dates.",
    "All starts_at, ends_at and rejoin_at values must be ISO 8601 timestamps with an explicit offset.",
    "For add: title, item_type, day_index, starts_at, ends_at. For move: source_item_id, day_index, starts_at, ends_at.",
    "For fork: source_item_id, title, item_type, day_index, starts_at, ends_at, rejoin_at, rejoin_note.",
    "If the request is unclear or unsafe, action=none and ask one short clarifying question in message.",
    `Current authorised trip context: ${JSON.stringify(context)}`,
    `Member request: ${request}`,
  ].join("\n");
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.2,
        },
      }),
      signal: AbortSignal.timeout(18000),
    },
  );
  if (!response.ok) throw new Error(`TRIPPY_PROVIDER_${response.status}`);
  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const raw = data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("");
  if (!raw) throw new Error("TRIPPY_EMPTY_RESPONSE");
  return trippySuggestionSchema.parse(JSON.parse(raw));
}
