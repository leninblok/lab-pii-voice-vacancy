import { NextResponse } from "next/server";
import { failure, limitRequest } from "@/lib/server";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  const limited = limitRequest(request); if (limited) return limited;
  if (!process.env.OPENAI_API_KEY) return failure("Сервис распознавания пока не настроен.", 503);
  try {
    const length = Number(request.headers.get("content-length") || 0);
    if (length > 4_000_000) return failure("Запись слишком большая. Попробуйте ответить короче.", 413);
    const incoming = await request.formData();
    const file = incoming.get("audio");
    if (!(file instanceof File) || file.size === 0) return failure("Запись пуста. Попробуйте ещё раз.", 400);
    if (file.size > 3_800_000) return failure("Запись слишком большая. Попробуйте ответить короче.", 413);
    const form = new FormData();
    form.set("file", file, file.name || "recording.webm");
    form.set("model", "whisper-1");
    form.set("language", "ru");
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: form,
      signal: AbortSignal.timeout(60000)
    });
    if (!response.ok) return failure("Не удалось распознать запись. Повторите или введите ответ текстом.", 502);
    const data = await response.json();
    if (typeof data.text !== "string" || !data.text.trim()) return failure("Не удалось разобрать речь. Повторите или введите ответ текстом.", 422);
    return NextResponse.json({ text: data.text.trim() });
  } catch {
    return failure("Не удалось обработать запись. Попробуйте ещё раз.", 502);
  }
}
