// 맞춤 정책·금융상품 추천 (Python 추천 서비스 /api/recommend)
//   진단 결과(rank)를 추천 프로필로 변환해 호출한다.
//   서비스가 없거나 실패하면 App 쪽에서 기존 규칙기반(recommendProducts)으로 폴백한다.
import { postJson } from './http';

// rank(/api/rank 응답) + 사용자 위험성향 → 추천 프로필
export function rankToProfile(rank, { region = '서울', bizAgeYears = 2, industry = '', riskTolerance = 'stable' } = {}) {
  const salesTop = rank?.sales?.topPercent ?? 50;
  const netMargin = rank?.margin?.value ?? 0.1;
  const profitVal = rank?.profit?.value ?? 0;
  return {
    region,
    biz_age_years: bizAgeYears,
    industry,
    // 진단에 실제 부채 데이터가 없으면 마진으로 근사(얇을수록 부채압박 높다고 가정) — 데모 가정치
    debt_ratio: Math.max(0, Math.min(0.9, 0.6 - netMargin)),
    area_risk: (rank?.topPercent ?? 50) / 100,
    cash_flow_gap_prob: profitVal <= 0 ? 0.5 : Math.max(0, 0.4 - netMargin),
    sales_percentile: salesTop,
    need_keywords: profitVal <= 0 ? '운전자금 부족, 현금흐름 개선' : '성장 자금, 상권 경쟁력',
    risk_tolerance: riskTolerance,
    top_k: 6,
  };
}

export async function fetchRecommendations(profile) {
  const data = await postJson('/api/recommend', profile);
  return data.products; // RecommendScreen이 그대로 렌더
}
