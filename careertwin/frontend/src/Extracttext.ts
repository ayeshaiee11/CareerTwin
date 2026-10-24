// Reads plain text out of a resume or job description file, entirely in the browser.
// The file itself is never uploaded; only the extracted text is kept.
export const MAX_FILE_MB = 30;
export const MAX_CHARS = 20_000; // same limit as the backend

export type Extracted = { text: string; note: string };

const tidy = (s: string) => s.replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

async function fromPdf(file: File): Promise<{ text: string; pages: number }> {
  const pdfjs: any = await import("pdfjs-dist");
  const worker: any = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  let text = "";
  try {
    for (let i = 1; i <= pdf.numPages && text.length <= MAX_CHARS * 1.5; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      for (const it of content.items as any[]) if (typeof it.str === "string") text += it.str + (it.hasEOL ? "\n" : " ");
      text += "\n";
    }
    return { text, pages: pdf.numPages };
  } finally { pdf.destroy?.(); }
}

async function fromDocx(file: File): Promise<string> {
  const m: any = await import("mammoth");
  const mammoth = m.default ?? m;
  const r = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return r.value as string;
}

export async function extractText(file: File): Promise<Extracted> {
  if (file.size > MAX_FILE_MB * 1024 * 1024) throw new Error(`That file is larger than ${MAX_FILE_MB} MB. Try a smaller one, or paste the text instead.`);
  const name = file.name.toLowerCase();
  let raw = "", kind = "", extra = "";
  try {
    if (name.endsWith(".pdf") || file.type === "application/pdf") {
      const r = await fromPdf(file); raw = r.text; kind = "PDF"; extra = `${r.pages} page${r.pages === 1 ? "" : "s"}, `;
    } else if (name.endsWith(".docx")) {
      raw = await fromDocx(file); kind = "Word";
    } else if (name.endsWith(".doc")) {
      throw new Error("Old .doc files are not supported. In Word choose Save As, pick .docx or PDF, then upload that.");
    } else if (name.endsWith(".txt") || name.endsWith(".md") || file.type.startsWith("text/")) {
      raw = await file.text(); kind = "Text";
    } else {
      throw new Error("Please choose a PDF, Word (.docx) or text file.");
    }
  } catch (e) {
    const err = e as Error;
    if (err.name === "PasswordException") throw new Error("This PDF is password protected. Remove the password and try again.");
    if (err.message.startsWith("Old .doc") || err.message.startsWith("Please choose")) throw err;
    throw new Error("Could not read that file. It may be damaged. Try another copy, or paste the text instead.");
  }
  const text = tidy(raw);
  if (!text) throw new Error("No selectable text was found. A scanned PDF is just a picture, so please paste the text instead.");
  const truncated = text.length > MAX_CHARS;
  const kept = truncated ? text.slice(0, MAX_CHARS) : text;
  return {
    text: kept,
    note: `${kind}, ${extra}${kept.length.toLocaleString()} characters read.` + (truncated ? ` Only the first ${MAX_CHARS.toLocaleString()} characters were kept.` : ""),
  };
}