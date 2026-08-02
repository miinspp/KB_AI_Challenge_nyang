const HORIZON = 12;

export const SIM_VIEWS = [
  { key: 'cash', label: '매달 남는 현금' },
  { key: 'sales', label: '앞으로의 매출' },
  { key: 'repay', label: '상환해야 할 현금' },
  { key: 'risk', label: '현금 부족 위험' },
];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const f1 = (value) => Math.round(value * 10) / 10;
const f2 = (value) => Math.round(value * 100) / 100;
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

export function buildSimulationPayload({ rank, diag, hometax, kb, equipped }) {
  const currentSales = Math.max(0, Number(rank?.sales?.value) || Number(diag.salesMan) * 10_000 || 0);
  const monthlyHistory = Array.isArray(hometax?.monthlyHistory) ? hometax.monthlyHistory : [];
  const historySource = monthlyHistory.length
    ? monthlyHistory.map((entry) => ({ month: entry.month, amount: entry.sales }))
    : (hometax?.salesHistory || []);
  const history = historySource
    .map((entry) => Number(entry?.amount ?? entry))
    .filter((amount) => Number.isFinite(amount) && amount >= 0);
  const monthlySales = history.length >= 3 ? history : [currentSales, currentSales, currentSales];
  const monthlySalesMonths = history.length >= 3
    ? historySource.map((entry) => entry?.month).filter(Boolean)
    : [];

  const expense = Math.max(0, Number(diag.expenseMan || 0) * 10_000);
  const purchaseCost = Math.max(0, Number(diag.purchaseMan || 0) * 10_000);
  const rent = Math.max(0, Number(diag.rentMan || 0) * 10_000);
  const laborCost = Math.max(0, Number(diag.laborMan || 0) * 10_000);
  const knownCosts = rent + laborCost + purchaseCost;
  const totalExpense = Math.max(expense, knownCosts);
  const otherFixedExpense = Math.max(0, totalExpense - knownCosts);
  const variableCostRatio = currentSales > 0 ? clamp(purchaseCost / currentSales, 0, 0.8) : 0;
  const fixedCost = Math.max(0, totalExpense - purchaseCost);
  const linkedAccountCash = (kb?.accounts || []).reduce((sum, account) => sum + Math.max(0, Number(account.balance) || 0), 0);
  const currentCash = linkedAccountCash || Math.max(0, Number(diag.currentCashMan || 0) * 10_000);
  const existingDebtTotal = Math.max(0, Number(diag.existingDebtMan || 0) * 10_000);
  const existingMonthlyPayment = Math.max(0, Number(diag.existingMonthlyPaymentMan || 0) * 10_000);
  const hasCostBreakdown = totalExpense > 0 || knownCosts > 0;
  const averageHistorySales = history.length ? avg(history) : currentSales;
  const annualTaxPaid = Math.max(0, Number(diag.annualTaxPaidMan || 0) * 10_000);
  const taxReserveRatio = annualTaxPaid > 0 && averageHistorySales > 0
    ? clamp(annualTaxPaid / (averageHistorySales * 12), 0, 0.3)
    : null;
  const monthlyExpenseHistory = monthlyHistory.map((entry) => ({
    month: entry.month,
    totalExpense: Math.max(0, Number(entry.totalExpense) || 0),
    rent: Math.max(0, Number(entry.rent) || 0),
    laborCost: Math.max(0, Number(entry.laborCost) || 0),
    materialCost: Math.max(0, Number(entry.purchaseCost ?? entry.materialCost) || 0),
    cardFee: Math.max(0, Number(entry.cardFee) || 0),
    otherExpense: Math.max(0, Number(entry.otherExpense) || 0),
  }));
  const existingLoans = (kb?.loans || []).map((loan) => ({
    id: loan.id,
    name: loan.name,
    balance: Math.max(0, Number(loan.balance) || 0),
    annualRate: Math.max(0, Number(loan.annualRate) || 0),
    repaymentType: loan.repaymentType,
    monthlyPayment: Math.max(0, Number(loan.monthlyPayment) || 0),
    remainingMonths: Math.max(0, Number(loan.remainingMonths) || 0),
    nextPaymentDate: loan.nextPaymentDate,
    maturityDate: loan.maturityDate,
  }));
  const scheduledTaxPayments = (hometax?.scheduledTaxPayments || []).map((payment) => ({
    month: Number(payment.month),
    type: payment.type,
    dueDate: payment.dueDate ?? payment.date,
    amount: Math.max(0, Number(payment.amount) || 0),
  }));
  const monthlyAccountCashFlows = (kb?.monthlyCashFlowHistory || []).map((flow) => ({
    month: flow.month,
    inflow: Math.max(0, Number(flow.inflow) || 0),
    outflow: Math.max(0, Number(flow.outflow) || 0),
    netCashFlow: Number.isFinite(Number(flow.netCashFlow))
      ? Number(flow.netCashFlow)
      : (Number(flow.inflow) || 0) - (Number(flow.outflow) || 0),
  }));

  return {
    monthlySales,
    monthlySalesMonths,
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
    taxReserveRatio: scheduledTaxPayments.length ? null : taxReserveRatio,
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
    monthlyExpenseHistory,
    existingLoans,
    scheduledTaxPayments,
    monthlyAccountCashFlows,
  };
}

// ─────────────────────────────────────────────────────────────
// 상황 실험실 — 이미 계산된 buildSimulationPayload 결과에 "가정"(매출·고정비·보유현금 변동)만
// 얹어 다시 Java로 보낸다. 새 계산 로직은 없다 — 매출 이력에 배율을 곱하고, 고정비/보유현금에
// 더하는 순수 변환뿐이라 Java 엔진은 그대로 재사용한다.
// ─────────────────────────────────────────────────────────────
export function applyScenarioAdjustments(payload, { salesDeltaPct = 0, fixedCostDeltaMan = 0, cashDeltaMan = 0 } = {}) {
  if (!payload) return payload;
  const salesMultiplier = 1 + salesDeltaPct / 100;
  const fixedCostDelta = fixedCostDeltaMan * 10_000;
  const cashDelta = cashDeltaMan * 10_000;
  const cs = payload.costStructure;
  // otherFixedExpense가 0 밑으로 잘리는 경우, totalExpense도 원래 델타 그대로가 아니라
  // "잘린 뒤의 부품 합"으로 다시 맞춰야 한다 — 그래야 rent+laborCost+materialCost+otherFixedExpense
  // === totalExpense 라는 buildSimulationPayload의 원래 불변식이 깨지지 않는다.
  const otherFixedExpense = cs ? Math.max(0, cs.otherFixedExpense + fixedCostDelta) : null;
  return {
    ...payload,
    monthlySales: payload.monthlySales.map((amount) => Math.max(0, amount * salesMultiplier)),
    fixedCost: Math.max(0, payload.fixedCost + fixedCostDelta),
    currentCash: Math.max(0, payload.currentCash + cashDelta),
    costStructure: cs ? {
      ...cs,
      otherFixedExpense,
      totalExpense: cs.rent + cs.laborCost + cs.materialCost + otherFixedExpense,
    } : null,
    // 홈택스로 월별 지출 이력(monthlyExpenseHistory)이 3개월 이상 연동돼 있으면, 백엔드는
    // costStructure/fixedCost를 완전히 무시하고 이 이력의 rent+laborCost+otherExpense 평균만으로
    // 고정비를 계산한다(resolveCostModel). 이 이력을 같이 조정하지 않으면 고정비 슬라이더가
    // 이 사용자군에게는 아무 효과가 없다 — 위 costStructure와 같은 방식으로 otherExpense에
    // 델타를 반영하고, totalExpense도 부품 합으로 다시 맞춘다.
    monthlyExpenseHistory: payload.monthlyExpenseHistory?.length
      ? payload.monthlyExpenseHistory.map((entry) => {
          const otherExpense = Math.max(0, (entry.otherExpense || 0) + fixedCostDelta);
          const rent = entry.rent || 0;
          const laborCost = entry.laborCost || 0;
          const materialCost = entry.materialCost || 0;
          const cardFee = entry.cardFee || 0;
          return {
            ...entry,
            otherExpense,
            totalExpense: rent + laborCost + materialCost + cardFee + otherExpense,
          };
        })
      : payload.monthlyExpenseHistory,
  };
}

// ─────────────────────────────────────────────────────────────
// 조합 분석 AI — 성향분석 결과를 받아 조합 후보를 만들고(코드), 후보별 실제
// 시뮬레이션(Java, 이 파일의 buildSimulationPayload 그대로 재사용)을 돌린 뒤,
// 그 결과만 Claude Sonnet에 넘겨 Top3 선정+설명을 받는다(백엔드 portfolio_advisor.py).
// 계산은 전부 기존 로직 그대로이고, 여기 추가되는 건 "조합을 어떻게 고를지"뿐이다.
// ─────────────────────────────────────────────────────────────

// 성향별 상품 유형 가중치 — 조합을 만들기 전에 추천 상품을 성향에 맞게 1차로 추린다.
const PROFILE_TYPE_WEIGHT = {
  AGGRESSIVE: { LOAN: 1, GRANT: 1.2, SAVINGS: 0.3, MUTUAL_AID: 0.4, INSURANCE: 0.2 },
  BALANCED: { LOAN: 0.85, GRANT: 0.9, SAVINGS: 0.75, MUTUAL_AID: 0.75, INSURANCE: 0.6 },
  CONSERVATIVE: { LOAN: 0.5, GRANT: 0.6, SAVINGS: 1.1, MUTUAL_AID: 1, INSURANCE: 0.9 },
};

function scoreOptionForProfile(option, profileType) {
  const weights = PROFILE_TYPE_WEIGHT[profileType] || PROFILE_TYPE_WEIGHT.BALANCED;
  const typeWeight = weights[option.type] ?? 0.65;
  return typeWeight * (Number(option.fit) || 50);
}

// 추천 상품 중 성향에 맞는 상위 `limit`개만 남긴다 — 이후 조합은 이 안에서만 만든다.
export function pickOptionsForProfile(options, profileType, limit = 6) {
  return [...options]
    .sort((a, b) => scoreOptionForProfile(b, profileType) - scoreOptionForProfile(a, profileType))
    .slice(0, limit);
}

// 대출 2개 이상 조합은 제외한다 — selectedItem()이 대출마다 동일한 desiredFundingMan(희망 대출액)을
// 그대로 넣어서 Java가 이를 합산하므로, 조합 생성 단계에서 배분하지 않는 한 대출 2개 조합은
// 희망액이 상품 수만큼 중복 적용된다(예: 희망 1,000만원 + 대출 2개 = 조달 2,000만원).
const comboConflicts = (a, b) => (Boolean(a.duplicateGroup) && a.duplicateGroup === b.duplicateGroup)
  || (a.type === 'LOAN' && b.type === 'LOAN');

// 유효한 1~3개 조합 후보를 전부 만들고(중복그룹 충돌·자격FAIL·대환조건 미충족 제외),
// 성향 적합도 평균이 높은 순으로 최대 maxCandidates개만 남긴다.
export function generateCandidateCombos(options, diag, { maxSize = 3, maxCandidates = 10 } = {}) {
  const hasExistingDebt = Number(diag?.existingDebtMan || 0) > 0;
  const eligible = options.filter((option) => option.eligibilityStatus !== 'FAIL'
    && (!option.requiresExistingDebt || hasExistingDebt));
  const n = eligible.length;
  if (n === 0) return [];

  const combos = [];
  for (let size = 1; size <= Math.min(maxSize, n); size += 1) {
    const indices = Array.from({ length: size }, (_, i) => i);
    for (;;) {
      const combo = indices.map((i) => eligible[i]);
      const hasConflict = combo.some((a, i) => combo.slice(i + 1).some((b) => comboConflicts(a, b)));
      if (!hasConflict) combos.push(combo);

      let cursor = size - 1;
      while (cursor >= 0 && indices[cursor] === n - size + cursor) cursor -= 1;
      if (cursor < 0) break;
      indices[cursor] += 1;
      for (let after = cursor + 1; after < size; after += 1) indices[after] = indices[after - 1] + 1;
    }
  }

  return combos
    .map((items) => ({
      comboId: items.map((item) => item.key).sort().join('+'),
      items,
      score: items.reduce((sumScore, item) => sumScore + (Number(item.fit) || 50), 0) / items.length,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxCandidates);
}

// 조합 후보마다 실제 /api/simulation 페이로드를 만든다 — buildSimulationPayload 그대로 재사용,
// equipped만 조합별로 바꿔 끼운다.
export function buildCandidatePayloads(base, combos) {
  return combos.map((combo) => ({
    comboId: combo.comboId,
    items: combo.items,
    payload: buildSimulationPayload({ ...base, equipped: combo.items }),
  }));
}

// "이 조합 분석 결과 자세히 보기"에 필요한 candidate payload — 시뮬레이터 탭과 AI 분석결과 탭이
// 항상 같은 모양으로 /api/portfolio/detail을 호출하도록 여기서 한 번만 조립한다.
export function buildComboDetailCandidate(combo, simulation) {
  return {
    comboId: combo.comboId,
    products: combo.items.map((item) => ({ id: item.id, name: item.short || item.name, type: item.type })),
    metrics: summarizeSimulationForAdvisor(simulation),
  };
}

// Claude에 넘길 조합별 핵심 지표 — 존재하는 숫자만 추려 보낸다(신규 계산 없음, 인용만 가능하게).
export function summarizeSimulationForAdvisor(simulation) {
  if (!simulation) return null;
  const metrics = simulation.selectedScenario.metrics;
  const stochastic = simulation.selectedScenario.stochastic;
  const financing = simulation.financingResult;
  return {
    monthlyNetCashManwon: man(metrics.averageMonthlyNetCashFlow),
    endingCashManwon: man(simulation.selectedScenario.deterministic.endingCash),
    endingCashP5Manwon: man(stochastic.endingCashP5),
    cashShortageRisk: Math.round(stochastic.bufferBreachProbability * 1000) / 1000,
    maxRepaymentBurdenRatio: Math.round(financing.maxRepaymentBurdenRatio * 1000) / 1000,
    repaymentBurdenPassed: simulation.constraints.repaymentBurdenPassed,
    totalFundingManwon: man(financing.totalFundingAmount),
    confidence: simulation.confidence?.level,
  };
}

// 상황 실험실의 "조합 A vs 조합 B" 비교 카드용 — DSR·몬테카를로 판정·현금부족확률만 뽑는다.
// summarizeSimulationForAdvisor와 달리 %/회 단위로 그대로 표시할 값을 만든다(신규 계산 없음).
export function summarizeConstraintCheck(simulation) {
  if (!simulation) return null;
  const financing = simulation.financingResult;
  const constraints = simulation.constraints;
  const stochastic = simulation.selectedScenario?.stochastic;
  const passed = Boolean(constraints?.repaymentBurdenPassed) && (constraints?.violations?.length ?? 0) === 0;
  return {
    dsrPct: Math.round((financing?.maxRepaymentBurdenRatio || 0) * 1000) / 10,
    dsrPassed: Boolean(constraints?.repaymentBurdenPassed),
    passed,
    violationCount: constraints?.violations?.length ?? 0,
    simulationCount: stochastic?.simulationCount ?? 5000,
    cashShortageRiskPct: Math.round((stochastic?.bufferBreachProbability || 0) * 1000) / 10,
  };
}

function tone(delta, goodUp) {
  if (Math.abs(delta) < 0.0001) return { color: '#B6AE9F', dark: '#8F8779', bg: '#F2ECE1' };
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
  const value = probability || 0;
  const percentage = value * 100;
  // 정말 0회 발생한 경우에만 "거의 없음" — 5,000회 중 1회(0.02%)처럼 값은 있는데
  // 소수 첫째 자리에서 반올림하면 0.0%로 사라지는 경우까지 "없음"으로 뭉개면 안 된다.
  if (value <= 0) return '거의 없음';
  if (percentage < 0.1) {
    const count = Math.max(1, Math.round(value * (simulationCount || 0)));
    const detail = simulationCount ? ` (${simulationCount.toLocaleString()}회 중 ${count}회)` : '';
    return `매우 낮음 (${f2(percentage)}%${detail})`;
  }
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
        deltaColor: '#A39B8C',
        deltaColorDark: '#8F8779',
        deltaBg: '#F2ECE1',
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
  // 그 달에만 안전선 아래로 내려갈 확률(bufferBreachAtMonthProbability)이 아니라, 그 달까지
  // 누적된 확률(bufferBreachProbability)을 그린다 — 카드 요약("가게 운영에 필요한 현금이
  // 모자랄 가능성")도 12개월 누적값이라, 그래프를 다른 지표로 그리면 같은 이름인데 그래프는
  // 평평하고 카드는 높은 값이 뜨는 모순이 생긴다. 두 곳을 같은 지표로 통일한다.
  const riskPoints = beforeFlows.map((flow, index) => ({
    label: String(flow.month),
    before: f1((beforeRiskSeries[index]?.bufferBreachProbability || 0) * 100),
    after: f1((afterRiskSeries[index]?.bufferBreachProbability || 0) * 100),
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
    conservative: salesScenario('p10', '최근 매출 범위의 낮은 수준이 이어지는 경우예요.'),
    average: salesScenario('p50', '최근 매출 범위의 기준 수준이 이어지는 경우예요.'),
    optimistic: salesScenario('p90', '최근 매출 범위의 높은 수준이 이어지는 경우예요.'),
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
      if (warning.includes('Missing loan, account cash flow, and tax schedule')) return '대출 상환 스케줄·계좌 흐름·세금 일정 정보가 모두 없어 신뢰 수준을 한 단계 낮췄어요.';
      if (warning.includes('Policy financing uses')) return '정책자금 금리와 상환조건은 연결된 공식 공고에서 최종 확인해야 해요.';
      if (warning.includes('Policy benefits without structured')) return '지급 시기와 자기부담 조건이 없는 정책은 금액 효과를 임의 계산하지 않았어요.';
      if (warning.includes('Sales forecast provider')) return '미래 매출은 학습형 신용모델이 아닌 최근 매출 추세 기반 참고값이에요.';
      if (warning.includes('Linked monthly expense history')) return '연동된 월별 지출 내역으로 평균 비용과 변동성을 계산했어요.';
      if (warning.includes('Legacy fixedCost/variableCostRatio')) return '세부 지출 내역이 없어 고정비·변동비 비율로 단순 계산했어요.';
      if (warning.includes('Unclassified total expense')) return '분류되지 않은 지출은 기타 고정비로 반영했어요.';
      if (warning.includes('totalExpense was split')) return '세부 항목이 없어 전체 지출을 변동비율 기준으로 나눠 계산했어요.';
      if (warning.includes('Linked loan-level repayment')) return '연동된 대출별 실제 상환 스케줄을 반영했어요.';
      if (warning.includes('Linked scheduled tax payments')) return '연동된 세금 납부 예정일과 금액을 반영했어요.';
      if (warning.includes('Linked monthly account cash flows')) return '연동된 월별 계좌 입출금으로 분류되지 않은 현금흐름 변동성을 보정했어요.';
      if (warning.includes('Insurance premiums affect')) return '보험료는 현금흐름에 반영했지만, 보장 혜택 금액은 별도로 계산하지 않았어요.';
      if (warning.includes('One or more KB product terms')) return '일부 KB상품은 공식 금리·조건이 확정되기 전까지 참고용 기본값을 사용했어요.';
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
