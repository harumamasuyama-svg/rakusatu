import { useEffect, useMemo, useRef, useState } from "react";
import { FileDown, FileText, FolderOpen, Save, Settings, Upload, Wand2 } from "lucide-react";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { calculateProject, simulateBidPrices, tsubo } from "./logic/calculations";
import { createDefaultProject } from "./logic/defaults";
import { parseAuctionPdf } from "./logic/pdfParser";
import { loadProjects, saveProject } from "./storage/localStore";
import type { EditableNumber, EditableText, ProjectData, RentCase } from "./types/domain";

const yen = new Intl.NumberFormat("ja-JP");
const logoSrc = `${import.meta.env.BASE_URL}logo.png`;
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const money = (v: number) => `${yen.format(Math.round(v))}円`;
const man = (v: number) => `${yen.format(Math.round(v / 10000))}万円`;
const num = (v: unknown) => Number(String(v ?? "").replace(/[^\d.-]/g, "")) || 0;

const sourceLabel = (source: EditableText["source"] | EditableNumber["source"]) =>
  source === "pdf" ? "PDF候補" : source === "manual" ? "手修正" : "要確認";

function Field({
  label,
  value,
  unit,
  onChange,
  source,
  type = "text",
}: {
  label: string;
  value: string | number;
  unit?: string;
  onChange: (value: string) => void;
  source?: EditableText["source"] | EditableNumber["source"];
  type?: "text" | "number";
}) {
  return (
    <label className="field">
      <span>
        {label}
        {source && <em className={`source ${source}`}>{sourceLabel(source)}</em>}
      </span>
      <div className="inputWithUnit">
        <input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
        {unit && <b>{unit}</b>}
      </div>
    </label>
  );
}

function Splash({ done }: { done: () => void }) {
  useEffect(() => {
    const seen = sessionStorage.getItem("rakusatsu.splash.seen");
    const timer = window.setTimeout(
      () => {
        sessionStorage.setItem("rakusatsu.splash.seen", "1");
        done();
      },
      seen ? 1200 : 1900,
    );
    return () => window.clearTimeout(timer);
  }, [done]);

  return (
    <div className="splash">
      <div className="splashInner">
        <img src={logoSrc} alt="ラクサツ！" />
        <h1>ラクサツ！</h1>
        <p>競売不動産 入札価格シミュレーション</p>
      </div>
    </div>
  );
}

export function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [project, setProject] = useState<ProjectData>(() => createDefaultProject());
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [active, setActive] = useState("取込");
  const [importPreview, setImportPreview] = useState<Record<string, unknown>[]>([]);
  const [pdfStatus, setPdfStatus] = useState<"idle" | "reading" | "done" | "error">("idle");
  const [pdfMessage, setPdfMessage] = useState("");
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => setProjects(loadProjects()), []);

  const result = useMemo(() => calculateProject(project), [project]);
  const simulationRows = useMemo(() => simulateBidPrices(project), [project]);

  const patch = (next: Partial<ProjectData>) => setProject((current) => ({ ...current, ...next }));
  const patchBasicText = (key: keyof ProjectData["basic"], value: string) =>
    setProject((current) => ({
      ...current,
      basic: { ...current.basic, [key]: { value, source: "manual" } },
    }));
  const patchBasicNumber = (key: keyof ProjectData["basic"], value: string) =>
    setProject((current) => ({
      ...current,
      basic: { ...current.basic, [key]: { value: num(value), source: "manual" } },
    }));

  async function handlePdf(file?: File) {
    if (!file) return;
    setPdfStatus("reading");
    setPdfMessage(`${file.name} を読み取っています...`);
    try {
      const extracted = await parseAuctionPdf(file, setPdfMessage);
      setProject((current) => {
        const next = { ...current, extracted };
        const basic = { ...current.basic };
        Object.entries(extracted.basic).forEach(([key, value]) => {
          if (value === undefined) return;
          (basic as any)[key] = { value, source: "pdf" };
          if (!current.costs.bidPrice && key === "minimumPurchasePrice") next.costs = { ...next.costs, bidPrice: Number(value) || 0 };
        });
        next.basic = basic;
        if (basic.saleBasePrice.value && !next.costs.bidPrice) next.costs = { ...next.costs, bidPrice: basic.saleBasePrice.value };
        next.name = basic.address.value || file.name.replace(/\.pdf$/i, "");
        return next;
      });
      setPdfStatus("done");
      const extractedCount = Object.values(extracted.basic).filter((value) => value !== undefined && value !== "").length;
      const textLength = extracted.rawText.replace(/\s/g, "").length;
      if (extractedCount > 0) {
        setPdfMessage(`PDFの読み取りが完了しました。${extractedCount}件の候補値を反映しました。`);
        setActive("基本情報");
      } else if (textLength > 0) {
        setPdfMessage(`OCRで文字は取得しましたが、主要項目として自動反映できた候補は0件でした。下のOCRテキストを確認し、基本情報画面で手入力してください。`);
      } else {
        setPdfMessage("PDFから文字を取得できませんでした。画像品質や保護設定により、手入力が必要です。");
      }
    } catch (error) {
      console.error(error);
      setPdfStatus("error");
      setPdfMessage("PDFを読み取れませんでした。暗号化PDF、画像PDF、または未対応形式の可能性があります。主要項目は手入力できます。");
    }
  }

  function autoFillCosts() {
    const landValue =
      project.land.landValue ||
      project.land.landAreaSqm * project.land.standardLandPricePerSqm * project.land.individualFactor * project.land.buildingLandDeduction;
    const buildingValue =
      project.building.buildingValue ||
      project.building.buildingAreaSqm * project.building.replacementCostPerSqm * project.building.currentValueRate;
    const registrationTax =
      landValue * project.settings.registrationTaxRateLand + buildingValue * project.settings.registrationTaxRateBuilding;
    const acquisitionTax =
      landValue * project.settings.acquisitionTaxRateLand + buildingValue * project.settings.acquisitionTaxRateBuilding;
    const fee = Math.max(project.settings.judicialScrivenerMinimum, project.costs.bidPrice * project.settings.judicialScrivenerRate);
    patch({
      costs: {
        ...project.costs,
        registrationTax,
        acquisitionTax,
        judicialScrivenerFee: fee,
        reserveCost: project.costs.bidPrice * project.settings.reserveRate,
      },
    });
  }

  function updateRentCase(id: string, next: Partial<RentCase>) {
    patch({
      rentCases: project.rentCases.map((item) => {
        if (item.id !== id) return item;
        const merged = { ...item, ...next };
        const areaTsubo = merged.areaTsubo || tsubo(merged.areaSqm);
        return { ...merged, areaTsubo, rentPerTsubo: areaTsubo ? merged.monthlyRent / areaTsubo : 0 };
      }),
    });
  }

  function importRows(rows: Record<string, unknown>[]) {
    setImportPreview(rows.slice(0, 5));
    const aliases: Record<string, string[]> = {
      name: ["事例名", "名称", "物件名"],
      address: ["所在地", "住所"],
      usage: ["用途", "種別"],
      monthlyRent: ["月額賃料", "賃料", "家賃"],
      areaSqm: ["面積㎡", "面積", "㎡"],
      areaTsubo: ["面積坪", "坪数", "坪"],
      rentPerTsubo: ["坪単価"],
    };
    const find = (row: Record<string, unknown>, key: string) => {
      const names = aliases[key] || [];
      const hit = Object.keys(row).find((column) => names.some((name) => column.includes(name)));
      return hit ? row[hit] : "";
    };
    const cases = rows
      .map((row, index) => {
        const areaSqm = num(find(row, "areaSqm"));
        const areaTsubo = num(find(row, "areaTsubo")) || tsubo(areaSqm);
        const monthlyRent = num(find(row, "monthlyRent"));
        const rentPerTsubo = num(find(row, "rentPerTsubo")) || (areaTsubo ? monthlyRent / areaTsubo : 0);
        return {
          id: crypto.randomUUID(),
          adopted: true,
          name: String(find(row, "name") || `取込事例 ${index + 1}`),
          address: String(find(row, "address") || ""),
          usage: String(find(row, "usage") || ""),
          monthlyRent,
          areaSqm,
          areaTsubo,
          rentPerTsubo,
        };
      })
      .filter((item) => item.monthlyRent || item.rentPerTsubo);
    patch({ rentCases: [...project.rentCases, ...cases] });
  }

  async function handleExcelCsv(file?: File) {
    if (!file) return;
    if (file.name.match(/\.csv$/i)) {
      const text = await file.text();
      const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
      importRows(parsed.data as Record<string, unknown>[]);
      return;
    }
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    importRows(XLSX.utils.sheet_to_json(sheet));
  }

  async function exportPdf() {
    if (!reportRef.current) return;
    const canvas = await html2canvas(reportRef.current, { scale: 2, backgroundColor: "#ffffff" });
    const img = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "mm", "a4");
    pdf.addImage(img, "PNG", 0, 0, 210, 297);
    pdf.save(`rakusatsu-${project.basic.caseNumber.value || "report"}.pdf`);
  }

  function persist() {
    const saved = saveProject(project);
    setProject(saved);
    setProjects(loadProjects());
  }

  if (showSplash) return <Splash done={() => setShowSplash(false)} />;

  const tabs = ["取込", "基本情報", "積算価格", "想定賃料", "経費・融資", "入札価格決定", "投資判断", "PDF出力", "設定"];

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img src={logoSrc} alt="ラクサツ！" />
          <strong>ラクサツ！</strong>
        </div>
        <div className="screenName">{active}</div>
        <div className="actions">
          <button onClick={persist}>
            <Save size={17} /> 保存
          </button>
          <button onClick={exportPdf}>
            <FileDown size={17} /> PDF出力
          </button>
          <button onClick={() => setActive("設定")}>
            <Settings size={17} /> 設定
          </button>
        </div>
      </header>

      <aside className="sidebar">
        {tabs.map((tab) => (
          <button key={tab} className={active === tab ? "active" : ""} onClick={() => setActive(tab)}>
            {tab}
          </button>
        ))}
        <div className="saved">
          <h3>保存済み</h3>
          {projects.map((item) => (
            <button key={item.id} onClick={() => setProject(item)}>
              <FolderOpen size={14} /> {item.name || "無題"}
            </button>
          ))}
        </div>
      </aside>

      <main>
        <section className="summaryBand">
          <div>
            <span>推奨入札価格</span>
            <strong>{man(result.recommendedBidPrice)}</strong>
          </div>
          <div>
            <span>絶対上限価格</span>
            <strong>{man(result.absoluteBidLimit)}</strong>
          </div>
          <div>
            <span>落札予想価格</span>
            <strong>{man(result.expectedWinningPrice)}</strong>
          </div>
          <div>
            <span>総合評価</span>
            <strong className={`grade grade${result.grade}`}>{result.grade}</strong>
          </div>
        </section>

        {active === "取込" && (
          <section className="panel uploadPanel">
            <div>
              <img src={logoSrc} alt="ラクサツ！" className="homeLogo" />
              <h1>3点セットPDFから入札判断を開始</h1>
              <p>抽出できた候補値を表示し、未抽出項目は要確認として手入力できます。外部サイトからの自動取得や無断スクレイピングは行いません。</p>
            </div>
            <label className="drop">
              <Upload size={34} />
              <strong>3点セットPDFを選択</strong>
              <span>地方裁判所、事件番号、価額などを候補抽出します</span>
              <input
                type="file"
                accept="application/pdf"
                onChange={(event) => {
                  handlePdf(event.target.files?.[0]);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            {pdfMessage && <p className={pdfStatus === "error" ? "warning" : "notice"}>{pdfMessage}</p>}
            {project.extracted && (
              <div className="extracted">
                <h2>抽出結果</h2>
                {project.extracted.notes.map((note) => (
                  <span key={note}>{note}</span>
                ))}
                <button onClick={() => setActive("基本情報")}>基本情報を確認する</button>
                <details className="ocrPreview">
                  <summary>OCR/抽出テキストを確認</summary>
                  <textarea readOnly value={project.extracted.rawText.slice(0, 6000) || "抽出テキストはありません。"} />
                </details>
              </div>
            )}
          </section>
        )}

        {active === "基本情報" && (
          <section className="gridForm">
            <Field label="地方裁判所" value={project.basic.court.value} source={project.basic.court.source} onChange={(v) => patchBasicText("court", v)} />
            <Field label="支部" value={project.basic.branch.value} source={project.basic.branch.source} onChange={(v) => patchBasicText("branch", v)} />
            <Field label="事件番号" value={project.basic.caseNumber.value} source={project.basic.caseNumber.source} onChange={(v) => patchBasicText("caseNumber", v)} />
            <Field label="物件番号" value={project.basic.propertyNumber.value} source={project.basic.propertyNumber.source} onChange={(v) => patchBasicText("propertyNumber", v)} />
            <Field label="所在地" value={project.basic.address.value} source={project.basic.address.source} onChange={(v) => patchBasicText("address", v)} />
            <Field label="物件種別" value={project.basic.propertyType.value} source={project.basic.propertyType.source} onChange={(v) => patchBasicText("propertyType", v)} />
            <Field label="売却基準価額" type="number" unit="円" value={project.basic.saleBasePrice.value} source={project.basic.saleBasePrice.source} onChange={(v) => patchBasicNumber("saleBasePrice", v)} />
            <Field label="買受可能価額" type="number" unit="円" value={project.basic.minimumPurchasePrice.value} source={project.basic.minimumPurchasePrice.source} onChange={(v) => patchBasicNumber("minimumPurchasePrice", v)} />
            <Field label="保証金" type="number" unit="円" value={project.basic.deposit.value} source={project.basic.deposit.source} onChange={(v) => patchBasicNumber("deposit", v)} />
            <Field label="占有状況" value={project.basic.occupancy.value} source={project.basic.occupancy.source} onChange={(v) => patchBasicText("occupancy", v)} />
          </section>
        )}

        {active === "積算価格" && (
          <section className="twoCol">
            <div className="panel">
              <h2>土地評価</h2>
              <Field label="土地面積" type="number" unit="㎡" value={project.land.landAreaSqm} onChange={(v) => patch({ land: { ...project.land, landAreaSqm: num(v) } })} />
              <Field label="標準画地価格" type="number" unit="円/㎡" value={project.land.standardLandPricePerSqm} onChange={(v) => patch({ land: { ...project.land, standardLandPricePerSqm: num(v) } })} />
              <Field label="個別格差" type="number" unit="倍" value={project.land.individualFactor} onChange={(v) => patch({ land: { ...project.land, individualFactor: num(v) } })} />
              <Field label="建付減価" type="number" unit="倍" value={project.land.buildingLandDeduction} onChange={(v) => patch({ land: { ...project.land, buildingLandDeduction: num(v) } })} />
            </div>
            <div className="panel">
              <h2>建物評価</h2>
              <Field label="建物面積" type="number" unit="㎡" value={project.building.buildingAreaSqm} onChange={(v) => patch({ building: { ...project.building, buildingAreaSqm: num(v) } })} />
              <Field label="再調達原価" type="number" unit="円/㎡" value={project.building.replacementCostPerSqm} onChange={(v) => patch({ building: { ...project.building, replacementCostPerSqm: num(v) } })} />
              <Field label="経過年数" type="number" unit="年" value={project.building.elapsedYears} onChange={(v) => patch({ building: { ...project.building, elapsedYears: num(v) } })} />
              <Field label="現価率" type="number" unit="倍" value={project.building.currentValueRate} onChange={(v) => patch({ building: { ...project.building, currentValueRate: num(v) } })} />
              <Field label="建物構造" value={project.building.structure} onChange={(v) => patch({ building: { ...project.building, structure: v } })} />
            </div>
            <div className="metricWide">積算価格: {money(result.accumulationValue)}</div>
          </section>
        )}

        {active === "想定賃料" && (
          <section className="panel">
            <div className="sectionHead">
              <h2>賃料事例</h2>
              <div>
                <label className="smallUpload">
                  <FileText size={16} /> Excel/CSV取込
                  <input type="file" accept=".xlsx,.xls,.csv" onChange={(event) => handleExcelCsv(event.target.files?.[0])} />
                </label>
                <button
                  onClick={() =>
                    patch({
                      rentCases: [
                        ...project.rentCases,
                        { id: crypto.randomUUID(), adopted: true, name: "手入力事例", address: "", usage: "", monthlyRent: 0, areaSqm: 0, areaTsubo: 0, rentPerTsubo: 0 },
                      ],
                    })
                  }
                >
                  事例追加
                </button>
              </div>
            </div>
            <table className="dataTable">
              <thead>
                <tr>
                  <th>採用</th>
                  <th>事例名</th>
                  <th>所在地</th>
                  <th>用途</th>
                  <th>月額賃料</th>
                  <th>面積㎡</th>
                  <th>面積坪</th>
                  <th>坪単価</th>
                </tr>
              </thead>
              <tbody>
                {project.rentCases.map((item) => (
                  <tr key={item.id}>
                    <td><input type="checkbox" checked={item.adopted} onChange={(e) => updateRentCase(item.id, { adopted: e.target.checked })} /></td>
                    <td><input value={item.name} onChange={(e) => updateRentCase(item.id, { name: e.target.value })} /></td>
                    <td><input value={item.address} onChange={(e) => updateRentCase(item.id, { address: e.target.value })} /></td>
                    <td><input value={item.usage} onChange={(e) => updateRentCase(item.id, { usage: e.target.value })} /></td>
                    <td><input type="number" value={item.monthlyRent} onChange={(e) => updateRentCase(item.id, { monthlyRent: num(e.target.value) })} /></td>
                    <td><input type="number" value={item.areaSqm} onChange={(e) => updateRentCase(item.id, { areaSqm: num(e.target.value), areaTsubo: 0 })} /></td>
                    <td>{item.areaTsubo.toFixed(2)}</td>
                    <td>{money(item.rentPerTsubo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="metrics">
              <b>想定月額賃料 {money(result.expectedMonthlyRent)}</b>
              <b>想定年間賃料 {money(result.expectedAnnualRent)}</b>
              <b>NOI {money(result.noi)}</b>
            </div>
            {importPreview.length > 0 && <p className="notice">取込列は「月額賃料・賃料・家賃・面積・坪数・坪単価・所在地・用途」などを自動マッピングしました。</p>}
          </section>
        )}

        {active === "経費・融資" && (
          <section className="twoCol">
            <div className="panel">
              <div className="sectionHead"><h2>取得費・運営費</h2><button onClick={autoFillCosts}><Wand2 size={16} /> 税額概算</button></div>
              {Object.entries(project.costs).map(([key, value]) => (
                <Field key={key} label={costLabels[key] || key} type="number" unit="円" value={value} onChange={(v) => patch({ costs: { ...project.costs, [key]: num(v) } })} />
              ))}
            </div>
            <div className="panel">
              <h2>融資条件</h2>
              <Field label="借入金" type="number" unit="円" value={project.finance.loanAmount} onChange={(v) => patch({ finance: { ...project.finance, loanAmount: num(v) } })} />
              <Field label="自己資金" type="number" unit="円" value={project.finance.equity} onChange={(v) => patch({ finance: { ...project.finance, equity: num(v) } })} />
              <Field label="借入期間" type="number" unit="年" value={project.finance.loanYears} onChange={(v) => patch({ finance: { ...project.finance, loanYears: num(v) } })} />
              <Field label="金利" type="number" unit="%" value={project.finance.interestRate} onChange={(v) => patch({ finance: { ...project.finance, interestRate: num(v) } })} />
              <div className="metrics vertical">
                <b>年間返済額 {money(result.annualDebtService)}</b>
                <b>返済率 {pct(result.repaymentRatio)}</b>
                <b>融資比率 {pct(result.loanToCost)}</b>
                <b>自己資本配当率 {pct(result.cashOnCashReturn)}</b>
              </div>
            </div>
          </section>
        )}

        {active === "入札価格決定" && (
          <section className="panel">
            <div className="bidHero">
              <div><span>推奨入札価格</span><strong>{man(result.recommendedBidPrice)}</strong></div>
              <div><span>絶対上限価格</span><strong>{man(result.absoluteBidLimit)}</strong></div>
              <div><span>落札予想価格</span><strong>{man(result.expectedWinningPrice)}</strong></div>
            </div>
            <p className={result.expectedWinningPrice > result.absoluteBidLimit ? "warning" : "notice"}>{result.comment}</p>
            <div className="gridForm compact">
              <Field label="想定落札倍率" type="number" unit="倍" value={project.competition.expectedMultiplier} onChange={(v) => patch({ competition: { ...project.competition, expectedMultiplier: num(v) } })} />
              <Field label="競争度" value={project.competition.competition} onChange={(v) => patch({ competition: { ...project.competition, competition: v } })} />
              <Field label="エリア人気度" value={project.competition.areaPopularity} onChange={(v) => patch({ competition: { ...project.competition, areaPopularity: v } })} />
              <Field label="希少性" value={project.competition.scarcity} onChange={(v) => patch({ competition: { ...project.competition, scarcity: v } })} />
            </div>
            <div className="limitGrid">
              <div>収益から見た入札上限 <b>{man(result.incomeBidLimit)}</b></div>
              <div>積算から見た入札上限 <b>{man(result.accumulationBidLimit)}</b></div>
              <div>融資から見た入札上限 <b>{man(result.financeBidLimit)}</b></div>
            </div>
            <h2>入札価格別シミュレーション</h2>
            <table className="dataTable">
              <thead><tr><th>入札価格</th><th>総投資額</th><th>想定利回り</th><th>実質利回り</th><th>NOI</th><th>年間返済額</th><th>返済率</th><th>融資比率</th><th>自己資本配当率</th><th>判定</th></tr></thead>
              <tbody>{simulationRows.map((row) => <tr key={row.bidPrice}><td>{man(row.bidPrice)}</td><td>{man(row.totalInvestment)}</td><td>{pct(row.grossYield)}</td><td>{pct(row.netYield)}</td><td>{man(row.noi)}</td><td>{man(row.annualDebtService)}</td><td>{pct(row.repaymentRatio)}</td><td>{pct(row.loanToCost)}</td><td>{pct(row.cashOnCashReturn)}</td><td><b className={`grade grade${row.grade}`}>{row.grade}</b></td></tr>)}</tbody>
            </table>
          </section>
        )}

        {active === "投資判断" && (
          <section className="judgement">
            {[
              ["安全性", result.safetyGrade, [`経費率 ${pct(result.expenseRatio)}`, `損益分岐点比率 ${pct(result.breakEvenRatio)}`, `返済率 ${pct(result.repaymentRatio)}`, `融資比率 ${pct(result.loanToCost)}`]],
              ["収益性", result.profitabilityGrade, [`想定利回り ${pct(result.grossYield)}`, `実質利回り ${pct(result.netYield)}`, `NOI ${man(result.noi)}`, `自己資本配当率 ${pct(result.cashOnCashReturn)}`]],
              ["その他", result.otherGrade, [`売却基準価額倍率 ${result.basePriceMultiplier.toFixed(2)}倍`, `積算価格 ${man(result.accumulationValue)}`, `収益価格 ${man(result.incomeValue)}`, `落札予想との差 ${man(result.recommendedBidPrice - result.expectedWinningPrice)}`]],
            ].map(([title, grade, items]) => (
              <div className="panel judgeCard" key={String(title)}>
                <h2>{title}</h2>
                <strong className={`grade grade${grade}`}>{grade}</strong>
                {(items as string[]).map((item) => <span key={item}>{item}</span>)}
              </div>
            ))}
          </section>
        )}

        {active === "PDF出力" && (
          <section className="panel">
            <div className="sectionHead"><h2>印刷プレビュー</h2><button onClick={exportPdf}><FileDown size={16} /> A4 PDF出力</button></div>
            <Report refEl={reportRef} project={project} result={result} />
          </section>
        )}

        {active === "設定" && (
          <section className="gridForm">
            {Object.entries(project.settings).map(([key, value]) => (
              <Field key={key} label={settingLabels[key] || key} type="number" value={value} onChange={(v) => patch({ settings: { ...project.settings, [key]: num(v) } })} />
            ))}
            <p className="notice full">税率・判定基準は制度変更や運用条件により変わります。最終判断前に専門家確認を行ってください。</p>
          </section>
        )}
      </main>
    </div>
  );
}

function Report({ refEl, project, result }: { refEl: React.RefObject<HTMLDivElement | null>; project: ProjectData; result: ReturnType<typeof calculateProject> }) {
  return (
    <div className="a4" ref={refEl}>
      <header><img src={logoSrc} alt="ラクサツ！" /><div><h1>ラクサツ！ 投資判断レポート</h1><p>作成日 {new Date().toLocaleDateString("ja-JP")}</p></div><strong className={`grade grade${result.grade}`}>{result.grade}</strong></header>
      <div className="reportGrid">
        <b>地方裁判所</b><span>{project.basic.court.value}</span><b>支部</b><span>{project.basic.branch.value}</span>
        <b>事件番号</b><span>{project.basic.caseNumber.value}</span><b>物件番号</b><span>{project.basic.propertyNumber.value}</span>
        <b>所在地</b><span className="wide">{project.basic.address.value}</span>
      </div>
      <div className="reportNumbers">
        {[
          ["入札価格", project.costs.bidPrice], ["推奨入札価格", result.recommendedBidPrice], ["絶対上限価格", result.absoluteBidLimit], ["落札予想価格", result.expectedWinningPrice],
          ["総投資額", result.totalInvestment], ["売却基準価額", project.basic.saleBasePrice.value], ["買受可能価額", project.basic.minimumPurchasePrice.value], ["積算価格", result.accumulationValue],
          ["収益価格", result.incomeValue], ["想定年間収入", result.expectedAnnualRent], ["NOI", result.noi],
        ].map(([label, value]) => <div key={String(label)}><span>{label}</span><b>{man(Number(value))}</b></div>)}
      </div>
      <table>
        <tbody>
          <tr><th>想定利回り</th><td>{pct(result.grossYield)}</td><th>実質利回り</th><td>{pct(result.netYield)}</td><th>経費率</th><td>{pct(result.expenseRatio)}</td></tr>
          <tr><th>損益分岐点比率</th><td>{pct(result.breakEvenRatio)}</td><th>返済率</th><td>{pct(result.repaymentRatio)}</td><th>融資比率</th><td>{pct(result.loanToCost)}</td></tr>
          <tr><th>自己資本配当率</th><td>{pct(result.cashOnCashReturn)}</td><th>安全性評価</th><td>{result.safetyGrade}</td><th>収益性評価</th><td>{result.profitabilityGrade}</td></tr>
          <tr><th>その他評価</th><td>{result.otherGrade}</td><th>総合評価</th><td>{result.grade}</td><th>年間返済額</th><td>{man(result.annualDebtService)}</td></tr>
        </tbody>
      </table>
      <p className="reportComment">{result.comment}</p>
      <footer>税額・投資判断は概算です。入札前に資料原本、税制、融資条件を必ず確認してください。</footer>
    </div>
  );
}

const costLabels: Record<string, string> = {
  bidPrice: "入札価格",
  renovationCost: "改装・補修費",
  registrationTax: "登録免許税",
  acquisitionTax: "不動産取得税",
  judicialScrivenerFee: "司法書士手数料",
  fixedAssetTax: "固定資産税",
  cityPlanningTax: "都市計画税",
  managementCost: "管理費",
  otherOperatingCost: "その他運営経費",
  reserveCost: "予備費",
};

const settingLabels: Record<string, string> = {
  registrationTaxRateLand: "登録免許税率（土地）",
  registrationTaxRateBuilding: "登録免許税率（建物）",
  acquisitionTaxRateLand: "不動産取得税率（土地）",
  acquisitionTaxRateBuilding: "不動産取得税率（建物）",
  fixedAssetTaxRate: "固定資産税率",
  cityPlanningTaxRate: "都市計画税率",
  judicialScrivenerMinimum: "最低手数料",
  judicialScrivenerRate: "司法書士手数料率",
  reserveRate: "予備費率",
  accumulationSafetyRate: "積算価格に対する安全率",
  recommendedBidSafetyRate: "推奨入札安全率",
  targetYield: "目標利回り",
  debtServiceCoverageSafety: "返済率の安全基準",
  loanToCostSafety: "融資比率の安全基準",
  roundingUnit: "端数処理単位",
};
