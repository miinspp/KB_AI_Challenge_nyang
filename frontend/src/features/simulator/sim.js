const HORIZON = 12;

export const SIM_VIEWS = [
  { key: 'cash', label: '매달 남는 현금' },
  { key: 'sales', label: '앞으로의 매출' },
  { key: 'repay', label: '상환해야 할 현금' },
  { key: 'risk', label: '현금 부족 위험' },
];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const f1 = (value) => Math.round(value * 10) / 10;
export const sign = (value) => `${value > 0 ? '+' : ''}${f1(value)}`;
const man = (won) => f1((Number(won) || 0) / 10_000);
const avg = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const sum = (values) => values.reduce((total, value) => total + value, 0);
const confidenceLabel = (level) => ({ HIGH: '높음', MEDIUM: '보통', LOW: '낮음' }[level] || '확인 필요');
const SOURCE_TYPES = {
  KB: 'KB_PRODUCT',
  GOV: 'SEOUL_POLICY',
};
const DUPLICATE_GROUPS = {
  D002: 'KB_119PLUS_RESTRUCTURING',
  D003: 'KB_119PLUS_RESTRUCTURING',
};
const LEGACY_OPTIONS = {
  op: { sourceType: 'KB_PRODUCT', id: 'L001', isFinance: true, type: 'LOAN', maxAmountManwon: 5000 },
  policy: { sourceType: 'SEOUL_POLICY', id: 'PBLN_000000000117111', isFinance: true, type: 'LOAN', maxAmountManwon: 3000 },
  refi: { sourceType: 'KB_PRODUCT', id: 'D002', isFinance: true, type: 'LOAN' },
  save: { sourceType: 'KB_PRODUCT', id: 'SV001', isFinance: false, type: 'SAVINGS' },
  gov: { sourceType: 'CUSTOM', id: 'YELLOW_UMBRELLA', isFinance: false, type: 'MUTUAL_AID', monthlyContribution: 100_000 },
  ins: { sourceType: 'CUSTOM', id: 'FIRE_LIABILITY_INSURANCE', isFinance: false, type: 'INSURANCE', monthlyContribution: 45_000 },
};

/**
 * Python 추천 API products[]를 시뮬레이터 장착 옵션으로 변환한다.
 * 추천 API의 source가 상품 카탈로그 조회 키가 되므로 임의의 레거시 상품으로 치환하지 않는다.
 */
export function buildSimulationOptions(products = []) {
  if (!Array.isArray(products)) return [];

  return products.map((item) => {
    const legacy = LEGACY_OPTIONS[item.id] || {};
    const sourceType = SOURCE_TYPES[String(item.source || '').toUpperCase()] || legacy.sourceType;
    const itemId = legacy.id || item.id;
    if (!itemId || !sourceType) return null;

    const searchable = `${item.name || ''} ${item.tag || ''} ${item.spec1 || ''} ${item.spec2 || ''}`;
    const rawTerms = item.simulationTerms || item.simulation_terms || {};
    const isFinance = item.isFinance == null ? Boolean(legacy.isFinance) : Boolean(item.isFinance);
    const maxAmountManwon = Number(item.maxAmountManwon || item.max_amount_manwon || legacy.maxAmountManwon) || null;
    const type = item.simulationType || item.simulation_type || legacy.type
      || (isFinance ? 'LOAN' : sourceType === 'SEOUL_POLICY' && maxAmountManwon ? 'GRANT' : null);
    const simulationTerms = {
      annualRate: rawTerms.annualRate ?? rawTerms.annual_rate ?? item.annualRate ?? null,
      totalTermMonths: rawTerms.totalTermMonths ?? rawTerms.total_term_months ?? item.termMonths ?? null,
      graceMonths: rawTerms.graceMonths ?? rawTerms.grace_months ?? item.graceMonths ?? null,
      repaymentType: rawTerms.repaymentType ?? rawTerms.repayment_type ?? item.repaymentType ?? null,
      disbursementMonth: rawTerms.disbursementMonth ?? rawTerms.disbursement_month ?? null,
      selfFundingRatio: rawTerms.selfFundingRatio ?? rawTerms.self_funding_ratio ?? null,
      paymentMethod: rawTerms.paymentMethod ?? rawTerms.payment_method ?? null,
    };
    return {
      key: `${sourceType}:${itemId}`,
      sourceType,
      id: itemId,
      name: item.name,
      short: item.short || item.name,
      category: item.tag,
      type,
      link: item.link,
      isFinance,
      maxAmountManwon,
      monthlyContribution: legacy.monthlyContribution || null,
      supportTypes: item.supportTypes || item.support_types || [],
      simulationTerms,
      fit: item.fit,
      reason: item.reason,
      scores: item._scores || null,
      icon: item.icon || (sourceType === 'KB_PRODUCT' ? 'W' : 'P'),
      iconBg: item.iconBg || (sourceType === 'KB_PRODUCT' ? '#FFF1CC' : '#E4EEF9'),
      iconColor: item.iconColor || (sourceType === 'KB_PRODUCT' ? '#C98A00' : '#4A79B8'),
      requiresExistingDebt: /debt|restructur|refi|대환|만기연장|분할상환|햇살론119|채무조정/i.test(searchable),
      eligibilityStatus: item.eligibilityStatus || item.eligibility_status || 'UNKNOWN',
      duplicateGroup: item.duplicateGroup || item.duplicate_group || DUPLICATE_GROUPS[itemId] || null,
      duplicateNotice: DUPLICATE_GROUPS[itemId] ? '중복 가입 불가' : null,
    };
  }).filter(Boolean);
}

function selectedItem(option, diag) {
  if (!option) return null;
  const desiredFundingMan = Math.max(0, Number(diag.desiredFundingMan || 0));
  const requestedFundingMan = option.maxAmountManwon
    ? Math.min(desiredFundingMan, option.maxAmountManwon)
    : desiredFundingMan;
  const desiredFunding = requestedFundingMan * 10_000;
  const desiredGrantUse = Math.max(0, Number(diag.desiredGrantUseMan || 0) * 10_000);
  const desiredSavings = Math.max(0, Number(diag.desiredSavingsMan || 0) * 10_000);
  const grantAmount = option.type === 'GRANT'
    ? Math.min(desiredGrantUse, option.maxAmountManwon ? option.maxAmountManwon * 10_000 : desiredGrantUse)
    : 0;
  const terms = option.simulationTerms || {};
  return {
    sourceType: option.sourceType,
    id: option.id,
    name: option.name,
    type: option.type,
    amount: option.isFinance && desiredFunding > 0 ? desiredFunding : grantAmount || null,
    requiredFundingAmount: option.isFinance && desiredFunding > 0
      ? desiredFunding
      : option.sourceType === 'SEOUL_POLICY' ? desiredGrantUse || null : null,
    monthlyContribution: option.sourceType === 'KB_PRODUCT' && /^SV/.test(option.id)
      ? desiredSavings
      : option.monthlyContribution,
    eligibilityStatus: option.eligibilityStatus,
    duplicateGroup: option.duplicateGroup,
    annualRate: terms.annualRate ?? null,
    totalTermMonths: terms.totalTermMonths ?? null,
    graceMonths: terms.graceMonths ?? null,
    repaymentType: terms.repaymentType ?? null,
    disbursementMonth: terms.disbursementMonth ?? null,
    selfFundingRatio: terms.selfFundingRatio ?? null,
    paymentMethod: terms.paymentMethod ?? null,
  };
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
  const averageHistorySales = history.length ? avg(history) : currentSales;
  const annualTaxPaid = Math.max(0, Number(diag.annualTaxPaidMan || 0) * 10_000);
  const taxReserveRatio = annualTaxPaid > 0 && averageHistorySales > 0
    ? clamp(annualTaxPaid / (averageHistorySales * 12), 0, 0.3)
    : null;

  return {
    monthlySales,
    fixedCost,
    variableCostRatio,
    currentCash,
    existingMonthlyPayment: diag.existingMonthlyPaymentMan === '' ? null : existingMonthlyPayment,
    existingDebtBalance: diag.existingDebtMan === '' ? null : existingDebtTotal,
    existingLoanInterestRate: diag.existingLoanRatePct === '' ? null : Math.max(0, Number(diag.existingLoanRatePct || 0) / 100),
    existingLoanRemainingMonths: diag.existingLoanRemainingMonths === '' ? null : Math.max(0, Number(diag.existingLoanRemainingMonths || 0)),
    costStructure: hasCostBreakdown ? {
      totalExpense,
      rent,
      laborCost,
      otherFixedExpense,
      materialCost: purchaseCost,
      salesLinkedExpenseRate: 0,
    } : null,
    taxReserveRatio,
    safetyThresholdType: 'FIXED_COST_PLUS_DEBT_PAYMENT',
    horizonMonths: HORIZON,
    simulationCount: 5000,
    randomSeed: 42,
    diagnosis: {
      industryCv: null,
      marketRiskLevel: rank?.topPercent <= 25 ? 'LOW' : rank?.topPercent <= 60 ? 'MEDIUM' : 'HIGH',
      industryCode: diag.industryCode || null,
      region: diag.areaText || '서울',
    },
    selectedItems: equipped.map((option) => selectedItem(option, diag)).filter(Boolean),
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
  const beforeDisplay = unit === '%' && before === 0 ? '<0.1%' : `${f1(before)}${unit}`;
  const afterDisplay = unit === '%' && after === 0 ? '<0.1%' : `${f1(after)}${unit}`;
  return {
    name,
    before: beforeDisplay,
    after: afterDisplay,
    delta: Math.abs(delta) < 0.0001 ? '변화 없음' : `${sign(delta)}${unit}`,
    strike: Math.abs(delta) < 0.0001 ? 'none' : 'line-through',
    deltaColor: colors.color,
    deltaColorDark: colors.dark,
    deltaBg: colors.bg,
  };
}

function probabilityLabel(probability, simulationCount) {
  const percentage = (probability || 0) * 100;
  if (percentage < 0.1) return '거의 없음';
  if (percentage < 5) return `매우 낮음 (${f1(percentage)}%)`;
  if (percentage < 20) return `낮음 (${f1(percentage)}%)`;
  return `주의 필요 (${f1(percentage)}%)`;
}

function probabilityRow(before, after, simulationCount) {
  const delta = after - before;
  const colors = tone(delta, false);
  const bothNearZero = before * 100 < 0.1 && after * 100 < 0.1;
  return {
    name: '운영자금 부족 가능성',
    before: probabilityLabel(before, simulationCount),
    after: probabilityLabel(after, simulationCount),
    delta: bothNearZero ? '거의 없음 유지' : delta < 0 ? '위험 감소' : '위험 증가',
    strike: bothNearZero ? 'none' : 'line-through',
    deltaColor: bothNearZero ? '#5E8A3E' : colors.color,
    deltaColorDark: bothNearZero ? '#A8D284' : colors.dark,
    deltaBg: bothNearZero ? '#EDF5E1' : colors.bg,
  };
}

export function buildSimRows(simulation) {
  if (!simulation) return [];
  const baselineFlows = simulation.baseline.monthlyCashFlows;
  const selectedFlows = simulation.selectedScenario.monthlyCashFlows;
  const recurringCash = (flow) => flow.operatingCashFlow - flow.newRepayment
    - flow.financingFee - flow.financialAssetContribution + flow.financialAssetMaturityInflow;
  const beforeOperating = man(avg(baselineFlows.map(recurringCash)));
  const afterOperating = man(avg(selectedFlows.map(recurringCash)));
  const beforeRepayment = man(Math.max(...baselineFlows.map((flow) => flow.existingRepayment + flow.newRepayment), 0));
  const afterRepayment = man(Math.max(...selectedFlows.map((flow) => flow.existingRepayment + flow.newRepayment), 0));
  const beforeRisk = simulation.baseline.stochastic.bufferBreachProbability * 100;
  const afterRisk = simulation.selectedScenario.stochastic.bufferBreachProbability * 100;

  const riskRow = simulation.confidence?.level === 'LOW'
    ? {
        name: '운영자금 부족 가능성',
        before: '이력 부족',
        after: '추정 보류',
        delta: '최근 6개월 필요',
        strike: 'none',
        deltaColor: '#A79C8E',
        deltaColorDark: '#8A8178',
        deltaBg: '#F5EFE3',
      }
    : probabilityRow(
        simulation.baseline.stochastic.bufferBreachProbability,
        simulation.selectedScenario.stochastic.bufferBreachProbability,
        simulation.selectedScenario.stochastic.simulationCount,
      );

  return [
    row('대출을 갚고 매달 남는 현금', beforeOperating, afterOperating, '만원', true),
    row('매달 예상 매출', man(avg(baselineFlows.map((flow) => flow.expectedSales))), man(avg(selectedFlows.map((flow) => flow.expectedSales))), '만원', true),
    row('상환해야 할 현금이 가장 큰 달', beforeRepayment, afterRepayment, '만원', false),
    riskRow,
    row('적금·공제에 쌓인 현금', man(simulation.baseline.metrics?.financialAssetBalance), man(simulation.selectedScenario.metrics?.financialAssetBalance), '만원', true),
  ];
}

function riskProbabilityLabel(stochastic) {
  return probabilityLabel(stochastic?.bufferBreachProbability, stochastic?.simulationCount);
}

function emptyDetail() {
  const points = Array.from({ length: HORIZON }, (_, index) => ({ label: String(index + 1), before: 0, after: 0 }));
  const view = (title, unit, inverse = false) => ({ title, lead: '계산 엔진의 응답을 기다리고 있어요.', before: 0, after: 0, unit, inverse, points, facts: [] });
  return {
    views: {
      cash: view('대출을 갚고 매달 남는 현금', '만원'), sales: view('앞으로의 매출', '만원'),
      repay: view('상환해야 할 현금', '만원', true), risk: view('현금이 모자랄 가능성', '%', true),
    },
    summary: [], riskBefore: 0, riskAfter: 0,
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

export function buildSimulationDetail(simulation) {
  if (!simulation) return emptyDetail();
  const beforeFlows = simulation.baseline.monthlyCashFlows;
  const afterFlows = simulation.selectedScenario.monthlyCashFlows;
  const beforeRiskSeries = simulation.baseline.stochastic.monthlyRisks || [];
  const afterRiskSeries = simulation.selectedScenario.stochastic.monthlyRisks || [];
  const riskBefore = simulation.baseline.stochastic.bufferBreachProbability * 100;
  const riskAfter = simulation.selectedScenario.stochastic.bufferBreachProbability * 100;
  const riskBeforeLabel = riskProbabilityLabel(simulation.baseline.stochastic);
  const riskAfterLabel = riskProbabilityLabel(simulation.selectedScenario.stochastic);
  const beforeRepayment = beforeFlows.map((flow) => flow.existingRepayment + flow.newRepayment);
  const afterRepayment = afterFlows.map((flow) => flow.existingRepayment + flow.newRepayment);

  const cashPoints = flowPoints(beforeFlows, afterFlows,
    (flow) => man(flow.operatingCashFlow - flow.newRepayment - flow.financingFee
      - flow.financialAssetContribution + flow.financialAssetMaturityInflow));
  const repayPoints = flowPoints(beforeFlows, afterFlows,
    (flow) => man(flow.existingRepayment + flow.newRepayment));
  const riskPoints = beforeFlows.map((flow, index) => ({
    label: String(flow.month),
    before: f1((beforeRiskSeries[index]?.bufferBreachAtMonthProbability || 0) * 100),
    after: f1((afterRiskSeries[index]?.bufferBreachAtMonthProbability || 0) * 100),
  }));

  const cashBefore = avg(cashPoints.map((point) => point.before));
  const cashAfter = avg(cashPoints.map((point) => point.after));
  const repayBefore = man(Math.max(...beforeRepayment, 0));
  const repayAfter = man(Math.max(...afterRepayment, 0));
  const financing = simulation.financingResult;
  const forecastMonths = simulation.salesForecast?.monthlyForecasts || [];

  // The backend forecast provides lower/median/upper values from recent-sales trend and volatility.
  // Any verified product sales effect is preserved by applying the selected-to-baseline P50 ratio.
  const salesScenario = (forecastKey, lead) => {
    const points = beforeFlows.map((flow, index) => {
      const forecast = forecastMonths[index];
      const medianSales = Number(forecast?.p50 ?? flow.expectedSales);
      const scenarioSales = Number(forecast?.[forecastKey] ?? flow.expectedSales);
      const selectedSales = Number(afterFlows[index]?.expectedSales ?? flow.expectedSales);
      const selectedMultiplier = medianSales > 0 ? selectedSales / medianSales : 1;
      return {
        label: String(flow.month),
        before: man(scenarioSales),
        after: man(scenarioSales * selectedMultiplier),
      };
    });
    const before = f1(avg(points.map((point) => point.before)));
    const after = f1(avg(points.map((point) => point.after)));
    return {
      lead,
      before,
      after,
      points,
      facts: [
        { k: '12개월 예상 매출', v: `${f1(sum(points.map((point) => point.after)))}만원` },
        { k: '월평균 예상 매출', v: `${after}만원` },
        { k: '신뢰 수준', v: confidenceLabel(simulation.confidence.level) },
      ],
    };
  };
  const salesScenarios = {
    conservative: salesScenario('p10', '최근 매출 흐름이 불리하게 이어지는 경우예요.'),
    average: salesScenario('p50', '최근 매출의 평균과 추세가 이어지는 경우예요.'),
    optimistic: salesScenario('p90', '최근 매출 흐름이 좋게 이어지는 경우예요.'),
  };
  const salesScaleValues = Object.values(salesScenarios)
    .flatMap((scenario) => scenario.points.flatMap((point) => [point.before, point.after]));
  Object.values(salesScenarios).forEach((scenario) => {
    scenario.scaleValues = salesScaleValues;
  });

  const views = {
    cash: {
      title: '대출을 갚고 매달 남는 현금',
      lead: '매출에서 가게 운영비, 세금, 대출 상환액, 적금 납입액을 빼고 남는 현금이에요.',
      before: f1(cashBefore), after: f1(cashAfter), unit: '만원', points: cashPoints, scaleFromZero: true,
      facts: [
        { k: '12개월 후 잔액', v: `${man(simulation.selectedScenario.deterministic.endingCash)}만원` },
        { k: '최저 현금잔액', v: `${man(simulation.selectedScenario.deterministic.minimumCashBalance)}만원` },
        { k: '어려운 상황을 가정한 12개월 후 현금', v: `${man(simulation.selectedScenario.stochastic.endingCashP5)}만원` },
      ],
    },
    sales: {
      title: '앞으로의 매출',
      unit: '만원', scaleFromZero: false,
      ...salesScenarios.average,
      scenarios: salesScenarios,
    },
    repay: {
      title: '상환해야 할 현금',
      lead: '기존 대출과 새로 고른 대출을 합쳐, 매달 실제로 내야 하는 현금이에요.',
      before: f1(repayBefore), after: f1(repayAfter), unit: '만원', inverse: true, points: repayPoints, scaleFromZero: false,
      facts: [
        { k: '상환해야 할 현금이 가장 큰 달', v: `${man(financing.maxMonthlyRepayment)}만원` },
        { k: '12개월 이자', v: `${man(financing.totalInterest)}만원` },
        { k: '수수료', v: `${man(financing.totalFees)}만원` },
      ],
    },
    risk: {
      title: '현금이 모자랄 가능성',
      lead: '매출 변동과 고정비, 대출 상환을 함께 반영한 참고용 추정치예요.',
      before: f1(riskBefore), after: f1(riskAfter), unit: '%', inverse: true, points: riskPoints, scaleFromZero: true,
      displayBefore: riskBeforeLabel,
      displayAfter: riskAfterLabel,
      unavailable: simulation.confidence.level === 'LOW',
      facts: [
        { k: '가게 운영에 필요한 현금이 모자랄 가능성', v: riskAfterLabel },
        { k: '현금이 바닥날 가능성', v: probabilityLabel(simulation.selectedScenario.stochastic.negativeCashProbability, simulation.selectedScenario.stochastic.simulationCount) },
        { k: '추정 신뢰 수준', v: confidenceLabel(simulation.confidence.level) },
      ],
    },
  };

  const summary = [
    { label: '12개월 후 현금', value: `${man(simulation.selectedScenario.deterministic.endingCash)}만원`, delta: `${sign(man(simulation.selectedScenario.deterministic.endingCash - simulation.baseline.deterministic.endingCash))}만원`, good: simulation.selectedScenario.deterministic.endingCash >= simulation.baseline.deterministic.endingCash },
    { label: '불리한 상황의 예상 현금', value: `${man(simulation.selectedScenario.stochastic.endingCashP5)}만원`, delta: `${sign(man(simulation.baselineComparison.endingCashP5Delta))}만원`, good: simulation.baselineComparison.endingCashP5Delta >= 0 },
    { label: '가게 운영에 필요한 현금이 모자랄 가능성', value: riskAfterLabel, delta: riskAfter < riskBefore ? '위험 감소' : riskAfter > riskBefore ? '위험 증가' : '변화 없음', good: riskAfter <= riskBefore },
    { label: '매출 중 상환해야 할 현금 비중', value: `${f1(financing.maxRepaymentBurdenRatio * 100)}%`, delta: simulation.constraints.repaymentBurdenPassed ? '안전 기준 통과' : '안전 기준 초과', good: simulation.constraints.repaymentBurdenPassed },
  ];

  return {
    views, summary, riskBefore, riskAfter, riskBeforeLabel, riskAfterLabel,
    warnings: simulation.warnings.map((warning) => {
      if (warning.includes('Tax reserve was not estimated')) return '세금 납부 이력이 없어 세금 대비 적립액은 계산에서 제외했어요.';
      if (warning.includes('Final product eligibility')) return '최종 가입 자격은 연결된 공식 공고에서 확인이 필요해요.';
      if (warning.includes('Short sales history')) return '매출 이력이 짧아 미래 추정의 신뢰 수준이 낮아요.';
      if (warning.includes('Policy financing uses')) return '정책자금 금리와 상환조건은 연결된 공식 공고에서 최종 확인해야 해요.';
      if (warning.includes('Policy benefits without structured')) return '지급 시기와 자기부담 조건이 없는 정책은 금액 효과를 임의 계산하지 않았어요.';
      if (warning.includes('Sales forecast provider')) return '미래 매출은 학습형 신용모델이 아닌 최근 매출 추세 기반 참고값이에요.';
      return warning;
    }),
    violations: simulation.constraints.violations.map((violation) => {
      if (violation.includes('Maximum monthly debt payment')) return '월 상환액이 매출 대비 안전 기준을 초과했어요.';
      if (violation.includes('Eligibility')) return '가입 자격 확인이 필요한 상품이 있어요.';
      if (violation.includes('Duplicate')) return '함께 선택할 수 없는 상품 조합이에요.';
      if (violation.includes('funding')) return '필요 금액보다 대출금이 과도해요.';
      return violation;
    }),
    confidence: simulation.confidence,
  };
}
