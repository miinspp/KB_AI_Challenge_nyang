// 맞춤 정책·금융상품 추천 (Python 추천 서비스 /api/recommend)
//   진단 결과(rank)를 추천 프로필로 변환해 호출한다.
//   서비스가 없거나 실패하면 App 쪽에서 기존 규칙기반(recommendProducts)으로 폴백한다.
import { postJson } from './http';

const clamp01 = (x, hi = 0.9) => Math.max(0, Math.min(hi, x));

// 종합 상위%(작을수록 상위) → 상권위험 등급 (시뮬 marketRiskLevel과 동일 기준)
const marketRiskLevel = (topPercent) =>
  topPercent <= 25 ? 'LOW' : topPercent <= 60 ? 'MEDIUM' : 'HIGH';

// rank(/api/rank 응답) + 사용자 입력(업력·부채) → 추천 프로필
//   debtRatio / bizAgeYears 가 실제 입력값으로 넘어오면 그것을 쓰고,
//   비어 있을 때만 마진 기반 근사(데모 폴백)로 대체한다.
export function rankToProfile(rank, {
  region = '서울', industry = '', bizAgeYears = null, debtRatio = null,
} = {}) {
  const salesTop = rank?.sales?.topPercent ?? 50;
  const netMargin = rank?.margin?.value ?? 0.1;
  const profitVal = rank?.profit?.value ?? 0;

  // 실부채 비율(부채잔액/연매출)이 있으면 사용, 없으면 마진으로 근사
  const debt = debtRatio != null && Number.isFinite(debtRatio)
    ? clamp01(debtRatio)
    : clamp01(0.6 - netMargin);
  const cashGap = profitVal <= 0 ? 0.5 : Math.max(0, 0.4 - netMargin);
  const mrl = marketRiskLevel(rank?.topPercent ?? 50);
  const bizAge = bizAgeYears != null && Number.isFinite(bizAgeYears) ? bizAgeYears : 2;

  // 니즈 문장을 재무신호 기반으로 동적 생성 → 상황이 다르면 임베딩 검색 결과도 달라진다
  const needs = [];
  if (debt >= 0.4) needs.push('고금리 대출 대환, 부채 상환부담 완화');
  if (cashGap >= 0.3) needs.push('긴급 운전자금, 경영안정자금');
  if (mrl === 'HIGH') needs.push('상권 활성화, 경영 컨설팅, 판로 개척');
  if (salesTop <= 30) needs.push('성장 시설자금, 투자 유치, 사업 확장');
  if (bizAge <= 3) needs.push('창업 초기 지원, 초기 정착 자금');
  if (needs.length === 0) needs.push('경영 개선, 일반 소상공인 지원');

  return {
    region,
    biz_age_years: bizAge,
    industry,
    debt_ratio: debt,
    market_risk_level: mrl,
    cash_flow_gap_prob: cashGap,
    sales_percentile: salesTop,
    need_keywords: needs.join(', '),
    top_k: 6,
  };
}

export async function fetchRecommendations(profile) {
  const data = await postJson('/api/recommend', profile);
  return data.products; // RecommendScreen이 그대로 렌더
}
