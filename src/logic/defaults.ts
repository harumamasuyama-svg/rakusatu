import type { BasicInfo, ProjectData } from "../types/domain";

const text = (value = "", source: "pdf" | "manual" | "missing" = "missing") => ({ value, source });
const num = (value = 0, source: "pdf" | "manual" | "missing" = "missing") => ({ value, source });

export const defaultBasic = (): BasicInfo => ({
  court: text(),
  branch: text(),
  caseNumber: text(),
  propertyNumber: text(),
  address: text(),
  propertyType: text(),
  saleBasePrice: num(),
  minimumPurchasePrice: num(),
  deposit: num(),
  occupancy: text(),
});

export const createDefaultProject = (): ProjectData => ({
  id: crypto.randomUUID(),
  name: "新規シミュレーション",
  updatedAt: new Date().toISOString(),
  basic: defaultBasic(),
  land: {
    landAreaSqm: 0,
    standardLandPricePerSqm: 0,
    individualFactor: 1,
    buildingLandDeduction: 1,
    landValue: 0,
  },
  building: {
    buildingAreaSqm: 0,
    replacementCostPerSqm: 0,
    elapsedYears: 0,
    currentValueRate: 0.5,
    buildingValue: 0,
    structure: "",
  },
  rentCases: [
    {
      id: crypto.randomUUID(),
      adopted: true,
      name: "手入力事例 1",
      address: "",
      usage: "",
      monthlyRent: 0,
      areaSqm: 0,
      areaTsubo: 0,
      rentPerTsubo: 0,
    },
  ],
  costs: {
    bidPrice: 0,
    renovationCost: 0,
    registrationTax: 0,
    acquisitionTax: 0,
    judicialScrivenerFee: 150000,
    fixedAssetTax: 0,
    cityPlanningTax: 0,
    managementCost: 0,
    otherOperatingCost: 0,
    reserveCost: 0,
  },
  finance: {
    loanAmount: 0,
    equity: 0,
    loanYears: 20,
    interestRate: 2.2,
  },
  settings: {
    registrationTaxRateLand: 0.015,
    registrationTaxRateBuilding: 0.02,
    acquisitionTaxRateLand: 0.03,
    acquisitionTaxRateBuilding: 0.04,
    fixedAssetTaxRate: 0.014,
    cityPlanningTaxRate: 0.003,
    judicialScrivenerMinimum: 150000,
    judicialScrivenerRate: 0.004,
    reserveRate: 0.03,
    accumulationSafetyRate: 0.8,
    recommendedBidSafetyRate: 0.95,
    targetYield: 0.1,
    debtServiceCoverageSafety: 0.6,
    loanToCostSafety: 0.8,
    roundingUnit: 10000,
  },
  competition: {
    expectedMultiplier: 1.3,
    competition: "普通",
    areaPopularity: "標準",
    scarcity: "標準",
  },
});
