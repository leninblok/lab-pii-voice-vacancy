import { PDFDocument, rgb, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { DocumentData } from "./vacancy";

export function splitPdfWords(paragraph: string): string[] { return paragraph.split(/[ \t]+/).filter(Boolean); }

export async function createPdf(data: DocumentData, fontBytes: ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  const pdf = await PDFDocument.create(); pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(fontBytes, { subset: true });
  const width = 595.28, height = 841.89, left = 64, right = 64, bottom = 64, maxWidth = width - left - right;
  let page: PDFPage = pdf.addPage([width, height]); let y = height - 70;
  const nextPage = () => { page = pdf.addPage([width, height]); y = height - 70; };
  const wrap = (text: string, size: number, indent = 0): string[] => {
    const out: string[] = []; for (const paragraph of text.split("\n")) { const words = splitPdfWords(paragraph); let line = ""; for (const word of words) { const candidate = line ? `${line} ${word}` : word; if (line && font.widthOfTextAtSize(candidate, size) > maxWidth - indent) { out.push(line); line = word; } else line = candidate; } out.push(line); } return out;
  };
  const line = (text: string, size: number, indent = 0) => { if (y < bottom + size * 1.5) nextPage(); page.drawText(text, {x: left + indent, y, size, font, color: rgb(.12,.12,.12)}); y -= size * 1.5; };
  const drawText = (text: string, size: number, indent = 0) => { for (const l of wrap(text,size,indent)) line(l,size,indent); };
  if (data.title.trim()) { drawText(data.title, 24); y -= 14; }
  for (let i = 0; i < data.blocks.length; i++) {
    const block = data.blocks[i]; if (!block.text.trim()) continue;
    if (block.type === "heading") { const needed = 21 * 1.5 * (wrap(block.text, 15).length + 2); if (y - needed < bottom) nextPage(); y -= 12; drawText(block.text, 15); y -= 3; }
    else if (block.type === "list") { for (const item of block.text.split("\n").filter(Boolean)) { const lines = wrap(item, 11, 16); if (y - lines.length * 16.5 < bottom && lines.length * 16.5 < height - 140) nextPage(); if (y < bottom + 20) nextPage(); page.drawText("•", { x:left, y, size:11, font }); for (const l of lines) line(l,11,16); y -= 3; } y -= 8; }
    else { drawText(block.text,11); y -= 10; }
  }
  const pages = pdf.getPages(); if (pages.length > 1) pages.forEach((p, i) => { const label = String(i + 1); p.drawText(label, {x: width - right - font.widthOfTextAtSize(label,9), y: 36, size: 9, font, color: rgb(.45,.45,.45)}); });
  return pdf.save();
}
export async function downloadPdf(document: DocumentData): Promise<void> {
  const response = await fetch("/fonts/IBMPlexSans-Regular.ttf"); if (!response.ok) throw new Error("FONT_UNAVAILABLE");
  const bytes = await createPdf(document, await response.arrayBuffer());
  const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" }); const url = URL.createObjectURL(blob);
  const a = window.document.createElement("a"); a.href = url; a.download = "vacancy.pdf"; window.document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
}
