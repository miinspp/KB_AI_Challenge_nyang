// 연동 결과 mock (프로토타입 시뮬레이션).
// 실서비스에서는 본인인증 + 마이데이터 / 국세청 API 응답으로 교체된다.
// InfoScreen(입력 자동채움) · HomeScreen · AccountScreen · HometaxScreen 이 함께 쓴다.

/**
 * 연동 시 온보딩 입력을 자동으로 채우는 값 — 진단 입력 v2 역할 분담:
 *   홈택스 = 매출·지출·지출세부·12개월 이력 / KB = 보유현금·기존 대출 (홈택스엔 없는 계좌·여신 정보)
 */
const LINKED_ACCOUNTS = [
  { id: 'KB-BIZ-001', name: 'KB 사업자통장', balance: 8_420_000 },
  { id: 'KB-RESERVE-001', name: '세금·운영 예비통장', balance: 6_580_000 },
];

const KB_MONTHLY_CASH_FLOW = [
  ['2025-08', 22_420_000, 20_350_000],
  ['2025-09', 23_180_000, 20_790_000],
  ['2025-10', 23_910_000, 21_240_000],
  ['2025-11', 24_730_000, 21_680_000],
  ['2025-12', 26_780_000, 22_910_000],
  ['2026-01', 23_650_000, 24_410_000],
  ['2026-02', 22_960_000, 21_270_000],
  ['2026-03', 25_080_000, 22_120_000],
  ['2026-04', 24_410_000, 21_730_000],
  ['2026-05', 25_690_000, 25_430_000],
  ['2026-06', 24_920_000, 22_050_000],
  ['2026-07', 26_180_000, 25_120_000],
].map(([month, inflow, outflow]) => ({
  month,
  inflow,
  outflow,
  netCashFlow: inflow - outflow,
}));

const LINKED_LOANS = [
  {
    id: 'KB-LOAN-001', name: 'KB 소상공인 든든 운영자금 대출',
    balance: 30_000_000, annualRate: 0.052, repaymentType: 'EQUAL_PAYMENT',
    monthlyPayment: 1_285_000, remainingMonths: 24,
    nextPaymentDate: '2026-08-15', maturityDate: '2028-07-15',
  },
  {
    id: 'KB-LOAN-002', name: '사업자 시설자금 대출',
    balance: 12_000_000, annualRate: 0.046, repaymentType: 'EQUAL_PRINCIPAL',
    monthlyPayment: 545_000, remainingMonths: 24,
    nextPaymentDate: '2026-08-25', maturityDate: '2028-07-25',
  },
];

export const KB_LINK = {
  accounts: LINKED_ACCOUNTS,
  loans: LINKED_LOANS,
  monthlyCashFlowHistory: KB_MONTHLY_CASH_FLOW,
  currentCash: LINKED_ACCOUNTS.reduce((sum, account) => sum + account.balance, 0),
  existingDebtBalance: LINKED_LOANS.reduce((sum, loan) => sum + loan.balance, 0),
  monthlyLoanPayment: LINKED_LOANS.reduce((sum, loan) => sum + loan.monthlyPayment, 0),
  existingLoanRatePct: String((LINKED_LOANS.reduce((sum, loan) => sum + loan.balance * loan.annualRate, 0)
    / LINKED_LOANS.reduce((sum, loan) => sum + loan.balance, 0) * 100).toFixed(2)),
  existingLoanRemainingMonths: String(Math.max(...LINKED_LOANS.map((loan) => loan.remainingMonths))),
};

/**
 * 국세청 홈택스 연동 결과 — 업종·매출·지출·지출세부·12개월 이력.
 * (InfoScreen 자동채움 + HometaxScreen 상세 표시)
 */
const HOMETAX_MONTHLY_HISTORY = [
  ['2025-08', 22_800_000, 8_650_000, 3_800_000, 2_500_000, 410_000, 3_240_000],
  ['2025-09', 23_600_000, 8_920_000, 3_850_000, 2_500_000, 425_000, 3_260_000],
  ['2025-10', 24_400_000, 9_150_000, 3_900_000, 2_500_000, 439_000, 3_310_000],
  ['2025-11', 25_200_000, 9_420_000, 4_050_000, 2_500_000, 454_000, 3_350_000],
  ['2025-12', 27_300_000, 10_180_000, 4_250_000, 2_500_000, 491_000, 3_490_000],
  ['2026-01', 24_100_000, 9_080_000, 4_050_000, 2_500_000, 434_000, 3_360_000],
  ['2026-02', 23_400_000, 8_860_000, 3_950_000, 2_500_000, 421_000, 3_300_000],
  ['2026-03', 25_600_000, 9_520_000, 4_100_000, 2_500_000, 461_000, 3_390_000],
  ['2026-04', 24_900_000, 9_310_000, 4_050_000, 2_500_000, 448_000, 3_370_000],
  ['2026-05', 26_200_000, 9_760_000, 4_150_000, 2_500_000, 472_000, 3_430_000],
  ['2026-06', 25_400_000, 9_470_000, 4_100_000, 2_500_000, 457_000, 3_400_000],
  ['2026-07', 26_700_000, 9_920_000, 4_200_000, 2_500_000, 481_000, 3_450_000],
].map(([month, sales, purchaseCost, laborCost, rent, cardFee, otherExpense]) => ({
  month, sales, purchaseCost, laborCost, rent, cardFee, otherExpense,
  totalExpense: purchaseCost + laborCost + rent + cardFee + otherExpense,
}));

const monthlyAverage = (key) => Math.round(
  HOMETAX_MONTHLY_HISTORY.reduce((sum, row) => sum + row[key], 0) / HOMETAX_MONTHLY_HISTORY.length,
);

export const HOMETAX_FINANCIALS = {
  industryCode: 'CS100001',        // 한식음식점
  industryName: '한식음식점',
  maskedBusinessNumber: '123-45-*****',
  basisPeriod: '최근 12개월',
  monthlySalesAvg: monthlyAverage('sales'),
  totalMonthlyExpense: monthlyAverage('totalExpense'),
  rent: monthlyAverage('rent'),
  laborCost: monthlyAverage('laborCost'),
  purchaseCost: monthlyAverage('purchaseCost'),
  cardFee: monthlyAverage('cardFee'),
  otherExpense: monthlyAverage('otherExpense'),
  monthlyHistory: HOMETAX_MONTHLY_HISTORY,
  salesHistory: HOMETAX_MONTHLY_HISTORY.map(({ month, sales }) => ({ month, amount: sales })),
  recentTaxPayments: [
    { type: '부가가치세', paidDate: '2026-01-26', amount: 2_740_000 },
    { type: '종합소득세', paidDate: '2026-05-31', amount: 3_180_000 },
    { type: '부가가치세', paidDate: '2026-07-27', amount: 2_960_000 },
  ],
  scheduledTaxPayments: [
    { month: 3, type: '부가가치세 예정고지', dueDate: '2026-10-26', amount: 2_850_000 },
    { month: 6, type: '부가가치세 확정신고', dueDate: '2027-01-25', amount: 3_050_000 },
    { month: 10, type: '종합소득세', dueDate: '2027-05-31', amount: 3_300_000 },
  ],
};

/**
 * 이미 가입해 이용 중인 상품 — KB 계좌를 연결하면 마이데이터로 불러온다는 설정.
 * 시뮬레이터의 '장착'(가상 실험)과는 별개다. 기존 대출 항목은 KB_LINK 의
 * 잔액·금리·잔여기간과 같은 값이어야 진단/시뮬 입력과 어긋나지 않는다.
 */
export const JOINED_PRODUCTS = [
  {
    id: 'joined-loan', icon: '₩', iconBg: '#E4EEF9', iconColor: 'var(--blue)',
    name: 'KB 소상공인 든든 운영자금 대출',
    spec: `잔액 ${(KB_LINK.existingDebtBalance / 10000).toLocaleString()}만원 · 연 ${KB_LINK.existingLoanRatePct}% · ${KB_LINK.existingLoanRemainingMonths}개월 남음`,
    status: '상환중',
  },
  {
    id: 'joined-aid', icon: '☂', iconBg: '#FFF0E4', iconColor: '#D07A3A',
    name: '노란우산공제',
    spec: '월 10만원 납입 · 누적 240만원',
    status: '납입중',
  },
  {
    id: 'joined-card', icon: '▣', iconBg: '#EEF0F8', iconColor: '#7E8BC4',
    name: 'KB 사업자 체크카드',
    spec: '이번 달 사용 320만원',
    status: '사용중',
  },
];

/** 사업자 주거래 계좌 */
export const KB_ACCOUNT = {
  bank: 'KB국민은행',
  name: 'KB 사업자통장',
  number: '487102-01-210612',
  balance: 8_420_000,
  rateText: '연 0.1%',
};

/**
 * 최근 거래내역 — 최신순. amount 부호: 입금(+) / 출금(−).
 * 잔액은 KB_ACCOUNT.balance 에서 역산하므로(withBalance) 여기에 따로 담지 않는다.
 */
export const KB_TXNS = [
  { id: 'A01', date: '2026-07-25', time: '19:16', name: 'KB카드 매출입금', amount: 842_000 },
  { id: 'A02', date: '2026-07-25', time: '11:02', name: '(주)우아한형제들', amount: 613_400 },
  { id: 'A03', date: '2026-07-24', time: '18:40', name: '신선유통 식자재', amount: -1_240_000 },
  { id: 'A04', date: '2026-07-24', time: '09:15', name: 'KB카드 매출입금', amount: 915_200 },
  { id: 'A05', date: '2026-07-23', time: '14:22', name: '한국전력공사', amount: -286_400 },
  { id: 'A06', date: '2026-07-23', time: '09:10', name: 'KB카드 매출입금', amount: 734_800 },
  { id: 'A07', date: '2026-07-22', time: '17:05', name: '쿠팡이츠서비스', amount: 398_100 },
  { id: 'A08', date: '2026-07-22', time: '10:00', name: '국민건강보험공단', amount: -412_300 },
  { id: 'A09', date: '2026-07-21', time: '19:44', name: '현금입금', amount: 338_600 },
  { id: 'A10', date: '2026-07-21', time: '09:12', name: 'KB카드 매출입금', amount: 689_500 },
  { id: 'A11', date: '2026-07-20', time: '16:30', name: '우리마트 식자재', amount: -876_000 },
  { id: 'A12', date: '2026-07-20', time: '09:05', name: 'KB카드 매출입금', amount: 1_024_700 },
  { id: 'A13', date: '2026-07-18', time: '13:00', name: '김민서 급여', amount: -1_850_000 },
  { id: 'A14', date: '2026-07-15', time: '09:00', name: 'KB 소상공인대출 이자', amount: -142_000 },
  { id: 'A15', date: '2026-07-10', time: '10:00', name: '역삼빌딩 임대료', amount: -2_500_000 },
  { id: 'A16', date: '2026-07-08', time: '12:30', name: '(주)케이지이니시스', amount: 77_600 },
  { id: 'A17', date: '2026-07-05', time: '09:20', name: 'KB카드 매출입금', amount: 806_300 },
  { id: 'A18', date: '2026-07-03', time: '11:40', name: 'SK텔레콤', amount: -68_900 },
];

/**
 * 최신순 거래에 거래 후 잔액을 붙인다.
 * 첫 행(가장 최근) 잔액 = 현재 잔액, 이후로는 앞 거래 금액을 되돌려 역산한다.
 */
export function withBalance(txns, currentBalance) {
  let running = currentBalance;
  return txns.map((t) => {
    const balance = running;
    running -= t.amount;
    return { ...t, balance };
  });
}
