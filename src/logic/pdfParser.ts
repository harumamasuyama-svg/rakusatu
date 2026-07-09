import type { ExtractedData } from "../types/domain";
import pdfWorkerSrc from "pdfjs-dist/legacy/build/pdf.worker.mjs?url";

type ProgressCallback = (message: string) => void;

const yen = "([0-9０-９,，]+)\\s*円";
const normalizeDigits = (value: string) =>
  value
    .replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xfee0))
    .replace(/[，,]/g, "");

const compact = (text: string) => text.replace(/\s+/g, "");

const findNumber = (text: string, patterns: RegExp[]) => {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return Number(normalizeDigits(match[1]));
  }
  const squashed = compact(text);
  for (const pattern of patterns) {
    const match = squashed.match(pattern);
    if (match?.[1]) return Number(normalizeDigits(match[1]));
  }
  return undefined;
};

const findText = (text: string, patterns: RegExp[]) => {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim().replace(/\s+/g, " ");
  }
  const squashed = compact(text);
  for (const pattern of patterns) {
    const match = squashed.match(pattern);
    if (match?.[1]) return match[1].trim().replace(/\s+/g, " ");
  }
  return undefined;
};

async function renderPageToCanvas(page: any) {
  const viewport = page.getViewport({ scale: 1.6 });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvasを作成できませんでした。");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  await page.render({ canvasContext: context, viewport }).promise;
  return canvas;
}

async function extractTextByOcr(pdf: any, onProgress?: ProgressCallback) {
  const { createWorker } = await import("tesseract.js");
  const maxPages = Math.min(pdf.numPages, 8);
  const ocrBase = `${import.meta.env.BASE_URL}ocr`;
  onProgress?.(`PDF内の文字レイヤーが見つからないため、画像OCRに切り替えています。対象: 先頭${maxPages}ページ`);
  onProgress?.("OCRエンジンと日本語/英語データを読み込んでいます。");
  const worker = await createWorker("jpn+eng", 1, {
    workerPath: `${ocrBase}/worker.min.js`,
    corePath: `${ocrBase}/core`,
    langPath: `${ocrBase}/lang`,
    logger: (message) => {
      if (message.status && message.progress) {
        onProgress?.(`OCR処理中: ${message.status} ${Math.round(message.progress * 100)}%`);
      }
    },
  });
  const chunks: string[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
      onProgress?.(`OCR処理中: ${pageNumber}/${maxPages}ページ`);
      const page = await pdf.getPage(pageNumber);
      const canvas = await renderPageToCanvas(page);
      const result = await worker.recognize(canvas);
      chunks.push(result.data.text || "");
    }
  } finally {
    await worker.terminate();
  }
  return chunks.join("\n");
}

export async function parseAuctionPdf(file: File, onProgress?: ProgressCallback): Promise<ExtractedData> {
  const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as any;
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
  const data = new Uint8Array(await file.arrayBuffer());
  onProgress?.("PDFを開いています。");
  const loadingTask = pdfjs.getDocument({ data });
  const pdf = await loadingTask.promise;
  const chunks: string[] = [];
  for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, 30); pageNumber += 1) {
    if (pageNumber === 1 || pageNumber % 5 === 0) onProgress?.(`文字レイヤーを確認中: ${pageNumber}/${Math.min(pdf.numPages, 30)}ページ`);
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    chunks.push(content.items.map((item: any) => item.str).join(" "));
  }
  let rawText = chunks.join("\n");
  if (rawText.replace(/\s/g, "").length < 80) {
    rawText = await extractTextByOcr(pdf, onProgress);
  }
  const notes: string[] = [];
  const basic = {
    court: findText(rawText, [/(.*?地方裁判所)/]),
    branch: findText(rawText, [/地方裁判所\s*([^\s　]{1,12}支部)/]),
    caseNumber: findText(rawText, [/(令和\s*\d+\s*年\s*[（(]?[ケヌ][）)]?\s*\d+\s*号)/]),
    propertyNumber: findText(rawText, [/物件番号\s*([0-9０-９,\-、]+)/]),
    address: findText(rawText, [/所在地\s*[:：]?\s*([^\n]{6,90})/]),
    propertyType: findText(rawText, [/(宅地|居宅|共同住宅|店舗|事務所|工場|倉庫|土地|建物)/]),
    saleBasePrice: findNumber(rawText, [new RegExp(`売却基準価額\\s*${yen}`), new RegExp(`売却基準価格\\s*${yen}`)]),
    minimumPurchasePrice: findNumber(rawText, [new RegExp(`買受可能価額\\s*${yen}`)]),
    deposit: findNumber(rawText, [new RegExp(`買受申出保証額\\s*${yen}`), new RegExp(`保証金\\s*${yen}`)]),
    occupancy: findText(rawText, [/占有状況\s*[:：]?\s*([^\n]{2,80})/]),
  };
  const labels: Record<string, string> = {
    court: "地方裁判所",
    branch: "支部",
    caseNumber: "事件番号",
    propertyNumber: "物件番号",
    address: "所在地",
    propertyType: "物件種別",
    saleBasePrice: "売却基準価額",
    minimumPurchasePrice: "買受可能価額",
    deposit: "保証金",
    occupancy: "占有状況",
  };
  const missing = Object.entries(basic)
    .filter(([, value]) => value === undefined || value === "")
    .map(([key]) => labels[key] || key);
  if (rawText.replace(/\s/g, "").length < 80) {
    notes.push("PDF内の文字をほとんど取得できませんでした。画像PDFやスキャンPDFの場合は、主要項目を手入力してください。");
  } else if (missing.length > 0) {
    notes.push(`自動抽出できなかった項目: ${missing.join("、")}。基本情報画面で手入力できます。`);
  }
  return { rawText, basic, notes };
}
