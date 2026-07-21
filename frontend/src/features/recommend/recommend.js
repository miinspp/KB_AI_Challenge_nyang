import { PRODUCTS } from './products';

/**
 * 진단 결과(/api/rank)로 상품 우선순위를 데이터 기반으로 재계산한다.
 * 신호:
 *   - marginScore  : 비용효율 점수(50=업종 평균). 낮으면 대환·정책자금.
 *   - netMargin    : 영업이익률. 얇으면 운영자금.
 *   - salesTop     : 매출 상위 %. 우수하면 적립·공제.
 *   - topPercent   : 종합 상위 %. 우수 점포는 정책자금 우대 대상.
 * 백엔드에 rank 가 없으면 카탈로그 기본 fit 순서를 유지한다.
 */
export function recommendProducts(rank) {
  if (!rank) return PRODUCTS.map((p) => ({ ...p }));

  const marginScore = rank.margin?.score ?? 50;   // 0~100
  const netMargin = rank.margin?.value ?? 0.1;    // 영업이익률(소수)
  const salesTop = rank.sales?.topPercent ?? 50;  // 낮을수록 상위
  const topPercent = rank.topPercent ?? 50;

  const lowMargin = marginScore < 45;
  const veryLowMargin = marginScore < 30;
  const thinCash = (rank.profit?.value ?? 0) <= 0 || netMargin < 0.08;
  const strongSales = salesTop <= 30;
  const topPerformer = topPercent <= 25;

  const score = {
    op: 60 + (thinCash ? 26 : 0) + (lowMargin ? 8 : 0),
    refi: 55 + (lowMargin ? 28 : 0) + (veryLowMargin ? 9 : 0),
    policy: 62 + (topPerformer ? 20 : 0) + (lowMargin ? 8 : 0),
    save: 50 + (strongSales ? 24 : 0) + (!thinCash ? 10 : 0),
    gov: 56 + (topPerformer ? 12 : 0) + (!thinCash ? 8 : 0),
    ins: 64 + (topPerformer ? 4 : 0),
  };

  const reasonOverride = {
    op: thinCash && '순수익이 얇은 달을 대비해, 한도 내에서 필요한 만큼만 쓰는 운영자금이 잘 맞아요.',
    refi: lowMargin && '비용효율이 업종 평균보다 낮아요. 고금리 대출을 갈아타면 이자 부담을 줄일 수 있어요.',
    policy: topPerformer && `상위 ${topPercent}% 우수 점포라 서울신보 보증부 정책자금 우대 대상이에요.`,
    save: strongSales && `매출이 상위 ${salesTop}%로 안정적이에요. 여유 자금은 비상금 적립부터 시작해요.`,
  };

  return PRODUCTS
    .map((p) => ({
      ...p,
      fit: Math.max(40, Math.min(99, Math.round(score[p.id] ?? p.fit))),
      reason: reasonOverride[p.id] || p.reason,
    }))
    .sort((a, b) => b.fit - a.fit);
}
