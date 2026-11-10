export const TOPICS = ["tasks", "project", "future", "skills"] as const;
export type Topic = typeof TOPICS[number];
export const LABELS: Record<Topic, string> = { tasks: "Задачи", project: "Проект", future: "Дальше", skills: "Навыки" };
export const QUESTIONS: Record<Topic, string> = { tasks: "Что человек будет делать каждый день?", project: "Над чем он будет работать в ближайшие полгода?", future: "А после этих шести месяцев что изменится?", skills: "Что человек должен уметь, чтобы справляться с этой работой?" };
/** Avoid repeating an unchanged question after the user has answered it. */
export function distinctQuestion(question: string, previous: string, topic: Topic): string {
  const key = (text: string) => text.toLocaleLowerCase("ru").replace(/ё/g, "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  if (!previous.trim()) return question;
  const normalized = key(question); const prior = key(previous);
  const genericProjectQuestion = (text: string) => /(?:полгод|полугод|шест.{0,4} месяц|6 месяц|ближайш)/u.test(text) && /(?:проект|работ|план|чем)/u.test(text);
  // Equivalent generic "what project over six months" questions tend to vary
  // only in wording. A question asking for a concrete result is a refinement.
  const sameGeneralProject = topic === "project" && genericProjectQuestion(normalized) && genericProjectQuestion(prior) && !/(?:результат|итог|цель|критери|конкрет)/u.test(normalized);
  if (normalized !== prior && !sameGeneralProject) return question;
  const alternatives: Record<Topic, string[]> = {
    tasks: ["Какие ещё конкретные задачи войдут в работу?", "Как часто человеку предстоит выполнять эти задачи?"],
    project: ["Какого результата вы ждёте от человека в первые полгода?", "Какие задачи он будет решать в проекте в первые полгода?"],
    future: ["Что изменится в работе после первых шести месяцев?", "Какие задачи появятся у человека после первых шести месяцев?"],
    skills: ["Какие знания или инструменты помогут справляться с этой работой?", "Что человеку нужно уметь для этих задач?"],
  };
  return alternatives[topic].find(candidate => key(candidate) !== key(previous)) || question;
}
export type Block = { id: string; type: "heading" | "paragraph" | "list"; text: string };
export type DocumentData = { title: string; blocks: Block[] };
export type TopicScore = { score: number; missing: string[] };
export type Scores = Record<Topic, TopicScore>;
export type Snapshot = { document: DocumentData; scores: Scores; activeTopic: Topic | null; question: string; at: number };
export type Vacancy = { id: string; document: DocumentData; scores: Scores; activeTopic: Topic | null; question: string; revision: number; manuallyEdited: string[]; undo: Snapshot[]; redo: Snapshot[]; createdAt: number; updatedAt: number; lastSuccessfulExportAt?: number; lastExportedRevision?: number };
export const blankScores = (): Scores => ({ tasks: { score: 0, missing: [] }, project: { score: 0, missing: [] }, future: { score: 0, missing: [] }, skills: { score: 0, missing: [] } });
export const initialDocument = (): DocumentData => ({ title: "", blocks: [] });

/** A complete, local example for reviewing the finished editor state. It is
 * deliberately marked as an example in the list and stays fully editable. */
export const EXAMPLE_VACANCY_ID = "example-product-designer-v1";
export function exampleVacancy(): Vacancy {
  const createdAt = new Date("2026-11-10T08:00:00.000Z").getTime();
  return {
    id: EXAMPLE_VACANCY_ID,
    document: {
      title: "Ищем продуктового дизайнера",
      blocks: [
        { id: "intro", type: "paragraph", text: "Ищем дизайнера в команду, которая создаёт продукты на основе искусственного интеллекта. Нужен человек, который сможет разбираться в задаче, предлагать ясные решения и доводить их до работающего интерфейса." },
        { id: "tasks-heading", type: "heading", text: "Чем предстоит заниматься" },
        { id: "tasks", type: "list", text: "Развивать основной продукт вместе с командой\nПроектировать пользовательские сценарии и интерфейсы\nГотовить спецификации и материалы для разработки" },
        { id: "project-heading", type: "heading", text: "Ближайшие полгода" },
        { id: "project", type: "paragraph", text: "В первые шесть месяцев дизайнер проведёт редизайн основного продукта: поможет собрать сценарии, обновить интерфейс и проверить решения в работе." },
        { id: "future-heading", type: "heading", text: "Что дальше" },
        { id: "future", type: "paragraph", text: "После редизайна дизайнер продолжит развивать клиентские проекты и участвовать в создании новых продуктов." },
        { id: "skills-heading", type: "heading", text: "Что важно" },
        { id: "skills", type: "list", text: "Уметь исследовать задачу до начала макетов\nУверенно работать в Figma\nОбъяснять решения команде и принимать обратную связь" },
      ],
    },
    scores: {
      tasks: { score: 100, missing: [] },
      project: { score: 100, missing: [] },
      future: { score: 100, missing: [] },
      skills: { score: 100, missing: [] },
    },
    activeTopic: null,
    question: "Основное обсудили. Можете дополнить вакансию или забрать её.",
    revision: 1,
    manuallyEdited: [],
    undo: [],
    redo: [],
    createdAt,
    updatedAt: createdAt,
  };
}
export function isSufficient(score: TopicScore): boolean { return score.score >= 75 && score.missing.length === 0; }
export function allTopicsSufficient(scores: Scores): boolean { return TOPICS.every(topic => isSufficient(scores[topic])); }
export function snapshot(v: Vacancy): Snapshot { return { document: structuredClone(v.document), scores: structuredClone(v.scores), activeTopic: v.activeTopic, question: v.question, at: Date.now() }; }
export function prune(s: Snapshot[], now = Date.now()): Snapshot[] { return s.filter(x => x && typeof x.at === "number" && now - x.at <= 7 * 86400000 && validDocument(x.document) && validScores(x.scores) && (x.activeTopic === null || TOPICS.includes(x.activeTopic)) && typeof x.question === "string").slice(-50); }
/** Conservative typography for generated text. Protect URLs, emails and code. */
export function normalizeText(value: string): string {
  const cleaned = value.replace(/\r\n?/g, "\n").replace(/[\t ]{2,}/g, " ").replace(/ +([,.!?;:])/g, "$1").replace(/\n{3,}/g, "\n\n").trim();
  const protectedSegments = cleaned.split(/(`[^`\n]*`|https?:\/\/[^\s]+|www\.[^\s]+|[\w.+-]+@[\w.-]+\.[a-z]{2,})/gi);
  return protectedSegments.map((part, index) => {
    if (index % 2 === 1) return part;
    return part
      .replace(/(?<![\d.,])(\d{4,})(?= *(?:₽|руб(?:\.|лей|ля)?)(?=$|[\s,.]))/giu, number => number.replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0"))
      // Keep all common short Russian prepositions and conjunctions with the
      // following word. URLs, email addresses and code were split out above.
      .replace(/(?<![\p{L}\p{N}_/.:@-])([АаВвИиКкОоСсУу]|[Вв]о|[Кк]о|[Оо]б|[Оо]бо|[Сс]о|[Ии]з|[Зз]а|[Нн]а|[Пп]о|[Оо]т|[Дд]о|[Дд]ля|[Нн]ад|[Пп]од|[Пп]ри|[Бб]ез) +(?=[\p{L}\p{N}«„])/gu, "$1\u00a0")
      .replace(/(№) *(?=\d)/gu, "$1\u00a0")
      .replace(/(?<![\p{L}\p{N}])([0-9]+(?:[.,][0-9]+)?) *(%|₽)(?![\p{L}\p{N}])/gu, "$1\u00a0$2")
      .replace(/(?<![\p{L}\p{N}])([0-9]+(?:[.,][0-9]+)?) +(руб(?:\.|лей|ля)?|кг|км|мл|л|час(?:ов|а)?|мин(?:ут|уты|\.)?)(?=$|[\s.,;:!?])/giu, "$1\u00a0$2");
  }).join("");
}
/** Narrow guard for an explicitly stated weekday schedule; not a general fact checker. */
export function omitsNewWeekdayDetail(message: string, document: DocumentData): boolean {
  const statement = message.toLocaleLowerCase("ru").replace(/ё/g, "е").replace(/\u00a0/g, " ");
  if (!/(?:^|[^\p{L}])по\s+будням(?![\p{L}])/u.test(statement)) return false;
  // Negation and explicit revision have different semantics; do not impose the old schedule.
  if (/(?:^|[^\p{L}])(?:не|кроме|вместо|раньше|ранее|прежде)(?:[^.!?]{0,50})по\s+будням/u.test(statement) || /по\s+будням(?:[^.!?]{0,50})(?:теперь|раньше|ранее|больше\s+не|но\s+не|только\s+в\s+выходн)/u.test(statement)) return false;
  const result = [document.title, ...document.blocks.map(block => block.text)].join(" ").toLocaleLowerCase("ru").replace(/ё/g, "е").replace(/\u00a0/g, " ");
  const negative = /(?:^|[^\p{L}])(?:не|кроме|вместо)(?:[^.!?]{0,35})(?:по\s+будням|в\s+будние\s+дни|по\s+будним\s+дням|буднями)/u.test(result);
  return negative || !/(?:по\s+будням|в\s+будние\s+дни|по\s+будним\s+дням|буднями)/u.test(result);
}
/** A generated multi-item list needs a heading; never alter list facts. */
export function ensureListHeadings(document: DocumentData): DocumentData {
  const ids = new Set(document.blocks.map(block => block.id));
  let hasHeading = false;
  const blocks: Block[] = [];
  for (const block of document.blocks) {
    if (block.type === "heading") hasHeading = true;
    if (block.type === "list" && !hasHeading && document.blocks.length < 100 && block.text.split("\n").filter(line => line.trim()).length >= 2) {
      let id = `section-${block.id.slice(0, 75)}`; let suffix = 1;
      while (ids.has(id)) id = `section-${block.id.slice(0, 70)}-${suffix++}`;
      ids.add(id);
      const lines = block.text.split("\n").filter(line => line.trim());
      const actionWords = /^(?:подмет|мети|убира|след|чист|работ|контролир|разрабаты|провод|дела|созда|организ|вести|управ|собират|настра|ремонт|проектир)/iu;
      const title = lines.filter(line => actionWords.test(line.trim())).length >= 2 ? "Чем предстоит заниматься" : "О вакансии";
      blocks.push({ id, type: "heading", text: title }); hasHeading = true;
    }
    blocks.push(block);
  }
  return blocks.length === document.blocks.length ? document : { ...document, blocks };
}
export function validDocument(value: unknown): value is DocumentData {
  if (!value || typeof value !== "object") return false;
  const v = value as DocumentData;
  return typeof v.title === "string" && v.title.length <= 300 && Array.isArray(v.blocks) && v.blocks.length <= 100 && v.blocks.every(b => b && typeof b.id === "string" && b.id.length > 0 && b.id.length < 100 && ["heading", "paragraph", "list"].includes(b.type) && typeof b.text === "string" && b.text.length <= 10000) && new Set(v.blocks.map(b => b.id)).size === v.blocks.length;
}
export function validScores(value: unknown): value is Scores {
  if (!value || typeof value !== "object") return false;
  return TOPICS.every(t => { const s = (value as Scores)[t]; return s && Number.isFinite(s.score) && s.score >= 0 && s.score <= 100 && Array.isArray(s.missing) && s.missing.length <= 20 && s.missing.every(m => typeof m === "string" && m.length < 300); });
}
export function plainDescription(document: DocumentData): string { return document.blocks.map(b => b.type === "list" ? b.text.split("\n").filter(Boolean).map(x => `• ${x}`).join("\n") : b.text).filter(Boolean).join("\n\n"); }
export function escapeHtml(text: string): string { return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
export function htmlDescription(document: DocumentData): string { return document.blocks.filter(b => b.text.trim()).map(b => b.type === "heading" ? `<h2>${escapeHtml(b.text)}</h2>` : b.type === "list" ? `<ul>${b.text.split("\n").filter(Boolean).map(x => `<li>${escapeHtml(x)}</li>`).join("")}</ul>` : `<p>${escapeHtml(b.text).replace(/\n/g, "<br>")}</p>`).join(""); }
export function shouldStartFresh(v: Vacancy, now = Date.now()): boolean { return !!v.lastSuccessfulExportAt && v.lastExportedRevision === v.revision && now - v.lastSuccessfulExportAt > 3600000; }
