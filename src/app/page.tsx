"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { completion, questions, type Assessment } from "@/lib/questions";

type Screen = "intro" | "interview" | "review" | "result";
type VoiceState = "idle" | "requesting" | "recording" | "transcribing";
const emptyAnswers = () => ["", "", "", ""];
const emptyAssessments = (): (Assessment | null)[] => [null, null, null, null];

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  if (name === "mic") return <svg {...common}><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3m-3 0h6"/></svg>;
  if (name === "arrow") return <svg {...common}><path d="M4 12h15m-5-5 5 5-5 5"/></svg>;
  if (name === "back") return <svg {...common}><path d="M20 12H5m5-5-5 5 5 5"/></svg>;
  if (name === "check") return <svg {...common}><path d="m5 12 4 4L19 6"/></svg>;
  if (name === "copy") return <svg {...common}><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>;
  return <svg {...common}><path d="M12 3v12m-4-4 4 4 4-4M5 18v2h14v-2"/></svg>;
}

async function fetchData(url: string, options: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Что-то пошло не так. Попробуйте ещё раз.");
  return data;
}

function Circle({ assessments, recording, index, intro }: { assessments: (Assessment | null)[]; recording: boolean; index: number; intro: boolean }) {
  const circumference = 2 * Math.PI * 108;
  const dash = circumference / 4 - 11;
  const percent = completion(assessments);
  return <div className={`orb-wrap ${recording ? "is-recording" : ""}`} aria-label={`Полнота брифа: ${percent}%`} role="img">
    <div className="orb-glow" />
    <svg className="orb-svg" viewBox="0 0 260 260" aria-hidden="true">
      {questions.map((_, i) => <g key={i} transform={`rotate(${-90 + i * 90} 130 130)`}>
        <circle cx="130" cy="130" r="108" className="orb-track" strokeDasharray={`${dash} ${circumference}`} />
        <circle cx="130" cy="130" r="108" className="orb-progress" strokeDasharray={`${dash * (assessments[i]?.status === "complete" ? 1 : assessments[i]?.status === "partial" ? .5 : 0)} ${circumference}`} />
      </g>)}
    </svg>
    <div className="orb-center">
      <span className="orb-symbol"><Icon name="mic" size={27}/></span>
      <span className="orb-number">{intro ? "04" : `${percent}%`}</span>
      <span className="orb-label">{intro ? "ВОПРОСА" : recording ? "ИДЁТ ЗАПИСЬ" : "ЗАПОЛНЕНО"}</span>
    </div>
    <span className="orb-caption">{intro ? "ВАШ БУДУЩИЙ СОТРУДНИК" : `ВОПРОС ${String(index + 1).padStart(2, "0")} / 04`}</span>
  </div>;
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("intro");
  const [index, setIndex] = useState(0);
  const [role, setRole] = useState("");
  const [answers, setAnswers] = useState<string[]>(emptyAnswers);
  const [assessments, setAssessments] = useState<(Assessment | null)[]>(emptyAssessments);
  const [voice, setVoice] = useState<VoiceState>("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const [stale, setStale] = useState(false);
  const [edited, setEdited] = useState(false);
  const [copied, setCopied] = useState(false);
  const [analysisFailed, setAnalysisFailed] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revisions = useRef([0, 0, 0, 0]);
  const mounted = useRef(true);
  const micRequest = useRef(0);

  const releaseMic = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; micRequest.current++; if (recorderRef.current?.state === "recording") recorderRef.current.stop(); releaseMic(); }; }, [releaseMic]);

  const updateAnswer = (value: string, target = index) => {
    revisions.current[target]++;
    setAnswers(old => old.map((item, i) => i === target ? value : item));
    setAssessments(old => old.map((item, i) => i === target ? null : item));
    if (result) setStale(true);
    setAnalysisFailed(false);
    setError("");
  };

  const startRecording = async () => {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Браузер не поддерживает запись. Вы можете ввести ответ текстом."); return;
    }
    setVoice("requesting");
    const requestId = ++micRequest.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current || requestId !== micRequest.current) { stream.getTracks().forEach(t => t.stop()); return; }
      streamRef.current = stream;
      const candidates = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"];
      const mimeType = candidates.find(type => MediaRecorder.isTypeSupported(type));
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      const chunks: Blob[] = [];
      const questionIndex = index;
      const version = revisions.current[questionIndex];
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => { releaseMic(); if (mounted.current) { setVoice("idle"); setError("Не удалось записать ответ. Попробуйте ещё раз или введите текст."); } };
      recorder.onstop = async () => {
        releaseMic(); recorderRef.current = null;
        if (!mounted.current) return;
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        if (!blob.size) { setVoice("idle"); setError("Запись получилась пустой. Попробуйте ещё раз."); return; }
        if (blob.size > 3_800_000) { setVoice("idle"); setError("Запись слишком большая. Попробуйте ответить короче."); return; }
        setVoice("transcribing");
        try {
          const form = new FormData();
          form.append("audio", blob, recorder.mimeType.includes("mp4") ? "answer.m4a" : "answer.webm");
          const data = await fetchData("/api/transcribe", { method: "POST", body: form });
          if (mounted.current && revisions.current[questionIndex] === version && typeof data.text === "string") updateAnswer(data.text, questionIndex);
        } catch (err) { if (mounted.current) setError(err instanceof Error ? err.message : "Не удалось распознать запись."); }
        finally { if (mounted.current) setVoice("idle"); }
      };
      recorder.start(); setVoice("recording");
      timerRef.current = setTimeout(() => { if (recorder.state === "recording") recorder.stop(); }, 120000);
    } catch {
      if (requestId !== micRequest.current || !mounted.current) return;
      releaseMic(); setVoice("idle");
      setError("Нет доступа к микрофону. Разрешите его в настройках браузера или введите ответ текстом.");
    }
  };

  const stopRecording = () => { if (recorderRef.current?.state === "recording") recorderRef.current.stop(); };
  const analyze = async () => {
    setError(""); setAnalysisFailed(false); setBusy(true);
    const current = index; const version = revisions.current[current];
    try {
      const data = await fetchData("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questionId: current + 1, answer: answers[current] }) });
      if (revisions.current[current] !== version) return;
      if (!["empty", "partial", "complete"].includes(String(data.status)) || typeof data.feedback !== "string" || typeof data.clarification !== "string") throw new Error("Не удалось проверить ответ. Попробуйте ещё раз.");
      const checked: Assessment = { status: data.status as Assessment["status"], feedback: data.feedback, clarification: data.clarification };
      setAssessments(old => old.map((item, i) => i === current ? checked : item));
    } catch (err) { setAnalysisFailed(true); setError(err instanceof Error ? err.message : "Не удалось проверить ответ."); }
    finally { setBusy(false); }
  };
  const next = () => { setError(""); setAnalysisFailed(false); if (index < 3) setIndex(index + 1); else setScreen("review"); };
  const previous = () => { setError(""); setAnalysisFailed(false); if (index > 0) setIndex(index - 1); else setScreen("intro"); };
  const generate = async () => {
    if (!answers.some(a => a.trim())) { setError("Добавьте хотя бы один ответ, чтобы подготовить вакансию."); return; }
    if (edited && !window.confirm("Новый текст заменит ваши правки. Продолжить?")) return;
    setBusy(true); setError("");
    try {
      const data = await fetchData("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role, answers }) });
      if (typeof data.text !== "string" || !data.text.trim()) throw new Error("Не удалось подготовить текст. Попробуйте ещё раз.");
      setResult(data.text); setEdited(false); setStale(false); setScreen("result");
    } catch (err) { setError(err instanceof Error ? err.message : "Не удалось подготовить вакансию."); }
    finally { setBusy(false); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(result); setCopied(true); setTimeout(() => setCopied(false), 2500); }
    catch { setError("Не удалось скопировать. Выделите текст и скопируйте его вручную."); }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([result], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "vacancy.txt"; link.click(); URL.revokeObjectURL(url);
  };
  const reset = () => {
    if (!window.confirm("Начать заново? Текущие ответы и текст удалятся.")) return;
    setAnswers(emptyAnswers()); setAssessments(emptyAssessments()); setRole(""); setResult(""); setEdited(false); setStale(false); setIndex(0); setError(""); revisions.current = [0, 0, 0, 0]; setScreen("intro");
  };
  const locked = busy || voice !== "idle";
  const assessment = assessments[index];
  const percent = completion(assessments);

  return <main className="app-shell">
    <header className="header"><a href="/" className="brand" aria-label="Лаб ПИИ — начало"><span className="brand-mark">л<span>.</span></span><span className="brand-name">ЛАБ ПИИ <i>/</i> НАЙМ</span></a><div className="header-right"><span className="header-dot"/> УМНЫЙ БРИФ <span className="header-separator"/> <span className="header-muted">BETA / 01</span></div></header>
    <div className="workspace">
      <div className="topline"><span>ПРОСТРАНСТВО НАЙМА <span className="slash">/</span> НОВАЯ ВАКАНСИЯ</span><span className="topline-right">ДЛЯ ТЕХ, КТО СОЗДАЁТ КОМАНДЫ</span></div>
      {screen === "intro" && <section className="hero-grid" aria-labelledby="intro-title">
        <div className="hero-copy"><div className="eyebrow"><span className="small-diamond"/> ВАКАНСИЯ НАЧИНАЕТСЯ С РАЗГОВОРА</div><h1 id="intro-title">Расскажите о роли.<br/><em>Мы соберём</em><br/>вакансию.</h1><p className="lead">Вы знаете, кто нужен вашей команде. Просто расскажите об этом — мы поможем превратить ваши мысли в понятное описание вакансии.</p><label className="role-label" htmlFor="role">КОГО ИЩЕМ? <span>НЕОБЯЗАТЕЛЬНО</span></label><input id="role" className="role-input" value={role} onChange={e => { setRole(e.target.value); if (result) setStale(true); }} maxLength={200} placeholder="Например, менеджера проектов"/><button className="button primary start-button" onClick={() => setScreen("interview")}>Начать разговор <Icon name="arrow"/></button><p className="privacy-note"><span className="lock-icon">◇</span> 4 вопроса · Можно отвечать голосом или текстом</p></div>
        <div className="hero-visual"><Circle assessments={assessments} recording={false} index={0} intro/><div className="visual-foot"><span>01 / 04</span><span>ОТ ИДЕИ К ВАКАНСИИ</span></div></div>
      </section>}
      {screen === "interview" && <section className="interview-grid" aria-labelledby="question-title">
        <div className="question-column"><div className="eyebrow"><span className="small-diamond"/> РАССКАЖИТЕ О БУДУЩЕМ СОТРУДНИКЕ</div><div className="step-marker"><span>ВОПРОС</span><strong>{String(index + 1).padStart(2, "0")}</strong><span className="step-of">/ 04</span></div><h1 id="question-title" className="question-title">{questions[index].title}</h1><p className="question-hint">{questions[index].hint}</p>
          <div className="answer-card"><div className="answer-heading"><label htmlFor="answer">ВАШ ОТВЕТ</label><span>{voice === "transcribing" ? "РАСПОЗНАЁМ РЕЧЬ..." : voice === "recording" ? "● ЗАПИСЫВАЕМ" : "МОЖНО ИСПРАВИТЬ"}</span></div><textarea id="answer" value={answers[index]} maxLength={6000} disabled={locked} onChange={e => updateAnswer(e.target.value)} placeholder={questions[index].example} rows={4}/><div className="answer-footer"><span>{answers[index].length} / 6000</span><span>ГОЛОС ИЛИ ТЕКСТ</span></div></div>
          {assessment && <div className={`feedback ${assessment.status}`} role="status"><span className="feedback-icon">{assessment.status === "complete" ? "✓" : "✳"}</span><div><strong>{assessment.status === "complete" ? "Ответ раскрыт" : "Можно добавить"}</strong><p>{assessment.feedback}{assessment.clarification ? ` ${assessment.clarification}` : ""}</p></div></div>}
          {error && <p className="error" role="alert">{error}</p>}
          <div className="actions"><button className="button secondary" onClick={previous} disabled={locked}><Icon name="back"/> Назад</button>{assessment ? <button className="button primary" onClick={next} disabled={locked}>{index === 3 ? "Проверить ответы" : "Продолжить"} <Icon name="arrow"/></button> : <button className="button primary" onClick={analyze} disabled={locked || !answers[index].trim()}>{busy ? "Проверяем..." : "Проверить ответ"} <Icon name="arrow"/></button>}</div>
          {(!assessment || analysisFailed) && <button className="text-button skip" onClick={next} disabled={locked}>{analysisFailed ? "Продолжить без проверки" : "Пропустить вопрос"} →</button>}
        </div>
        <div className="interview-visual"><Circle assessments={assessments} recording={voice === "recording"} index={index} intro={false}/><button className={`record-button ${voice === "recording" ? "recording" : ""}`} onClick={voice === "recording" ? stopRecording : startRecording} disabled={busy || voice === "requesting" || voice === "transcribing"}><span className="record-icon">{voice === "recording" ? <span className="stop-square"/> : <Icon name="mic"/>}</span><span>{voice === "requesting" ? "Ожидаем доступ..." : voice === "recording" ? "Остановить запись" : voice === "transcribing" ? "Распознаём..." : "Ответить голосом"}</span></button>{voice === "requesting" ? <button className="text-button" onClick={() => { micRequest.current++; setVoice("idle"); setError("Запрос отменён. Вы можете ввести ответ текстом."); }}>Отменить запрос</button> : <p className="record-caption">{voice === "recording" ? "ГОВОРИТЕ, МЫ ВАС СЛУШАЕМ" : "НАЖМИТЕ, КОГДА БУДЕТЕ ГОТОВЫ"}</p>}<div className="visual-foot"><span>{String(index + 1).padStart(2, "0")} / 04</span><span>ОДИН ВОПРОС ЗА РАЗ</span></div></div>
      </section>}
      {screen === "review" && <section className="review-screen"><div className="eyebrow"><span className="small-diamond"/> ПОСЛЕДНИЙ ШАГ</div><div className="review-heading"><div><h1>Всё верно?<br/><em>Посмотрите ответы.</em></h1><p className="lead">Проверьте, что мы правильно записали ваши мысли. Если что-то забыли, можно вернуться и дополнить.</p></div><div className="review-progress"><strong>{percent}%</strong><span>ПОЛНОТА БРИФА</span></div></div><div className="review-list">{questions.map((q, i) => <button key={q.title} className="review-row" onClick={() => { setIndex(i); setScreen("interview"); setError(""); }}><span className="review-num">0{i + 1}</span><span><strong>{q.title}</strong><small>{answers[i].trim() || "Пока нет ответа"}</small></span><span className="review-edit">ИЗМЕНИТЬ ↗</span></button>)}</div>{error && <p className="error" role="alert">{error}</p>}<div className="actions review-actions"><button className="button secondary" onClick={() => { setIndex(3); setScreen("interview"); }} disabled={busy}><Icon name="back"/> Назад</button><button className="button primary" onClick={generate} disabled={busy}>{busy ? "Собираем вакансию..." : "Создать вакансию"} <Icon name="arrow"/></button></div><p className="review-note">Недостающие сведения отметим в черновике — их можно уточнить позже.</p></section>}
      {screen === "result" && <section className="result-screen"><div className="eyebrow"><span className="small-diamond"/> ГОТОВО К ПРОВЕРКЕ</div><div className="result-heading"><div><h1>Ваша вакансия.<br/><em>Первый черновик.</em></h1><p className="lead">Мы собрали описание из ваших ответов. Прочитайте и отредактируйте текст перед тем, как поделиться им.</p></div><span className="result-stamp"><Icon name="check" size={28}/></span></div>{stale && <p className="stale" role="status">Вы изменили ответы. Обновите черновик, чтобы он учитывал изменения.</p>}<div className="result-card"><div className="result-card-head"><span>ОПИСАНИЕ ВАКАНСИИ</span><span>МОЖНО РЕДАКТИРОВАТЬ</span></div><textarea aria-label="Редактируемое описание вакансии" value={result} onChange={e => { setResult(e.target.value); setEdited(true); }} rows={16}/><div className="result-card-foot"><span>ЧЕРНОВИК / 01</span><span>СОЗДАНО НА ОСНОВЕ ВАШИХ ОТВЕТОВ</span></div></div>{error && <p className="error" role="alert">{error}</p>}<div className="result-actions"><button className="button primary" onClick={copy}><Icon name="copy"/> {copied ? "Скопировано" : "Скопировать текст"}</button><button className="button secondary" onClick={download}><Icon name="download"/> Скачать .txt</button><button className="text-button" onClick={() => { setScreen("review"); setError(""); }}>← Вернуться к ответам</button></div><div className="result-bottom"><p>Проверьте формулировки и добавьте условия, которых пока нет в брифе.</p><button className="text-button" onClick={reset}>Начать заново ↗</button></div></section>}
    </div>
    <footer className="footer"><span>ЛАБ ПИИ <i>/</i> НАЙМ</span><span>СОЗДАНО ДЛЯ ОСМЫСЛЕННОГО НАЙМА <span className="footer-star">✳</span></span></footer>
  </main>;
}
