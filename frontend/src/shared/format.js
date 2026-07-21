// 금액·숫자 표기 공용 헬퍼. 백엔드 금액 단위는 원(KRW), 화면 입력 단위는 만원.
export const MAN = 10000;

export const manToWon = (man) => Math.round(Number(man || 0) * MAN);
export const wonToMan = (won) => Math.round(Number(won || 0) / MAN);

/** 원 → "1,234만원" (억 단위는 "1억 2,340만원") */
export function fmtMan(won) {
  if (won == null) return '-';
  const man = Math.round(won / MAN);
  if (man >= 10000) {
    const eok = Math.floor(man / 10000);
    const rest = man % 10000;
    return rest ? `${eok}억 ${rest.toLocaleString()}만원` : `${eok}억원`;
  }
  return `${man.toLocaleString()}만원`;
}

/** 원 → "1,234" (단위 없이, 만원 기준) */
export const fmtManNum = (won) => (won == null ? '-' : Math.round(won / MAN).toLocaleString());

export const fmtPct = (v, digits = 1) => `${Number(v).toFixed(digits)}%`;

/** 소수 이익률(0.22) → "22.1%" */
export const fmtRate = (v, digits = 1) => `${(Number(v) * 100).toFixed(digits)}%`;

export const sign = (n) => (n > 0 ? '+' : '') + (Math.round(n * 10) / 10);
