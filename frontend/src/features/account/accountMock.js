// 연동 결과 mock (프로토타입 시뮬레이션).
// 실서비스에서는 본인인증 + 마이데이터 / 국세청 API 응답으로 교체된다.
// InfoScreen(입력 자동채움) · HomeScreen · AccountScreen · HometaxScreen 이 함께 쓴다.

/**
 * 연동 시 온보딩 입력을 자동으로 채우는 값 — 진단 입력 v2 역할 분담:
 *   홈택스 = 매출·지출·지출세부·6개월 이력 / KB = 보유현금·기존 대출 (홈택스엔 없는 계좌·여신 정보)
 */
export const KB_LINK = {
  currentCash: 15_000_000,
  existingDebtBalance: 42_000_000,
  monthlyLoanPayment: 1_800_000,
  existingLoanRatePct: '5.2',
  existingLoanRemainingMonths: '24',
};

/**
 * 국세청 홈택스 연동 결과 — 업종·매출·지출·지출세부·6개월 이력.
 * (InfoScreen 자동채움 + HometaxScreen 상세 표시)
 */
export const HOMETAX_FINANCIALS = {
  industryCode: 'CS100001',        // 한식음식점
  industryName: '한식음식점',
  maskedBusinessNumber: '123-45-*****',
  basisPeriod: '최근 6개월',
  monthlySalesAvg: 25_000_000,
  totalMonthlyExpense: 19_000_000,
  rent: 2_500_000,
  laborCost: 4_000_000,
  purchaseCost: 9_000_000,
  otherExpense: 3_500_000,
  salesHistory: [23_800_000, 24_100_000, 25_600_000, 24_900_000, 26_200_000, 25_400_000],
};

/**
 * 이미 가입해 이용 중인 상품 — KB 계좌를 연결하면 마이데이터로 불러온다는 설정.
 * 시뮬레이터의 '장착'(가상 실험)과는 별개다. 기존 대출 항목은 KB_LINK 의
 * 잔액·금리·잔여기간과 같은 값이어야 진단/시뮬 입력과 어긋나지 않는다.
 */
export const JOINED_PRODUCTS = [
  {
    id: 'joined-loan', icon: '₩', iconBg: '#FFF1CC', iconColor: 'var(--gold-link)',
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
    id: 'joined-card', icon: '▣', iconBg: '#E4EEF9', iconColor: 'var(--blue)',
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
