// 백분위 격자(quantiles[0..100], 비감소)에서 값 v의 퍼센타일을 역보간으로 구한다.
// 백엔드 RankService.percentileOf 와 동일한 규칙 — 입력 화면의 실시간 미리보기에 사용.
export function percentileOf(q, v) {
  if (!q || q.length < 2) return null;
  const n = q.length - 1; // 100
  if (v <= q[0]) return 0;
  if (v >= q[n]) return 100;
  let lo = 0, hi = n;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (q[mid] <= v) lo = mid; else hi = mid - 1; }
  const i = lo;
  lo = 0; hi = n;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (q[mid] >= v) hi = mid; else lo = mid + 1; }
  const j = lo;
  if (j <= i) return (i + j) / 2;
  return i + (v - q[i]) / (q[j] - q[i]);
}

/** 상위 % (= 100 - 퍼센타일). 소수 1자리. */
export const topPercentOf = (q, v) => {
  const p = percentileOf(q, v);
  return p == null ? null : Math.round((100 - p) * 10) / 10;
};
