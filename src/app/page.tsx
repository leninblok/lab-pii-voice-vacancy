"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowUp, Check, Copy, Download, Mic, PanelLeftClose, PanelLeftOpen, Plus, Redo2, RotateCcw, Undo2, X } from "lucide-react";
import { VoiceWave } from "@/components/VoiceWave";
import VacancyEditor from "@/components/VacancyEditor";
import { printPdf } from "@/lib/pdf";
import { TOPICS, LABELS, QUESTIONS, EXAMPLE_VACANCY_ID, exampleVacancy, initialDocument, isSufficient, allTopicsSufficient, snapshot, prune, plainDescription, htmlDescription, shouldStartFresh, validDocument, validScores, type Topic, type Vacancy, type DocumentData, type Scores } from "@/lib/vacancy";

type Update = { document: DocumentData; scores: Scores; activeTopic: Topic | null; question: string; changedBlockIds: string[]; revision: number; operationId: string };
type Retry = { text: string; audio?: Blob; transcript?: string; vacancyId: string | null; revision: number; duration: number };
const STORE = "voice-vacancies-v2";
const LAST = "voice-vacancies-last";
const makeId = () => crypto.randomUUID();
const THINKING_BARS = Array.from({ length: 68 }, (_, index) => index);
const QUESTION_HELP: Record<Topic, string> = {
  tasks: "Назовите регулярные задачи, частоту и контекст. Например: «Каждое утро проверять входную группу и поддерживать порядок»",
  project: "Опишите результат, срок и масштаб. Например: «За первые шесть месяцев запустить новый раздел и проверить его на клиентах»",
  future: "Расскажите, что изменится после этого этапа. Например: «После запуска человек возьмёт на себя развитие продукта»",
  skills: "Назовите знания и инструменты, без которых не обойтись. Например: «Уверенно работать в Figma и проводить интервью»",
};
const COMPLETE_HELP = "Основное уже есть — проверьте текст и добавьте то, что важно кандидату: условия, формат работы, команду или оплату";
function formatUpdatedAt(timestamp: number) {
  const date = new Date(timestamp);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayDifference = Math.round((startOfToday - startOfDate) / 86_400_000);
  const time = date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  if (dayDifference === 0) return `Сегодня, ${time}`;
  if (dayDifference === 1) return `Вчера, ${time}`;
  const month = date.toLocaleDateString("ru-RU", { month: "long" });
  return date.getFullYear() === now.getFullYear()
    ? `${date.getDate()} ${month}, ${time}`
    : `${date.getDate()} ${month} ${date.getFullYear()}, ${time}`;
}
async function sendJson<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Не удалось обработать ответ. Попробуйте ещё раз.");
  return data as T;
}
function AutoField({ value, onChange, className, label, disabled, placeholder, onKeyDown }: {value: string; onChange: (s: string) => void; className?: string; label: string; disabled?: boolean; placeholder?: string; onKeyDown?: React.KeyboardEventHandler<HTMLTextAreaElement>}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const field = ref.current;
    if (!field) return;
    const resize = () => {
      // Measure without a scrollbar; browser rounding can otherwise show one
      // even for an empty, single-line field.
      field.style.overflowY = "hidden";
      field.style.height = "auto";
      const maxHeight = Number.parseFloat(getComputedStyle(field).maxHeight) || 132;
      const contentHeight = field.scrollHeight;
      field.style.height = `${Math.min(contentHeight, maxHeight)}px`;
      if (contentHeight > maxHeight + 1) field.style.overflowY = "auto";
    };
    resize();
    let width = field.clientWidth;
    const observer = new ResizeObserver(() => {
      if (field.clientWidth === width) return;
      width = field.clientWidth;
      resize();
    });
    observer.observe(field);
    return () => observer.disconnect();
  }, [value]);
  return <textarea ref={ref} rows={1} className={className} aria-label={label} value={value} disabled={disabled} placeholder={placeholder} onChange={e => onChange(e.target.value)} onKeyDown={onKeyDown} />;
}
export default function Home() {
  const [vacancies, setVacancies] = useState<Vacancy[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const [resumeId, setResumeId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [processingLabel, setProcessingLabel] = useState("");
  const [recording, setRecording] = useState(false);
  const [retry, setRetry] = useState<Retry | null>(null);
  const [notice, setNotice] = useState("");
  const [completedAction, setCompletedAction] = useState<"copy" | "pdf" | null>(null);
  const [enteringDocument, setEnteringDocument] = useState(false);
  const [leavingStart, setLeavingStart] = useState(false);
  const [changed, setChanged] = useState<string[]>([]);
  const changeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const actionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const entryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTransitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const records = useRef<Vacancy[]>([]); const idRef = useRef<string | null>(null);
  const busyRef = useRef(false); const generation = useRef(0); const analysis = useRef<AbortController | null>(null);
  const recorder = useRef<MediaRecorder | null>(null); const stream = useRef<MediaStream | null>(null); const audioContext = useRef<AudioContext | null>(null);
  const chunks = useRef<Blob[]>([]); const heardSpeech = useRef(false); const cancelled = useRef(false); const timer = useRef<ReturnType<typeof setInterval> | null>(null); const analyserRef = useRef<AnalyserNode | null>(null); const timeRef = useRef(0);
  const typingGroup = useRef<{id: string; at: number} | null>(null); const inputRef = useRef("");
  const current = vacancies.find(v => v.id === currentId) || null;
  const interviewComplete = !!current && allTopicsSufficient(current.scores);
  useEffect(() => { inputRef.current = text; }, [text]);
  useEffect(() => {
    const element = composerRef.current;
    if (!element || !currentId) return;
    const updateHeight = () => document.documentElement.style.setProperty("--composer-height", `${element.getBoundingClientRect().height}px`);
    updateHeight();
    const observer = new ResizeObserver(updateHeight); observer.observe(element);
    return () => { observer.disconnect(); document.documentElement.style.removeProperty("--composer-height"); };
  }, [currentId]);
  const persist = useCallback((items: Vacancy[]) => { records.current = items; setVacancies(items); try { localStorage.setItem(STORE, JSON.stringify(items)); } catch { setNotice("Не удалось сохранить вакансию в браузере. Освободите место и попробуйте снова."); } }, []);
  const select = useCallback((id: string | null) => { cancelled.current = true; if (recorder.current?.state === "recording") recorder.current.stop(); generation.current++; analysis.current?.abort(); if (changeTimer.current) clearTimeout(changeTimer.current); if (entryTimer.current) clearTimeout(entryTimer.current); setEnteringDocument(false); setLeavingStart(false); setChanged([]); idRef.current = id; setCurrentId(id); setResumeId(null); setRetry(null); setNotice(""); try { if (id) localStorage.setItem(LAST, id); } catch { setNotice("Не удалось сохранить выбор вакансии в браузере."); } }, []);
  useEffect(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORE) || "[]");
      const items: Vacancy[] = Array.isArray(parsed) ? parsed.filter(v => v && typeof v.id === "string" && validDocument(v.document) && validScores(v.scores) && (v.activeTopic === null || TOPICS.includes(v.activeTopic)) && typeof v.question === "string" && Number.isInteger(v.revision) && typeof v.createdAt === "number" && typeof v.updatedAt === "number" && Array.isArray(v.undo) && Array.isArray(v.redo) && Array.isArray(v.manuallyEdited)).map(v => ({...v, undo: prune(v.undo), redo: prune(v.redo)})) : [];
      const withExample = items.some(v => v.id === EXAMPLE_VACANCY_ID) ? items : [...items, exampleVacancy()];
      records.current = withExample; setVacancies(withExample);
      if (withExample !== items) localStorage.setItem(STORE, JSON.stringify(withExample));
      const last = withExample.find(v => v.id === localStorage.getItem(LAST));
      if (last) { if (shouldStartFresh(last)) setResumeId(last.id); else { idRef.current = last.id; setCurrentId(last.id); } }
    } catch { setNotice("Не удалось прочитать сохранённые вакансии в этом браузере."); }
    setLoaded(true);
  }, []);
  const updateRecord = useCallback((id: string, fn: (v: Vacancy) => Vacancy) => { const items = records.current.map(v => v.id === id ? fn(v) : v); persist(items); }, [persist]);
  const stopMedia = useCallback(() => { if (timer.current) clearInterval(timer.current); timer.current = null; analyserRef.current = null; stream.current?.getTracks().forEach(t => t.stop()); stream.current = null; void audioContext.current?.close(); audioContext.current = null; setRecording(false); }, []);
  const cancelRecording = () => { if (!recording) return; cancelled.current = true; if (recorder.current?.state === "recording") recorder.current.stop(); };
  const submitRecording = () => { if (recording && recorder.current?.state === "recording") recorder.current.stop(); };
  useEffect(() => () => { cancelled.current = true; if (recorder.current?.state === "recording") recorder.current.stop(); stopMedia(); analysis.current?.abort(); if (changeTimer.current) clearTimeout(changeTimer.current); if (actionTimer.current) clearTimeout(actionTimer.current); if (entryTimer.current) clearTimeout(entryTimer.current); }, [stopMedia]);
  const submit = useCallback(async (attempt: Retry) => {
    if (busyRef.current) return;
    const base = attempt.vacancyId ? records.current.find(v => v.id === attempt.vacancyId) : null;
    if ((attempt.vacancyId && (!base || idRef.current !== attempt.vacancyId || base.revision !== attempt.revision)) || (!attempt.vacancyId && idRef.current)) { setRetry(attempt); setNotice("Ответ не отправлен: вакансия изменилась во время обработки. Попробуйте ещё раз."); return; }
    busyRef.current = true; setBusy(true); setProcessingLabel(attempt.audio && !attempt.transcript ? "Расшифровываем запись…" : "Обрабатываем ответ…"); setNotice(""); analysis.current?.abort(); const gen = ++generation.current; let transcript = attempt.transcript;
    try {
      if (attempt.audio && !transcript) {
        const form = new FormData(); form.set("audio", attempt.audio, attempt.audio.type.includes("mp4") ? "answer.m4a" : "answer.webm");
        const response = await fetch("/api/transcribe", { method: "POST", body: form }); const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "Не удалось распознать запись. Попробуйте ещё раз.");
        transcript = body.text;
      }
      const operationId = makeId(); const result = await sendJson<Update>("/api/update", { document: base?.document || initialDocument(), message: [attempt.text.trim(), transcript?.trim()].filter(Boolean).join("\n"), activeTopic: base?.activeTopic || "tasks", previousQuestion: base?.question || "", manuallyEdited: base?.manuallyEdited || [], revision: attempt.revision, operationId, mode: "update" });
      const latest = base && records.current.find(v => v.id === base.id);
      const stale = generation.current !== gen || result.operationId !== operationId || result.revision !== attempt.revision || (base && (!latest || latest.revision !== base.revision || idRef.current !== base.id)) || (!base && idRef.current);
      if (stale) {
        if (idRef.current === attempt.vacancyId) {
          setRetry({ ...attempt, transcript });
          setNotice("Ответ не отправлен: документ изменился во время обработки. Повторите отправку.");
        }
        return;
      }
      const unchanged = base && base.document.title === result.document.title && JSON.stringify(base.document.blocks) === JSON.stringify(result.document.blocks);
      if (unchanged) throw new Error("Не удалось добавить ответ в вакансию. Повторите отправку.");
      if (!base) {
        setLeavingStart(true);
        await new Promise<void>(resolve => { startTransitionTimer.current = setTimeout(() => { startTransitionTimer.current = null; resolve(); }, 260); });
        if (generation.current !== gen || idRef.current) return;
      }
      const now = Date.now();
      const vacancy: Vacancy = base ? { ...base, document: result.document, scores: result.scores, activeTopic: result.activeTopic, question: result.question, revision: base.revision + 1, updatedAt: now, undo: prune([...base.undo, snapshot(base)]), redo: [] } : { id: makeId(), document: result.document, scores: result.scores, activeTopic: result.activeTopic, question: result.question, revision: 1, manuallyEdited: [], undo: [], redo: [], createdAt: now, updatedAt: now };
      persist(base ? records.current.map(v => v.id === base.id ? vacancy : v) : [vacancy, ...records.current]);
      if (!base) { idRef.current = vacancy.id; setCurrentId(vacancy.id); setResumeId(null); setEnteringDocument(true); if (entryTimer.current) clearTimeout(entryTimer.current); entryTimer.current = setTimeout(() => setEnteringDocument(false), 520); try { localStorage.setItem(LAST, vacancy.id); } catch { setNotice("Не удалось сохранить выбор вакансии в браузере."); } }
      if (inputRef.current === attempt.text) setText(""); setRetry(previous => previous && previous.text === attempt.text && previous.audio === attempt.audio ? null : previous);
      if (changeTimer.current) clearTimeout(changeTimer.current);
      setChanged([...result.changedBlockIds, ...(!base || base.document.title !== result.document.title ? ["title"] : [])]);
      changeTimer.current = setTimeout(() => setChanged([]), 2600);
    } catch (error) {
      if (generation.current === gen) { setRetry({ ...attempt, transcript }); setNotice(error instanceof Error ? error.message : "Не удалось обработать ответ. Попробуйте ещё раз."); }
    } finally { busyRef.current = false; setBusy(false); setProcessingLabel(""); setLeavingStart(false); }
  }, [persist]);
  const sendText = () => { if (!text.trim() || busyRef.current || recording) return; const v = records.current.find(x => x.id === idRef.current); void submit({ text, vacancyId: v?.id || null, revision: v?.revision || 0, duration: 0 }); };
  const startRecording = async () => {
    if (busyRef.current) return; setNotice("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { setNotice("Запись недоступна в этом браузере. Напишите ответ."); return; }
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true }); stream.current = media; cancelled.current = false; chunks.current = []; heardSpeech.current = false; timeRef.current = 0;
      const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find(x => MediaRecorder.isTypeSupported(x));
      const rec = mime ? new MediaRecorder(media, { mimeType: mime }) : new MediaRecorder(media); recorder.current = rec;
      rec.ondataavailable = e => { if (e.data.size) chunks.current.push(e.data); };
      rec.onstop = () => { const blob = new Blob(chunks.current, {type: rec.mimeType || "audio/webm"}); const duration = timeRef.current; stopMedia(); if (!cancelled.current && blob.size && !heardSpeech.current) { setNotice("Не удалось услышать речь. Проверьте микрофон и повторите запись."); return; } if (!cancelled.current && blob.size) { const v = records.current.find(x => x.id === idRef.current); void submit({text: inputRef.current, audio: blob, vacancyId: v?.id || null, revision: v?.revision || 0, duration}); } };
      const ctx = new AudioContext(); audioContext.current = ctx; const analyser = ctx.createAnalyser(); analyser.fftSize = 256; ctx.createMediaStreamSource(media).connect(analyser); analyserRef.current = analyser;
      rec.start(); setRecording(true); timer.current = setInterval(() => { timeRef.current++; if (timeRef.current >= 120 && rec.state === "recording") rec.stop(); }, 1000);
    } catch { stopMedia(); setNotice("Нет доступа к микрофону. Разрешите запись в браузере или напишите ответ."); }
  };
  const editDocument = (document: DocumentData, changedIds: string[]) => {
    if (!current || busyRef.current || !changedIds.length) return;
    setChanged([]);
    generation.current++; analysis.current?.abort();
    const now = Date.now(); const group = typingGroup.current;
    const grouped = group?.id === current.id && now - group.at < 1200;
    typingGroup.current = { id: current.id, at: now };
    updateRecord(current.id, v => ({...v, document, revision: v.revision + 1, updatedAt: now, manuallyEdited: [...new Set([...v.manuallyEdited, ...changedIds])], undo: grouped ? v.undo : prune([...v.undo, snapshot(v)]), redo: []}));
  };
  useEffect(() => {
    if (!current || !typingGroup.current || busy) return;
    const id = current.id; const revision = current.revision; const handle = setTimeout(async () => {
      const latest = records.current.find(v => v.id === id); if (!latest || latest.revision !== revision) return;
      const controller = new AbortController(); analysis.current = controller; const operationId = makeId();
      try { const data = await sendJson<Update>("/api/update", {document: latest.document, message: "", activeTopic: latest.activeTopic, previousQuestion: latest.question, manuallyEdited: latest.manuallyEdited, revision, operationId, mode: "analyze"}, controller.signal);
        if (controller.signal.aborted || idRef.current !== id || data.operationId !== operationId) return;
        const now = records.current.find(v => v.id === id); if (!now || now.revision !== revision) return;
        updateRecord(id, v => ({...v, scores: data.scores, activeTopic: data.activeTopic, question: data.question}));
      } catch { /* Текст уже сохранён; анализ повторится после следующей правки. */ }
    }, 1000); return () => clearTimeout(handle);
  }, [current?.id, current?.revision, busy, updateRecord]);
  const travel = (direction: "undo" | "redo") => { if (!current || busyRef.current) return; typingGroup.current = null; generation.current++; analysis.current?.abort(); setChanged([]); updateRecord(current.id, v => { const source = prune(v[direction]); const target = source.at(-1); if (!target) return v; const other = direction === "undo" ? "redo" : "undo"; return {...v, document: target.document, scores: target.scores, activeTopic: target.activeTopic, question: target.question, revision: v.revision + 1, updatedAt: Date.now(), [direction]: source.slice(0,-1), [other]: prune([...v[other], snapshot(v)])}; }); };
  useEffect(() => { const handle = (e: KeyboardEvent) => { if (e.key === "Escape" && recording) { e.preventDefault(); cancelRecording(); return; } if (e.key === "Enter" && recording && !busy) { e.preventDefault(); submitRecording(); return; } if (e.key === "Escape" && drawer) { setDrawer(false); return; } const el = e.target as HTMLElement; if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el.isContentEditable) return; if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") { e.preventDefault(); travel(e.shiftKey ? "redo" : "undo"); } else if (e.ctrlKey && e.key.toLowerCase() === "y") { e.preventDefault(); travel("redo"); } }; window.addEventListener("keydown", handle); return () => window.removeEventListener("keydown", handle); });
  const markExport = (v: Vacancy) => updateRecord(v.id, x => x.revision === v.revision ? {...x, lastSuccessfulExportAt: Date.now(), lastExportedRevision: x.revision} : x);
  const showCompletedAction = (action: "copy" | "pdf") => { setCompletedAction(action); if (actionTimer.current) clearTimeout(actionTimer.current); actionTimer.current = setTimeout(() => setCompletedAction(null), 1800); };
  const discardRetry = () => { setRetry(null); setNotice(""); };
  const repeatRetry = () => { const v = records.current.find(x => x.id === idRef.current); if (!retry) return; if (retry.vacancyId === (v?.id || null)) void submit({...retry, revision: v?.revision || 0}); else setNotice("Откройте вакансию, к которой относится ответ."); };
  const copy = async () => { if (!current) return; setNotice(""); const plain = plainDescription(current.document); if (!plain.trim()) { setNotice("Описания для копирования пока нет."); return; } try { if (typeof ClipboardItem !== "undefined" && navigator.clipboard.write) await navigator.clipboard.write([new ClipboardItem({"text/plain": new Blob([plain], {type:"text/plain"}), "text/html": new Blob([htmlDescription(current.document)], {type:"text/html"})})]); else await navigator.clipboard.writeText(plain); markExport(current); showCompletedAction("copy"); } catch { try { await navigator.clipboard.writeText(plain); markExport(current); showCompletedAction("copy"); } catch { setNotice("Не удалось скопировать. Выделите текст и скопируйте его вручную."); } } };
  const pdf = () => { if (!current) return; setNotice(""); try { printPdf(current.document, current.updatedAt); markExport(current); showCompletedAction("pdf"); } catch { setNotice("Не удалось открыть окно сохранения PDF. Разрешите всплывающие окна и повторите."); } };
  const chooseTopic = (topic: Topic) => { if (!current || busy) return; updateRecord(current.id, v => ({...v, activeTopic: topic, question: QUESTIONS[topic]})); };
  if (!loaded) return null;
  return <main className={`app ${current ? "has-document" : ""} ${drawer ? "sidebar-open" : ""}`}>
    {(current || vacancies.length > 0) && <aside id="vacancy-sidebar" className="drawer" aria-label="Вакансии" aria-hidden={!drawer} inert={!drawer}>
      <div className="drawer-head"><h2>Вакансии</h2></div>
      <button className="new-vacancy" onClick={() => select(null)}><Plus size={14} strokeWidth={2} aria-hidden="true" /> Новая вакансия</button>
      {[...vacancies].sort((a,b) => b.updatedAt-a.updatedAt).map(v => <button key={v.id} className="vacancy-link" aria-current={currentId === v.id ? "page" : undefined} onClick={() => select(v.id)}><span>{v.document.title || "Без названия"}</span><small>{v.id === EXAMPLE_VACANCY_ID ? "Пример для редактирования" : formatUpdatedAt(v.updatedAt)}</small></button>)}
    </aside>}
    <div className="workspace">
      {(current || vacancies.length > 0) && <header className="topbar"><div className="topbar-inner"><button className={`icon-button sidebar-toggle ${drawer ? "is-open" : ""}`} onClick={() => setDrawer(open => !open)} aria-controls="vacancy-sidebar" aria-expanded={drawer} aria-label={drawer ? "Скрыть панель вакансий" : "Открыть панель вакансий"} title={drawer ? "Скрыть панель вакансий" : "Открыть панель вакансий"}><PanelLeftOpen className="sidebar-toggle__open" size={18} strokeWidth={1.7} aria-hidden="true" /><PanelLeftClose className="sidebar-toggle__close" size={18} strokeWidth={1.7} aria-hidden="true" /></button>{current && <div className="actions"><span className="sr-only" role="status">{completedAction === "copy" ? "Описание скопировано" : completedAction === "pdf" ? "Открыто окно сохранения PDF" : ""}</span><button onClick={() => travel("undo")} disabled={!current.undo.length || busy} aria-label="Отменить изменение" title="Отменить"><Undo2 size={18} strokeWidth={1.7} aria-hidden="true" /></button><button onClick={() => travel("redo")} disabled={!current.redo.length || busy} aria-label="Повторить изменение" title="Повторить"><Redo2 size={18} strokeWidth={1.7} aria-hidden="true" /></button><button className={completedAction === "copy" ? "is-complete" : undefined} onClick={copy} aria-label={completedAction === "copy" ? "Описание скопировано" : "Скопировать описание вакансии"} title={completedAction === "copy" ? "Описание скопировано" : "Скопировать"}>{completedAction === "copy" ? <Check size={18} strokeWidth={1.9} aria-hidden="true" /> : <Copy size={18} strokeWidth={1.7} aria-hidden="true" />}</button><button className={`${interviewComplete ? "pdf-action is-accented" : "pdf-action"}${completedAction === "pdf" ? " is-complete" : ""}`} onClick={pdf} aria-label={completedAction === "pdf" ? "Открыто окно сохранения PDF" : "Сохранить как PDF"} title={completedAction === "pdf" ? "Открыто окно сохранения PDF" : "Сохранить как PDF"}>{completedAction === "pdf" ? <Check size={18} strokeWidth={1.9} aria-hidden="true" /> : <Download size={18} strokeWidth={1.7} aria-hidden="true" />}</button></div>}</div></header>}
    {!current ? <section className={`welcome ${leavingStart ? "is-leaving" : ""}`}><h1>Расскажите,<br />кого вы ищете?</h1><p className="intro">Расскажите о будущей работе как получится — мы проведём по шагам, подскажем, что уточнить, и соберём понятную вакансию. В конце сможете отредактировать текст и скачать PDF</p>{resumeId && <button className="resume" onClick={() => select(resumeId)}>Продолжить: {vacancies.find(v => v.id === resumeId)?.document.title || "вакансия"} →</button>}</section> : <div className={`document ${enteringDocument ? "is-entering" : ""}`}><VacancyEditor document={current.document} documentId={current.id} disabled={busy} changedIds={changed} onChange={editDocument} /></div>}
    <section className={`${current ? "composer fixed" : "composer initial"} ${interviewComplete ? "is-complete" : "is-active"} ${!current && text.trim() ? "has-text" : ""} ${enteringDocument ? "is-entering-document" : ""} ${leavingStart ? "is-leaving" : ""}`} aria-label="Ответ"><div className="composer-inner" ref={composerRef}>
      {current && <><div className="topics" aria-label="Темы">{TOPICS.map(t => { const complete = isSufficient(current.scores[t]); return <button key={t} className={`topic ${current.activeTopic === t && !complete ? "active" : ""} ${complete ? "is-complete" : ""}`} onClick={() => chooseTopic(t)} disabled={busy || complete} aria-pressed={!complete && current.activeTopic === t} aria-label={complete ? `${LABELS[t]} — заполнено` : LABELS[t]}><span className="topic-label">{LABELS[t]}{complete && <Check className="topic-check" size={14} strokeWidth={2} aria-hidden="true" />}</span><span className="track"><span style={{transform: `scaleX(${complete ? 1 : Math.max(0, Math.min(100, current.scores[t].score)) / 100})`}} /></span></button>; })}</div><div className="question-context"><div className="question"><span>{interviewComplete ? "Вакансия готова" : current.question || (current.activeTopic ? QUESTIONS[current.activeTopic] : "Расскажите подробнее о работе")}</span></div><p className="question-support">{interviewComplete ? COMPLETE_HELP : current.activeTopic ? QUESTION_HELP[current.activeTopic] : "Расскажите о том, что ещё важно кандидату"}</p></div></>}
      <div className={`input-row ${recording ? "is-recording" : ""} ${busy ? "is-busy" : ""} ${recording || busy ? "has-wave" : ""} ${retry && !busy ? "has-retry" : ""}`} aria-busy={busy}>{recording || busy ? <><button className="cancel-recording wave-control" disabled={busy} onClick={cancelRecording} aria-label="Сбросить запись" aria-keyshortcuts="Escape" title="Сбросить запись — Esc"><X size={18} strokeWidth={1.8} aria-hidden="true" /></button><div className={`recording-inline ${busy ? "is-analyzing" : ""}`} role="status" aria-label={busy ? processingLabel : "Идёт запись"}>{busy ? <><span className="sr-only">{processingLabel}</span><span className="thinking-wave" aria-hidden="true">{THINKING_BARS.map(index => <i key={index} />)}</span></> : <VoiceWave analyser={analyserRef.current} onSignal={amplitude => { if (amplitude > .003) heardSpeech.current = true; }} />}</div><button className="recording-send wave-control" disabled={busy} onClick={submitRecording} aria-label="Отправить голосовой ответ" aria-keyshortcuts="Enter" title="Отправить голосовой ответ — Enter"><ArrowUp size={19} strokeWidth={1.8} aria-hidden="true" /></button></> : retry ? <><button className="retry-reset" onClick={discardRetry} aria-label="Сбросить неотправленный ответ" title="Сбросить ответ"><X size={18} strokeWidth={1.8} aria-hidden="true" /></button><span className="retry-message"><b>Ответ не отправлен</b><small>{notice || "Проверьте подключение и попробуйте ещё раз."}</small></span><button className="retry-send" onClick={repeatRetry} aria-label="Повторить отправку" title="Повторить отправку"><RotateCcw size={18} strokeWidth={1.8} aria-hidden="true" /></button></> : <><AutoField label="Ответ" value={text} onChange={setText} disabled={busy} placeholder={current ? (interviewComplete ? "Добавьте важную деталь…" : "Ответьте или расскажите о другом…") : "Например, продуктового дизайнера"} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); sendText(); } }} /><div className="input-actions"><button className="mic" onClick={() => void startRecording()} disabled={busy} aria-label="Записать голосовой ответ" title="Записать голосовой ответ"><Mic size={19} strokeWidth={1.7} aria-hidden="true" /></button><button className="send" disabled={busy || !text.trim()} onClick={sendText} aria-label="Отправить ответ" aria-keyshortcuts="Enter" title="Отправить ответ — Enter"><ArrowUp size={19} strokeWidth={1.8} aria-hidden="true" /></button></div></>}</div>
      {notice && !retry && <p className="notice" role="status">{notice}</p>}
    </div></section>
    </div>
  </main>;
}
