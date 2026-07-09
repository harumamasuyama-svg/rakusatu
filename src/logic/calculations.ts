import type { CalculationResult, Grade, ProjectData, SimulationRow } from "../types/domain";

const safeDiv = (a: number, b: number) => (b ? a / b : 0);
const clampMoney = (v: number) => Math.max(0, Number.isFinite(v) ? v : 0);
const roundDown = (v: number, unit: number) => Math.floor(v / unit) * unit;

export const tsubo = (sqm: number) => sqm * 0.3025;

export function annualDebtService(principal: number, years: number, annualRatePercent: number): number {
  if (principal <= 0 || years <= 0) return 0;
  const monthlyRate = annualRatePercent / 100 / 12;
  const months = years * 12;
  if (monthlyRate === 0) return principal / years;
  const monthly = (principal * monthlyRate * (1 + monthlyRate) ** months) / ((1 + monthlyRate) ** months - 1);
  return monthly * 12;
}

export function gradeScore(grade: Grade): number {
  return grade === "A" ? 3 : grade === "B" ? 2 : grade === "C" ? 1 : 0;
}

function totalGrade(grades: Grade[]): Grade {
  if (grades.includes("F")) return "C";
  const sum = grades.reduce((acc, g) => acc + gradeScore(g), 0);
  if (sum >= 8) return "A";
  if (sum >= 5) return "B";
  return "C";
}

export function calculateProject(project: ProjectData, bidOverride?: number): CalculationResult {
  const bidPrice = bidOverride ?? project.costs.bidPrice;
  const adopted = project.rentCases.filter((item) => item.adopted);
  const buildingTsubo = tsubo(project.building.buildingAreaSqm);
  const averageRentPerTsubo = safeDiv(
    adopted.reduce((sum, item) => sum + item.rentPerTsubo, 0),
    adopted.length,
  );
  const expectedMonthlyRent =
    adopted.length > 0 && averageRentPerTsubo > 0
      ? averageRentPerTsubo * buildingTsubo
      : adopted.reduce((sum, item) => sum + item.monthlyRent, 0);
  const expectedAnnualRent = expectedMonthlyRent * 12;
  const operatingExpense =
    project.costs.fixedAssetTax +
    project.costs.cityPlanningTax +
    project.costs.managementCost +
    project.costs.otherOperatingCost;
  const noi = expectedAnnualRent - operatingExpense;
  const accumulationValue =
    project.land.landValue ||
    project.land.landAreaSqm *
      project.land.standardLandPricePerSqm *
      project.land.individualFactor *
      project.land.buildingLandDeduction +
      (project.building.buildingValue ||
        project.building.buildingAreaSqm * project.building.replacementCostPerSqm * project.building.currentValueRate);
  const incomeValue = safeDiv(noi, project.settings.targetYield);
  const afterBidCosts =
    project.costs.renovationCost +
    project.costs.registrationTax +
    project.costs.acquisitionTax +
    project.costs.judicialScrivenerFee +
    project.costs.reserveCost +
    project.costs.otherOperatingCost;
  const totalInvestment = bidPrice + afterBidCosts;
  const annualDebt = annualDebtService(project.finance.loanAmount, project.finance.loanYears, project.finance.interestRate);
  const repaymentRatio = safeDiv(annualDebt, noi);
  const loanToCost = safeDiv(project.finance.loanAmount, totalInvestment);
  const cashFlow = noi - annualDebt;
  const cashOnCashReturn = safeDiv(cashFlow, project.finance.equity);
  const grossYield = safeDiv(expectedAnnualRent, totalInvestment);
  const netYield = safeDiv(noi, totalInvestment);
  const breakEvenRatio = safeDiv(operatingExpense + annualDebt, expectedAnnualRent);
  const basePriceMultiplier = safeDiv(bidPrice, project.basic.saleBasePrice.value);
  const incomeBidLimit = incomeValue - afterBidCosts;
  const accumulationBidLimit = accumulationValue * project.settings.accumulationSafetyRate - afterBidCosts;
  const financePaymentLimit = noi * project.settings.debtServiceCoverageSafety;
  const monthlyRate = project.finance.interestRate / 100 / 12;
  const months = project.finance.loanYears * 12;
  const loanCapacity =
    monthlyRate > 0 && months > 0
      ? (financePaymentLimit / 12) * (((1 + monthlyRate) ** months - 1) / (monthlyRate * (1 + monthlyRate) ** months))
      : financePaymentLimit * project.finance.loanYears;
  const financeByLtc = safeDiv(project.finance.equity + loanCapacity, project.settings.loanToCostSafety ? 1 : 1);
  const financeBidLimit = Math.min(loanCapacity + project.finance.equity, financeByLtc) - afterBidCosts;
  const absoluteBidLimit = Math.min(clampMoney(incomeBidLimit), clampMoney(accumulationBidLimit), clampMoney(financeBidLimit));
  const recommendedBidPrice = roundDown(absoluteBidLimit * project.settings.recommendedBidSafetyRate, project.settings.roundingUnit);
  const expectedWinningPrice = project.basic.saleBasePrice.value * project.competition.expectedMultiplier;

  const safetyGrade: Grade =
    breakEvenRatio >= 1 || repaymentRatio >= 1 ? "F" : repaymentRatio <= 0.5 && loanToCost <= 0.8 ? "A" : "B";
  const profitabilityGrade: Grade = netYield >= 0.15 ? "A" : netYield >= 0.07 ? "B" : "C";
  const otherGrade: Grade =
    expectedWinningPrice > absoluteBidLimit ? "C" : expectedWinningPrice > recommendedBidPrice ? "B" : "A";
  const grade = totalGrade([safetyGrade, profitabilityGrade, otherGrade]);
  const comment =
    expectedWinningPrice > absoluteBidLimit
      ? `落札予想価格が採算上の絶対上限を超えています。推奨入札価格以下に留め、無理な競り上げは避ける判断が妥当です。`
      : expectedWinningPrice > recommendedBidPrice
        ? `落札予想価格は推奨入札価格を上回ります。上限価格まで余地はありますが、追加費用と融資条件の再確認が必要です。`
        : `落札予想価格は推奨入札価格の範囲内です。抽出値と税額を確認したうえで入札検討できます。`;

  return {
    totalInvestment,
    expectedMonthlyRent,
    expectedAnnualRent,
    noi,
    expenseRatio: safeDiv(operatingExpense, noi),
    grossYield,
    netYield,
    incomeValue,
    accumulationValue,
    incomeBidLimit,
    accumulationBidLimit,
    financeBidLimit,
    absoluteBidLimit,
    recommendedBidPrice,
    expectedWinningPrice,
    annualDebtService: annualDebt,
    repaymentRatio,
    loanToCost,
    cashOnCashReturn,
    breakEvenRatio,
    basePriceMultiplier,
    grade,
    safetyGrade,
    profitabilityGrade,
    otherGrade,
    comment,
  };
}

export function simulateBidPrices(project: ProjectData): SimulationRow[] {
  const base = project.basic.saleBasePrice.value || project.costs.bidPrice || 10000000;
  const min = Math.max(0, base * 0.7);
  const max = Math.max(base * 2, project.costs.bidPrice * 1.3, base + 10000000);
  const step = Math.max(500000, Math.round((max - min) / 14 / 100000) * 100000);
  const rows: SimulationRow[] = [];
  for (let bid = min; bid <= max + 1; bid += step) {
    const result = calculateProject(project, bid);
    rows.push({
      bidPrice: bid,
      totalInvestment: result.totalInvestment,
      grossYield: result.grossYield,
      netYield: result.netYield,
      noi: result.noi,
      annualDebtService: result.annualDebtService,
      repaymentRatio: result.repaymentRatio,
      loanToCost: result.loanToCost,
      cashOnCashReturn: result.cashOnCashReturn,
      grade: result.grade,
    });
  }
  return rows;
}
