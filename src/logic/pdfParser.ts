import type { ExtractedData } from "../types/domain";
import pdfWorkerSrc from "pdfjs-dist/legacy/build/pdf.worker.mjs?url";

const yen = "([0-9０-９,，]+)\\s*円";
const normalizeDigits = (value: string) =>
  value
    .replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xfee0))
    .replace(/[，,]/g, "");

const findNumber = (text: string, patterns: RegExp[]) => {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return Number(normalizeDigits(match[1]));
  }
  return undefined;
};

const findText = (text: string, patterns: RegExp[]) => {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim().replace(/\s+/g, " ");
  }
  return undefined;
};

export async function parseAuctionPdf(file: File): Promise<ExtractedData> {
  const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as any;
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({ data });
  const pdf = await loadingTask.promise;
  const chunks: string[] = [];
  for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, 30); pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    chunks.push(content.items.map((item: any) => item.str).join(" "));
  }
  const rawText = chunks.join("\n");
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
  Object.entries(basic).forEach(([key, value]) => {
    if (value === undefined || value === "") notes.push(`${key} は抽出できませんでした。要確認です。`);
  });
  return { rawText, basic, notes };
}
