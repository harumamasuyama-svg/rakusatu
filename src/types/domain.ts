export type Grade = "A" | "B" | "C" | "F";

export type SourceStatus = "pdf" | "manual" | "missing";

export interface EditableNumber {
  value: number;
  source: SourceStatus;
}

export interface EditableText {
  value: string;
  source: SourceStatus;
}

export interface BasicInfo {
  court: EditableText;
  branch: EditableText;
  caseNumber: EditableText;
  propertyNumber: EditableText;
  address: EditableText;
  propertyType: EditableText;
  saleBasePrice: EditableNumber;
  minimumPurchasePrice: EditableNumber;
  deposit: EditableNumber;
  occupancy: EditableText;
}

export interface CostInputs {
  bidPrice: number;
  renovationCost: number;
  registrationTax: number;
  acquisitionTax: number;
  judicialScrivenerFee: number;
  fixedAssetTax: number;
  cityPlanningTax: number;
  managementCost: number;
  otherOperatingCost: number;
  reserveCost: number;
}

export interface LandValuation {
  landAreaSqm: number;
  standardLandPricePerSqm: number;
  individualFactor: number;
  buildingLandDeduction: number;
  landValue: number;
}

export interface BuildingValuation {
  buildingAreaSqm: number;
  replacementCostPerSqm: number;
  elapsedYears: number;
  currentValueRate: number;
  buildingValue: number;
  structure: string;
}

export interface RentCase {
  id: string;
  adopted: boolean;
  name: string;
  address: string;
  usage: string;
  monthlyRent: number;
  areaSqm: number;
  areaTsubo: number;
  rentPerTsubo: number;
}

export interface FinanceInputs {
  loanAmount: number;
  equity: number;
  loanYears: number;
  interestRate: number;
}

export interface Settings {
  registrationTaxRateLand: number;
  registrationTaxRateBuilding: number;
  acquisitionTaxRateLand: number;
  acquisitionTaxRateBuilding: number;
  fixedAssetTaxRate: number;
  cityPlanningTaxRate: number;
  judicialScrivenerMinimum: number;
  judicialScrivenerRate: number;
  reserveRate: number;
  accumulationSafetyRate: number;
  recommendedBidSafetyRate: number;
  targetYield: number;
  debtServiceCoverageSafety: number;
  loanToCostSafety: number;
  roundingUnit: number;
}

export interface CompetitionInputs {
  expectedMultiplier: number;
  competition: string;
  areaPopularity: string;
  scarcity: string;
}

export interface ExtractedData {
  rawText: string;
  basic: Partial<Record<keyof BasicInfo, string | number>>;
  notes: string[];
}

export interface CalculationResult {
  totalInvestment: number;
  expectedMonthlyRent: number;
  expectedAnnualRent: number;
  noi: number;
  expenseRatio: number;
  grossYield: number;
  netYield: number;
  incomeValue: number;
  accumulationValue: number;
  incomeBidLimit: number;
  accumulationBidLimit: number;
  financeBidLimit: number;
  absoluteBidLimit: number;
  recommendedBidPrice: number;
  expectedWinningPrice: number;
  annualDebtService: number;
  repaymentRatio: number;
  loanToCost: number;
  cashOnCashReturn: number;
  breakEvenRatio: number;
  basePriceMultiplier: number;
  grade: Grade;
  safetyGrade: Grade;
  profitabilityGrade: Grade;
  otherGrade: Grade;
  comment: string;
}

export interface SimulationRow {
  bidPrice: number;
  totalInvestment: number;
  grossYield: number;
  netYield: number;
  noi: number;
  annualDebtService: number;
  repaymentRatio: number;
  loanToCost: number;
  cashOnCashReturn: number;
  grade: Grade;
}

export interface ProjectData {
  id: string;
  name: string;
  updatedAt: string;
  basic: BasicInfo;
  land: LandValuation;
  building: BuildingValuation;
  rentCases: RentCase[];
  costs: CostInputs;
  finance: FinanceInputs;
  settings: Settings;
  competition: CompetitionInputs;
  extracted?: ExtractedData;
}
