import { PRODUCTS } from '../recommend/products';

const HORIZON = 12;
// 서울시·서울신용보증재단의 2026년 중소기업육성자금 공고(소상공인 포함).
const POLICY_ID = 'PBLN_000000000117111';

export const SIM_VIEWS = [
  { key: 'cash', label: '현금흐름' },
  { key: 'sales', label: '예상매출' },
  { key: 'repay', label: '상환' },
  { key: 'risk', label: '리스크' },
];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const f1 = (value) => Math.round(value * 10) / 10;
export const sign = (value) => `${value > 0 ? '+' : ''}${f1(value)}`;
const man = (won) => f1((Number(won) || 0) / 10_000);
const avg = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const sum = (values) => values.reduce((total, value) => total + value, 0);
function selectedItem(id, existingDebtTotal) {
  const product = PRODUCTS.find((candidate) => candidate.id === id);
  if (!product) return null;

  switch (id) {
    case 'op':
      return {
        sourceType: 'KB_PRODUCT', id: 'L001', name: product.name,
        requiredFundingAmount: 10_000_000, eligibilityStatus: 'UNKNOWN', duplicateGroup: 'operating-loan',
      };
    case 'policy':
      return {
        sourceType: 'SEOUL_POLICY', id: POLICY_ID, name: product.name, type: 'LOAN',
        amount: 10_000_000, annualRate: 0.035, totalTermMonths: 60, graceMonths: 12,
        repaymentType: 'EQUAL_PRINCIPAL', feeRate: 0.005, requiredFundingAmount: 10_000_000,
        eligibilityStatus: 'UNKNOWN', duplicateGroup: 'operating-loan',
      };
    case 'refi': {
      const amount = Math.min(existingDebtTotal, 10_000_000);
      return {
        sourceType: 'KB_PRODUCT', id: 'D002', name: product.name, amount,
        requiredFundingAmount: amount, eligibilityStatus: amount > 0 ? 'UNKNOWN' : 'FAIL',
        duplicateGroup: 'debt-restructuring',
      };
    }
    case 'save':
      return {
        sourceType: 'KB_PRODUCT', id: 'SV001', name: product.name, type: 'SAVINGS', amount: 0,
        monthlyContribution: 300_000, assetAnnualRate: 0.02, maturityMonth: 6, eligibilityStatus: 'UNKNOWN',
        duplicateGroup: 'emergency-saving',
      };
    case 'gov':
      return {
        sourceType: 'CUSTOM', id: 'YELLOW_UMBRELLA', name: product.name, type: 'MUTUAL_AID', amount: 0,
        monthlyContribution: 100_000, assetAnnualRate: 0, eligibilityStatus: 'UNKNOWN',
        duplicateGroup: 'retirement-safety',
      };
    case 'ins':
      return {
        sourceType: 'CUSTOM', id: 'FIRE_LIABILITY_INSURANCE', name: product.name, type: 'INSURANCE', amount: 0,
        monthlyContribution: 45_000, protectionType: 'FIRE_AND_LIABILITY',
        protectionBasis: '실제 보장 범위와 보험금은 상품 약관 확인 필요', eligibilityStatus: 'UNKNOWN',
        duplicateGroup: 'business-insurance',
      };
    default:
      return null;
  }
}

export function buildSimulationPayload({ rank, diag, hometax, equipped }) {
  const currentSales = Math.max(0, Number(rank?.sales?.value) || Number(diag.salesMan) * 10_000 || 0);
  const history = (hometax?.salesHistory || [])
    .map((entry) => Number(entry?.amount ?? entry))
    .filter((amount) => Number.isFinite(amount) && amount > 0);
  const monthlySales = history.length >= 3 ? history : [currentSales, currentSales, currentSales];

  const expense = Math.max(0, Number(diag.expenseMan || 0) * 10_000);
  const purchaseCost = Math.max(0, Number(diag.purchaseMan || 0) * 10_000);
  const rent = Math.max(0, Number(diag.rentMan || 0) * 10_000);
  const laborCost = Math.max(0, Number(diag.laborMan || 0) * 10_000);
  const knownCosts = rent + laborCost + purchaseCost;
  const totalExpense = Math.max(expense, knownCosts);
  const otherFixedExpense = Math.max(0, totalExpense - knownCosts);
  const variableCostRatio = currentSales > 0 ? clamp(purchaseCost / currentSales, 0, 0.8) : 0;
  const fixedCost = Math.max(0, totalExpense - purchaseCost);
  const currentCash = Math.max(0, Number(diag.currentCashMan || 0) * 10_000);
  const existingDebtTotal = Math.max(0, Number(diag.existingDebtMan || 0) * 10_000);
  const existingMonthlyPayment = Math.max(0, Number(diag.existingMonthlyPaymentMan || 0) * 10_000);
  const hasCostBreakdown = totalExpense > 0 || knownCosts > 0;

  return {
    monthlySales,
    fixedCost,
    variableCostRatio,
    currentCash,
    existingMonthlyPayment,
    existingDebtBalance: existingDebtTotal,
    existingLoanInterestRate: Math.max(0, Number(diag.existingLoanRatePct || 0) / 100),
    existingLoanRemainingMonths: Math.max(0, Number(diag.existingLoanRemainingMonths || 0)),
    costStructure: hasCostBreakdown ? {
      totalExpense,
      rent,
      laborCost,
      otherFixedExpense,
      materialCost: purchaseCost,
      salesLinkedExpenseRate: 0,
    } : null,
    taxReserveRatio: 0.08,
    safetyThresholdType: 'FIXED_COST_PLUS_DEBT_PAYMENT',
    horizonMonths: HORIZON,
    simulationCount: 1000,
    randomSeed: 42,
    diagnosis: {
      industryCv: null,
      marketRiskLevel: rank?.topPercent <= 25 ? 'LOW' : rank?.topPercent <= 60 ? 'MEDIUM' : 'HIGH',
      industryCode: diag.industryCode || null,
      region: diag.areaType || 'SEOUL',
    },
    selectedItems: equipped.map((id) => selectedItem(id, existingDebtTotal)).filter(Boolean),
  };
}

function tone(delta, goodUp) {
  if (Math.abs(delta) < 0.0001) return { color: '#B9B0A4', dark: '#8A8178', bg: '#F5EFE3' };
  const good = goodUp ? delta > 0 : delta < 0;
  return good
    ? { color: '#5E8A3E', dark: '#A8D284', bg: '#EDF5E1' }
    : { color: '#D0564C', dark: '#F0968C', bg: '#FDE8E6' };
}

function row(name, before, after, unit, goodUp) {
  const delta = after - before;
  const colors = tone(delta, goodUp);
  return {
    name,
    before: `${f1(before)}${unit}`,
    after: `${f1(after)}${unit}`,
    delta: Math.abs(delta) < 0.0001 ? '변화 없음' : `${sign(delta)}${unit}`,
    strike: Math.abs(delta) < 0.0001 ? 'none' : 'line-through',
    deltaColor: colors.color,
    deltaColorDark: colors.dark,
    deltaBg: colors.bg,
  };
}

export function buildSimRows(simulation) {
  if (!simulation) return [];
  const baselineFlows = simulation.baseline.monthlyCashFlows;
  const selectedFlows = simulation.selectedScenario.monthlyCashFlows;
  const beforeOperating = man(simulation.baseline.metrics?.averageMonthlyNetCashFlow
    ?? avg(baselineFlows.map((flow) => flow.closingCash - flow.openingCash)));
  const afterOperating = man(simulation.selectedScenario.metrics?.averageMonthlyNetCashFlow
    ?? avg(selectedFlows.map((flow) => flow.closingCash - flow.openingCash)));
  const beforeRepayment = man(Math.max(...baselineFlows.map((flow) => flow.existingRepayment + flow.newRepayment), 0));
  const afterRepayment = man(Math.max(...selectedFlows.map((flow) => flow.existingRepayment + flow.newRepayment), 0));
  const beforeRisk = simulation.baseline.stochastic.bufferBreachProbability * 100;
  const afterRisk = simulation.selectedScenario.stochastic.bufferBreachProbability * 100;

  return [
    row('월평균 순현금흐름', beforeOperating, afterOperating, '만원', true),
    row('월평균 예상매출', man(avg(baselineFlows.map((flow) => flow.expectedSales))), man(avg(selectedFlows.map((flow) => flow.expectedSales))), '만원', true),
    row('최대 월 상환액', beforeRepayment, afterRepayment, '만원', false),
    row('현금부족 확률', beforeRisk, afterRisk, '%', false),
    row('금융자산 잔액', man(simulation.baseline.metrics?.financialAssetBalance), man(simulation.selectedScenario.metrics?.financialAssetBalance), '만원', true),
  ];
}

function emptyDetail() {
  const points = Array.from({ length: HORIZON }, (_, index) => ({ label: String(index + 1), before: 0, after: 0 }));
  const view = (title, unit, inverse = false) => ({ title, lead: '계산 엔진의 응답을 기다리고 있어요.', before: 0, after: 0, unit, inverse, points, facts: [] });
  return {
    views: {
      cash: view('월 가용현금', '만원'), sales: view('예상 매출', '만원'),
      repay: view('월 상환액', '만원', true), risk: view('현금부족 위험', '%', true),
    },
    contributions: [], summary: [], riskBefore: 0, riskAfter: 0,
    warnings: [], violations: [], confidence: null,
  };
}

function flowPoints(beforeFlows, afterFlows, selector) {
  return beforeFlows.map((flow, index) => ({
    label: String(flow.month),
    before: f1(selector(flow)),
    after: f1(selector(afterFlows[index])),
  }));
}

function itemExplanation(item) {
  const input = item.verifiedInputs || {};
  if (item.type === 'LOAN') {
    return `조달 ${man(input.amount)}만원 · 연 ${f1((input.annualRate || 0) * 100)}% · ${input.totalTermMonths || 0}개월`;
  }
  if (item.type === 'GRANT') return `지원금 ${man(input.amount)}만원 유입을 월별 현금흐름에 반영`;
  return '약정된 월 납입액을 현금 유출로 반영';
}

export function buildSimulationDetail(simulation, equipped = []) {
  if (!simulation) return emptyDetail();
  const beforeFlows = simulation.baseline.monthlyCashFlows;
  const afterFlows = simulation.selectedScenario.monthlyCashFlows;
  const beforeRiskSeries = simulation.baseline.stochastic.monthlyRisks || [];
  const afterRiskSeries = simulation.selectedScenario.stochastic.monthlyRisks || [];
  const riskBefore = simulation.baseline.stochastic.bufferBreachProbability * 100;
  const riskAfter = simulation.selectedScenario.stochastic.bufferBreachProbability * 100;
  const beforeRepayment = beforeFlows.map((flow) => flow.existingRepayment + flow.newRepayment);
  const afterRepayment = afterFlows.map((flow) => flow.existingRepayment + flow.newRepayment);

  const cashPoints = flowPoints(beforeFlows, afterFlows,
    (flow) => man(flow.closingCash - flow.openingCash));
  const salesPoints = flowPoints(beforeFlows, afterFlows, (flow) => man(flow.expectedSales));
  const repayPoints = flowPoints(beforeFlows, afterFlows,
    (flow) => man(flow.existingRepayment + flow.newRepayment));
  const riskPoints = beforeFlows.map((flow, index) => ({
    label: String(flow.month),
    before: f1((beforeRiskSeries[index]?.bufferBreachProbability || 0) * 100),
    after: f1((afterRiskSeries[index]?.bufferBreachProbability || 0) * 100),
  }));

  const cashBefore = avg(cashPoints.map((point) => point.before));
  const cashAfter = avg(cashPoints.map((point) => point.after));
  const salesBefore = avg(salesPoints.map((point) => point.before));
  const salesAfter = avg(salesPoints.map((point) => point.after));
  const repayBefore = man(Math.max(...beforeRepayment, 0));
  const repayAfter = man(Math.max(...afterRepayment, 0));
  const financing = simulation.financingResult;

  const views = {
    cash: {
      title: '월 가용현금 변화',
      lead: '매출에서 운영비·세금·기존 상환액·선택 상품의 납입과 신규 상환액을 모두 차감한 금액이에요.',
      before: f1(cashBefore), after: f1(cashAfter), unit: '만원', points: cashPoints,
      facts: [
        { k: '12개월 후 잔액', v: `${man(simulation.selectedScenario.deterministic.endingCash)}만원` },
        { k: '최저 현금잔액', v: `${man(simulation.selectedScenario.deterministic.minimumCashBalance)}만원` },
        { k: 'P5 잔액', v: `${man(simulation.selectedScenario.stochastic.endingCashP5)}만원` },
      ],
    },
    sales: {
      title: '월 예상 매출',
      lead: '최근 월매출의 평균과 추세를 사용한 계산값입니다. 현재 선택 상품에는 임의 매출 상승률을 넣지 않았어요.',
      before: f1(salesBefore), after: f1(salesAfter), unit: '만원', points: salesPoints,
      facts: [
        { k: '12개월 누적', v: `${man(sum(afterFlows.map((flow) => flow.expectedSales)))}만원` },
        { k: '월평균', v: `${f1(salesAfter)}만원` },
        { k: '신뢰 수준', v: simulation.confidence.level },
      ],
    },
    repay: {
      title: '월 금융 상환액',
      lead: '기존 상환액과 선택한 대출의 원금·이자를 월별 상환 방식에 맞춰 합산했어요.',
      before: f1(repayBefore), after: f1(repayAfter), unit: '만원', inverse: true, points: repayPoints,
      facts: [
        { k: '최대 월 상환', v: `${man(financing.maxMonthlyRepayment)}만원` },
        { k: '12개월 이자', v: `${man(financing.totalInterest)}만원` },
        { k: '수수료', v: `${man(financing.totalFees)}만원` },
      ],
    },
    risk: {
      title: '누적 현금부족 가능성',
      lead: `${simulation.selectedScenario.stochastic.simulationCount.toLocaleString()}회 몬테카를로 실행에서 해당 월까지 안전자금선 아래로 내려간 비율이에요.`,
      before: f1(riskBefore), after: f1(riskAfter), unit: '%', inverse: true, points: riskPoints,
      facts: [
        { k: '현금 고갈 확률', v: `${f1(simulation.selectedScenario.stochastic.negativeCashProbability * 100)}%` },
        { k: '위험 변화', v: `${sign(riskAfter - riskBefore)}%p` },
        { k: '안전 기준', v: `${man(simulation.assumptions.minimumCashBuffer)}만원` },
      ],
    },
  };

  const contributions = simulation.selectedItems.map((item, index) => {
    const product = PRODUCTS.find((candidate) => candidate.id === equipped[index]);
    return {
      id: `${item.sourceType}-${item.id}`,
      icon: product?.icon || '·', iconBg: product?.iconBg || '#F5EFE3', iconColor: product?.iconColor || '#8A8178',
      name: product?.short || item.name,
      delta: item.type === 'LOAN' ? '대출' : item.type === 'GRANT' ? '지원금' : '월 납입',
      formula: itemExplanation(item),
      note: item.eligibilityStatus === 'FAIL'
        ? '현재 입력에는 기존 대출 잔액이 없어 대환 조건을 충족하지 못했어요.'
        : `자격 ${item.eligibilityStatus === 'UNKNOWN' ? '심사 필요' : item.eligibilityStatus} · 실제 조건은 신청 단계에서 확인해야 해요.`,
    };
  });

  const summary = [
    { label: '12개월 후 현금', value: `${man(simulation.selectedScenario.deterministic.endingCash)}만원`, delta: `${sign(man(simulation.selectedScenario.deterministic.endingCash - simulation.baseline.deterministic.endingCash))}만원`, good: simulation.selectedScenario.deterministic.endingCash >= simulation.baseline.deterministic.endingCash },
    { label: '보수적 P5 현금', value: `${man(simulation.selectedScenario.stochastic.endingCashP5)}만원`, delta: `${sign(man(simulation.baselineComparison.endingCashP5Delta))}만원`, good: simulation.baselineComparison.endingCashP5Delta >= 0 },
    { label: '현금부족 위험', value: `${f1(riskAfter)}%`, delta: `${sign(riskAfter - riskBefore)}%p`, good: riskAfter <= riskBefore },
    { label: '최대 상환부담률', value: `${f1(financing.maxRepaymentBurdenRatio * 100)}%`, delta: simulation.constraints.repaymentBurdenPassed ? '기준 통과' : '기준 초과', good: simulation.constraints.repaymentBurdenPassed },
  ];

  return {
    views, contributions, summary, riskBefore, riskAfter,
    warnings: simulation.warnings,
    violations: simulation.constraints.violations,
    confidence: simulation.confidence,
  };
}
