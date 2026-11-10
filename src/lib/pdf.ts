import type { DocumentData } from "./vacancy";

/** Readable and portable: the vacancy title and its latest edit date. */
export function pdfFilename(document: DocumentData, updatedAt = Date.now()): string {
  const title = document.title
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90) || "Без названия";
  const date = new Date(updatedAt);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `Вакансия — ${title} — ${day}.${month}.${date.getFullYear()}.pdf`;
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** The same elements and classes that VacancyEditor renders on screen. */
export function printDocumentHtml(document: DocumentData): string {
  const blocks = document.blocks.map(block => {
    if (block.type === "heading") return `<h2 class="vacancy-editor__heading">${escapeHtml(block.text)}</h2>`;
    if (block.type === "list") return `<ul class="vacancy-editor__list">${block.text.split("\n").filter(Boolean).map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
    return `<p class="vacancy-editor__paragraph">${escapeHtml(block.text)}</p>`;
  }).join("");
  return `<article class="vacancy-editor print-vacancy"><h1 class="vacancy-editor__title">${escapeHtml(document.title)}</h1>${blocks}</article>`;
}

function cssWithAbsoluteUrls(css: string, stylesheetUrl: string) {
  return css.replace(/url\((['"]?)([^'")]+)\1\)/g, (full, quote: string, value: string) => {
    if (/^(?:data:|https?:|#|blob:)/i.test(value)) return full;
    return `url(${quote}${new URL(value, stylesheetUrl).href}${quote})`;
  });
}

/**
 * A print popup has the about:blank origin. Linking a compiled stylesheet into
 * it makes relative font URLs resolve against about:blank, which silently
 * falls back to Times. Fetch the same styles from the app and inline them.
 */
async function sourceStyles() {
  const nodes = Array.from(window.document.querySelectorAll<HTMLLinkElement | HTMLStyleElement>('link[rel="stylesheet"], style'));
  const styles = await Promise.all(nodes.map(async node => {
    if (node instanceof HTMLStyleElement) return node.textContent || "";
    try {
      const response = await fetch(node.href);
      if (!response.ok) throw new Error("Could not load stylesheet");
      return cssWithAbsoluteUrls(await response.text(), node.href);
    } catch {
      // A linked fallback is still useful for third-party stylesheets.
      return `@import url("${node.href}");`;
    }
  }));
  return `<style>${styles.join("\n").replace(/<\/style/gi, "<\\/style")}</style>`;
}

/**
 * Browser printing uses the identical Inter font, list markers and CSS metrics
 * as the editor. The browser owns the final Save as PDF dialog.
 */
export function printPdf(document: DocumentData, updatedAt?: number): void {
  const popup = window.open("", "_blank");
  if (!popup) throw new Error("PRINT_WINDOW_BLOCKED");
  const name = pdfFilename(document, updatedAt).replace(/\.pdf$/i, "");
  void sourceStyles().then(styles => {
    if (popup.closed) return;
    popup.document.write(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${escapeHtml(name)}</title>${styles}<style>
    @page { size: A4; margin: 10mm; }
    html, body { min-height: 0 !important; background: #fff !important; }
    body { margin: 0 !important; color: var(--ink, #050505) !important; }
    .print-document { width: min(720px, 100%); margin: 0 auto; padding-top: 0; }
    .print-vacancy { min-height: 0 !important; }
    @media print {
      *, *::before, *::after { animation: none !important; transition: none !important; }
      .print-document { break-inside: auto; }
    }
  </style></head><body><main class="print-document">${printDocumentHtml(document)}</main></body></html>`);
    popup.document.close();
    const openDialog = () => {
      popup.focus();
      popup.addEventListener("afterprint", () => popup.close(), { once: true });
      popup.print();
    };
    void (popup.document.fonts?.ready ?? Promise.resolve()).then(() => window.setTimeout(openDialog, 0));
  }).catch(() => popup.close());
}
