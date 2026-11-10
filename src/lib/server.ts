import { NextResponse } from "next/server";

export function failure(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

// A per-instance safeguard for the demo. A distributed limit is required for a public production service.
const requests = new Map<string, { count: number; expires: number }>();
export function limitRequest(request: Request): Response | null {
  const now = Date.now();
  if (requests.size > 1000) for (const [key, value] of requests) if (value.expires <= now) requests.delete(key);
  const ip = (request.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
  const current = requests.get(ip);
  if (!current || current.expires <= now) { requests.set(ip, { count: 1, expires: now + 600_000 }); return null; }
  if (current.count >= 40) return failure("Слишком много запросов. Подождите немного и попробуйте снова.", 429);
  current.count++;
  return null;
}

export async function chatJson(system: string, input: unknown): Promise<unknown> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("NOT_CONFIGURED");
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_TEXT_MODEL || "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: system }, { role: "user", content: JSON.stringify(input) }],
      temperature: 0.2
    }),
    signal: AbortSignal.timeout(45000)
  });
  if (!response.ok) throw new Error("PROVIDER_ERROR");
  const body = await response.json();
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("INVALID_RESPONSE");
  return JSON.parse(content);
}

export function apiFailure(error: unknown, fallback: string) {
  return error instanceof Error && error.message === "NOT_CONFIGURED"
    ? failure("Сервис пока не настроен. Попробуйте позже.", 503)
    : failure(fallback, 502);
}
