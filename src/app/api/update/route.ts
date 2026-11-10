import { NextResponse } from "next/server";
import { apiFailure, chatJson, failure, limitRequest } from "@/lib/server";
import { TOPICS, QUESTIONS, blankScores, distinctQuestion, isSufficient, ensureListHeadings, omitsNewWeekdayDetail, validDocument, validScores, normalizeText, type DocumentData, type Scores, type Topic } from "@/lib/vacancy";

export const runtime = "nodejs";
export const maxDuration = 120;
import { UPDATE_SYSTEM, REVIEW_SYSTEM } from "@/lib/prompt";

export async function POST(request: Request) {
  const limited = limitRequest(request); if (limited) return limited;
  try {
    if (Number(request.headers.get("content-length") || 0) > 150000) return failure("Текст слишком длинный.", 413);
    const input = await request.json().catch(() => null);
    if (!input || !validDocument(input.document) || typeof input.message !== "string" || input.message.length > 12000 || !Number.isInteger(input.revision) || typeof input.operationId !== "string" || input.operationId.length > 100 || !["update", "analyze"].includes(input.mode) || (input.activeTopic !== null && !TOPICS.includes(input.activeTopic))) return failure("Не удалось обработать данные. Попробуйте ещё раз.", 400);
    if (input.previousQuestion !== undefined && (typeof input.previousQuestion !== "string" || input.previousQuestion.length > 600)) return failure("Не удалось обработать данные. Попробуйте ещё раз.", 400);
    if (input.mode === "update" && !input.message.trim()) return failure("Добавьте ответ.", 400);
    const result = await chatJson(UPDATE_SYSTEM, { document: input.document, message: input.message, activeTopic: input.activeTopic, previousQuestion: input.previousQuestion || "", manuallyEdited: Array.isArray(input.manuallyEdited) ? input.manuallyEdited.slice(0, 100) : [], mode: input.mode });
    if (!result || typeof result !== "object") throw new Error("INVALID_RESPONSE");
    // A role alone contains no evidence for duties or working conditions. Never
    // permit a model to fill those gaps, even if it is confident they are typical.
    const shortInput = input.message.trim();
    const roleMatch = input.mode === "update" && !input.document.title.trim() && input.document.blocks.length === 0
      ? (shortInput.match(/^(?:нужен|нужна|нужно|ищем|ищу|требуется)\s+([\p{L}-]+(?:\s+[\p{L}-]+){0,3})[.!]?$/iu)
        || shortInput.match(/^([\p{L}-]+(?:ник|тель|щик|чик|ист|лог|граф|ёр|ер|атор|ица))[.!]?$/iu)) : null;
    const isOnlyRole = roleMatch && !/(?:^|\s)(?:в|на|от|до|для|из|со|с|и|или)(?:\s|$)/iu.test(roleMatch[1]) && !/(?:удал[её]н|офис|зарплат|опыт|задач|(?:^|\s)работ|проект|уметь|навык|будет|команд)/iu.test(roleMatch[1]) && !/\b[A-Z]{2,}\b/.test(roleMatch[1]);
    if (isOnlyRole) {
      const rawTitle: string = String(roleMatch[1]).trim();
      const suggested = (result as { document?: { title?: unknown } }).document?.title;
      const sourceWords = rawTitle.toLocaleLowerCase("ru").split(/\s+/);
      const candidate = typeof suggested === "string" ? normalizeText(suggested) : "";
      const roleWords = candidate.replace(/^ищем[\s\u00a0]+/iu, "").toLocaleLowerCase("ru").split(/\s+/);
      const grounded = candidate.length > 0 && candidate.length <= 300 && roleWords.every(word => sourceWords.some(source => source.slice(0, Math.min(5, source.length)) === word.slice(0, Math.min(5, source.length))));
      let title = grounded ? candidate : rawTitle[0].toLocaleUpperCase("ru") + rawTitle.slice(1);
      // For an unambiguous single-word Russian occupation, produce a vacancy
      // headline without guessing any extra attributes about the role.
      if (!/^ищем[\s\u00a0]+/iu.test(title) && /^(?:ищем|ищу)\s/iu.test(shortInput)) title = normalizeText(`Ищем ${rawTitle}`);
      if (!/^ищем[\s\u00a0]+/iu.test(title) && /^[а-яё-]+$/iu.test(rawTitle)) {
        const lower = rawTitle.toLocaleLowerCase("ru");
        let accusative = "";
        if (/тель$/u.test(lower)) accusative = lower.slice(0, -1) + "я";
        else if (/ица$/u.test(lower)) accusative = lower.slice(0, -1) + "у";
        else if (/(?:ник|щик|чик|ист|лог|граф|ёр|ер|атор)$/u.test(lower)) accusative = lower + "а";
        if (accusative) title = normalizeText(`Ищем ${accusative}`);
      }
      return NextResponse.json({ document: { title, blocks: [] }, scores: blankScores(), activeTopic: "tasks", question: QUESTIONS.tasks, changedBlockIds: [], revision: input.revision, operationId: input.operationId });
    }
    const reviewed = await chatJson(REVIEW_SYSTEM, { originalDocument: input.document, message: input.message, activeTopic: input.activeTopic, previousQuestion: input.previousQuestion || "", mode: input.mode, candidate: result });
    if (!reviewed || typeof reviewed !== "object") throw new Error("INVALID_RESPONSE");
    const data = reviewed as { document: DocumentData; scores: Scores; activeTopic: Topic | null; question: string; changedBlockIds: string[] };
    if (!validDocument(data.document) || !validScores(data.scores) || (data.activeTopic !== null && !TOPICS.includes(data.activeTopic)) || typeof data.question !== "string" || data.question.length > 600 || !Array.isArray(data.changedBlockIds) || !data.changedBlockIds.every(id => typeof id === "string")) throw new Error("INVALID_RESPONSE");
    const priorTexts = new Map(input.document.blocks.map((b: {id: string; text: string}) => [b.id, b.text]));
    const manualIds = new Set(Array.isArray(input.manuallyEdited) ? input.manuallyEdited.filter((id: unknown): id is string => typeof id === "string") : []);
    const generated = { title: manualIds.has("title") && data.document.title === input.document.title ? input.document.title : normalizeText(data.document.title), blocks: data.document.blocks.map(b => ({...b, text: manualIds.has(b.id) && priorTexts.get(b.id) === b.text ? b.text : normalizeText(b.text)})).filter(b => b.text.trim()) };
    const document: DocumentData = input.mode === "analyze" ? input.document : ensureListHeadings(generated);
    if (!document.title.trim() && !document.blocks.some((b: { text: string }) => b.text.trim())) throw new Error("INVALID_RESPONSE");
    if (input.mode === "update" && omitsNewWeekdayDetail(input.message, document)) return failure("Не удалось учесть все детали ответа. Попробуйте ещё раз.", 422);
    const remaining = TOPICS.filter(t => !isSufficient(data.scores[t]));
    // A manual topic stays selected until it is covered. A direct request to change
    // the subject can override it; ordinary facts about other topics cannot.
    const explicitSwitch = /(?:давай|хочу|поговорим|перейд[её]м|обсудим).{0,40}(?:тем[аеуы]|навык|проект|задач|после полугода)/i.test(input.message);
    const activeTopic: Topic | null = remaining.length === 0 ? null : (!explicitSwitch && input.activeTopic && remaining.includes(input.activeTopic) ? input.activeTopic : (data.activeTopic && remaining.includes(data.activeTopic) ? data.activeTopic : remaining[0]));
    const mismatch = activeTopic === "skills" && /проект|полгода|6 месяцев/i.test(data.question) && !/навык|уметь|инструмент/i.test(data.question);
    const questionCandidate = !activeTopic ? "Основное обсудили. Можете дополнить вакансию или забрать её" : (!data.question.trim() || /основное обсудили/i.test(data.question) || data.activeTopic !== activeTopic || mismatch ? QUESTIONS[activeTopic] : normalizeText(data.question));
    const question = activeTopic && input.mode === "update" ? distinctQuestion(questionCandidate, input.previousQuestion || "", activeTopic) : questionCandidate;
    const oldBlocks = new Map(input.document.blocks.map((b: {id: string; type: string; text: string}) => [b.id, JSON.stringify([b.type,b.text])]));
    const changedBlockIds = document.blocks.filter((b: {id: string; type: string; text: string}) => oldBlocks.get(b.id) !== JSON.stringify([b.type,b.text])).map((b: {id: string}) => b.id);

    return NextResponse.json({ document, scores: data.scores, activeTopic, question, changedBlockIds, revision: input.revision, operationId: input.operationId });
  } catch (error) { return apiFailure(error, "Не удалось обработать ответ. Попробуйте ещё раз."); }
}
