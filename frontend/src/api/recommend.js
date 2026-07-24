// AI 추천(임베딩 매칭) 백엔드 엔드포인트.
//   POST /api/recommend  진단 신호 기반 맞춤 정책·KB상품 추천
import { postJson } from './http';

// payload: { topPercent(필수), rentBurden?, trendPerMonth?, bizAgeYears?, region?, needs? }
//   rentBurden: 임대료/매출 비율(0.14=14%) — rank.costHealth?.rentBurden
//   trendPerMonth: 월평균 매출 성장률 — rank.stability?.trendPerMonth
// 응답: { profileSignals[], policies[](최대5), products[](최대3) }
//   각 항목: { title, agency, keywords[], summaryShort("지원:/대상:/신청:" 3줄), score, reason, url, ... }
export const postRecommend = (payload) => postJson('/api/recommend', payload);
