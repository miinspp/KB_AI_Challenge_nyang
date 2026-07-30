// 조합 분석 AI — 시뮬레이터가 계산한 조합 후보를 성향에 맞게 Top3로 선정+설명한다.
// (Python 추천 서비스, 포트 8000)
import { postJson } from './http';

export const requestPortfolioAdvice = (payload) => postJson('/api/portfolio/analyze', payload);

// Top3 카드 하나를 펼쳤을 때 — 이미 나온 짧은 요약을 더 자세히 설명해달라고 요청한다(온디맨드).
export const requestPortfolioDetail = (payload) => postJson('/api/portfolio/detail', payload);
