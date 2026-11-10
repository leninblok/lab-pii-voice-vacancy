"use client";

import { useLayoutEffect, useRef, useState, type ClipboardEvent, type FormEvent } from "react";
import type { Block, DocumentData } from "@/lib/vacancy";

/** One editable surface; its children retain the structured document used by export and AI. */
export type VacancyEditorProps = {
  document: DocumentData;
  documentId: string;
  onChange: (document: DocumentData, changedIds: string[]) => void;
  disabled?: boolean;
  changedIds?: string[];
};

const keyFor = () => crypto.randomUUID();
const blockClasses: Record<Block["type"], string> = {
  heading: "vacancy-editor__heading",
  paragraph: "vacancy-editor__paragraph",
  list: "vacancy-editor__list",
};

/** Never insert model output or pasted content as HTML. */
function buildEditor(root: HTMLElement, document: DocumentData, previous?: DocumentData, replaying = new Set<string>()) {
  const fragment = window.document.createDocumentFragment();
  const title = window.document.createElement("h1");
  title.className = "vacancy-editor__title";
  title.dataset.role = "title";
  title.textContent = replaying.has("title") ? previous?.title ?? "" : document.title;
  fragment.appendChild(title);

  const previousBlocks = new Map(previous?.blocks.map(block => [block.id, block]));

  for (const block of document.blocks) {
    const node = window.document.createElement(block.type === "heading" ? "h2" : block.type === "list" ? "ul" : "p");
    node.className = blockClasses[block.type];
    node.dataset.blockId = block.id;
    const prior = previousBlocks.get(block.id);
    const displayText = replaying.has(block.id) ? (prior?.type === block.type ? prior.text : "") : block.text;
    if (block.type === "list") {
      for (const text of displayText.split("\n").filter(Boolean)) {
        const item = window.document.createElement("li");
        item.textContent = text;
        node.appendChild(item);
      }
    } else {
      node.textContent = displayText;
    }
    fragment.appendChild(node);
  }
  root.replaceChildren(fragment);
}

type Schedule = (callback: () => void, delay: number) => void;

function changedRange(before: string, after: string) {
  let prefixLength = 0;
  const shortest = Math.min(before.length, after.length);
  while (prefixLength < shortest && before[prefixLength] === after[prefixLength]) prefixLength++;
  let suffixLength = 0;
  while (suffixLength < shortest - prefixLength && before[before.length - 1 - suffixLength] === after[after.length - 1 - suffixLength]) suffixLength++;
  return {
    prefix: after.slice(0, prefixLength),
    removed: before.slice(prefixLength, before.length - suffixLength),
    inserted: after.slice(prefixLength, after.length - suffixLength),
    suffix: after.slice(after.length - suffixLength),
  };
}

/** Play only the changed characters. The untouched prefix and suffix stay still. */
function replayText(node: HTMLElement, before: string, after: string, schedule: Schedule, done: () => void) {
  if (before === after) { done(); return; }
  const change = changedRange(before, after);
  const deleted = window.document.createElement("span");
  deleted.className = "vacancy-editor__deleted";
  deleted.textContent = change.removed;
  const typed = window.document.createElement("span");
  typed.className = "vacancy-editor__typed";
  node.replaceChildren(window.document.createTextNode(change.prefix), deleted, typed, window.document.createTextNode(change.suffix));

  const eraseStep = Math.max(1, Math.ceil(change.removed.length / 34));
  const typeStep = Math.max(1, Math.ceil(change.inserted.length / 42));
  const erase = (visible: number) => {
    deleted.textContent = change.removed.slice(0, visible);
    if (visible > 0) schedule(() => erase(Math.max(0, visible - eraseStep)), 16);
    else startTyping(0);
  };
  const startTyping = (visible: number) => {
    typed.classList.add("is-typing");
    typed.textContent = change.inserted.slice(0, visible);
    if (visible < change.inserted.length) schedule(() => startTyping(Math.min(change.inserted.length, visible + typeStep)), 16);
    else done();
  };
  erase(change.removed.length);
}

function replayList(node: HTMLElement, before: string, after: string, schedule: Schedule, done: () => void) {
  const beforeLines = before.split("\n").filter(Boolean);
  const afterLines = after.split("\n").filter(Boolean);
  const length = Math.max(beforeLines.length, afterLines.length);
  if (!length) { done(); return; }
  const items = Array.from(node.querySelectorAll("li"));
  let remaining = length;
  const finish = () => { remaining--; if (remaining === 0) done(); };
  for (let index = 0; index < length; index++) {
    let item = items[index];
    if (!item) { item = window.document.createElement("li"); node.appendChild(item); }
    const oldText = beforeLines[index] || "";
    const newText = afterLines[index] || "";
    const current = item;
    schedule(() => replayText(current, oldText, newText, schedule, () => {
      if (!newText) current.remove();
      finish();
    }), index * 70);
  }
}

function textOf(node: HTMLElement): string {
  return (node.innerText ?? node.textContent ?? "").replace(/\r\n?/g, "\n");
}

/** Map browser editing markup back to typed blocks while keeping existing IDs. */
function readEditor(root: HTMLElement): DocumentData {
  let title = "";
  let foundTitle = false;
  const blocks: Block[] = [];
  const seen = new Set<string>();
  const uniqueId = (element?: HTMLElement): string => {
    let id = element?.dataset.blockId || "";
    if (!id || seen.has(id)) id = keyFor();
    seen.add(id);
    if (element) element.dataset.blockId = id;
    return id;
  };
  const add = (element: HTMLElement | undefined, type: Block["type"], text: string) => {
    if (element) {
      element.classList.remove("vacancy-editor__title", ...Object.values(blockClasses));
      element.classList.add(blockClasses[type]);
    }
    blocks.push({ id: uniqueId(element), type, text });
  };

  for (const child of Array.from(root.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const value = child.textContent || "";
      if (!foundTitle) { title = value; foundTitle = true; }
      else if (value) add(undefined, "paragraph", value);
      continue;
    }
    if (!(child instanceof HTMLElement)) continue;
    const tag = child.tagName;
    if (!foundTitle && (child.dataset.role === "title" || tag === "H1")) {
      title = textOf(child);
      foundTitle = true;
      continue;
    }
    // If the title was selected and deleted, the first newly typed line becomes it.
    if (!foundTitle && !root.querySelector('[data-role="title"], h1')) {
      title = textOf(child);
      foundTitle = true;
      child.dataset.role = "title";
      continue;
    }
    if (child.dataset.role === "title") delete child.dataset.role;
    if (tag === "UL" || tag === "OL") {
      const items = Array.from(child.children).filter(item => item.tagName === "LI");
      add(child, "list", items.length ? items.map(item => textOf(item as HTMLElement)).join("\n") : textOf(child));
    } else {
      add(child, /^H[2-6]$/.test(tag) ? "heading" : "paragraph", textOf(child));
    }
  }
  return { title, blocks };
}

function changedBlockIds(before: DocumentData, after: DocumentData): string[] {
  const changed = new Set<string>();
  if (before.title !== after.title) changed.add("title");
  const previous = new Map(before.blocks.map(block => [block.id, block]));
  for (const block of after.blocks) {
    const old = previous.get(block.id);
    if (!old || old.type !== block.type || old.text !== block.text) changed.add(block.id);
    previous.delete(block.id);
  }
  for (const id of previous.keys()) changed.add(id);
  return [...changed];
}

export default function VacancyEditor({ document, documentId, onChange, disabled = false, changedIds = [] }: VacancyEditorProps) {
  const root = useRef<HTMLElement>(null);
  const previous = useRef<DocumentData>(document);
  const lastRendered = useRef("");
  const currentId = useRef("");
  const onChangeRef = useRef(onChange);
  const [isReplaying, setIsReplaying] = useState(false);
  onChangeRef.current = onChange;

  // Keep native selection and undo intact for edits originating inside the editor.
  // Only external changes (AI, history, switching vacancy) replace its DOM.
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const serialized = JSON.stringify(document);
    const needsRender = currentId.current !== documentId || lastRendered.current !== serialized;
    const replaying = new Set(changedIds);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const canReplay = !reducedMotion && needsRender && currentId.current === documentId && lastRendered.current !== "" && replaying.size > 0;
    const prior = previous.current;
    if (needsRender) {
      buildEditor(element, document, canReplay ? prior : undefined, canReplay ? replaying : undefined);
      currentId.current = documentId;
      lastRendered.current = serialized;
    }
    previous.current = document;
    if (!canReplay) { setIsReplaying(false); return; }

    let cancelled = false;
    const timers: number[] = [];
    const schedule: Schedule = (callback, delay) => {
      const timer = window.setTimeout(() => { if (!cancelled) callback(); }, delay);
      timers.push(timer);
    };
    const changes: Array<{ node: HTMLElement; before: string; after: string; list: boolean }> = [];
    const priorBlocks = new Map(prior.blocks.map(block => [block.id, block]));
    element.querySelectorAll<HTMLElement>('[data-block-id], [data-role="title"]').forEach(node => {
      const id = node.dataset.role === "title" ? "title" : node.dataset.blockId || "";
      if (!replaying.has(id)) return;
      if (id === "title") {
        changes.push({ node, before: prior.title, after: document.title, list: false });
        return;
      }
      const next = document.blocks.find(block => block.id === id);
      const old = priorBlocks.get(id);
      if (!next) return;
      changes.push({ node, before: old?.type === next.type ? old.text : "", after: next.text, list: next.type === "list" });
    });
    if (!changes.length) { setIsReplaying(false); return; }
    setIsReplaying(true);
    let remaining = changes.length;
    const complete = () => {
      remaining--;
      if (!cancelled && remaining === 0) setIsReplaying(false);
    };
    changes.forEach((change, index) => schedule(() => {
      if (change.list) replayList(change.node, change.before, change.after, schedule, complete);
      else replayText(change.node, change.before, change.after, schedule, complete);
    }, index * 120));
    return () => {
      cancelled = true;
      timers.forEach(timer => window.clearTimeout(timer));
    };
  }, [document, documentId, changedIds]);

  const handleInput = (event: FormEvent<HTMLElement>) => {
    const next = readEditor(event.currentTarget);
    const changed = changedBlockIds(previous.current, next);
    if (!changed.length) return;
    previous.current = next;
    lastRendered.current = JSON.stringify(next);
    onChangeRef.current(next, changed);
  };

  const handlePaste = (event: ClipboardEvent<HTMLElement>) => {
    event.preventDefault();
    const text = event.clipboardData.getData("text/plain");
    // insertText participates in the browser's native editing history and triggers input.
    window.document.execCommand("insertText", false, text);
  };

  return <article
    ref={root}
    className="vacancy-editor"
    contentEditable={!disabled && !isReplaying}
    suppressContentEditableWarning
    role="textbox"
    aria-label="Текст вакансии"
    aria-multiline="true"
    aria-readonly={disabled || isReplaying}
    spellCheck
    onInput={handleInput}
    onPaste={handlePaste}
  />;
}
