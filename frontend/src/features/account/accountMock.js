// KB 계좌 마이데이터 연동 결과(프로토타입 시뮬레이션).
// 실서비스에서는 본인인증 + 마이데이터 API 응답으로 교체된다.
// InfoScreen(입력 자동채움)과 HomeScreen/AccountScreen(계좌·거래내역 표시)이 함께 쓴다.

/** 연동 시 온보딩 입력을 자동으로 채우는 재무 요약 */
export const KB_FINANCIALS = {
  monthlySalesAvg: 24_800_000,
  totalMonthlyExpense: 18_500_000,
  monthlyLoanPayment: 1_800_000,
  cardCashRatio: '카드 72% · 현금 28%',
};

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
