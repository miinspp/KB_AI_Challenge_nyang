// 업종 분포·진단(상위 %) 관련 백엔드 엔드포인트.
//   GET  /api/meta               데이터 출처·기준 분기 + 벤치마크 그룹
//   GET  /api/industries         업종 목록 (선택 UI용 요약)
//   GET  /api/industries/{code}  업종 상세 (분포 격자 quantiles 포함)
//   POST /api/rank               상대적 위치(상위 %) 산출
import { getJson, postJson } from './http';

export const getMeta = () => getJson('/api/meta');
export const getIndustries = () => getJson('/api/industries');
export const getIndustry = (code) => getJson(`/api/industries/${code}`);

// payload: { industryCode, monthlySales, monthlyExpense, areaType?, weights?,
//            costBreakdown?: { purchaseCost?, laborCost?, rent?, otherExpense? },  ← rent 가 있으면 비용구조 축 활성화
//            salesHistory?: [{ month: "YYYY-MM", amount }] }                       ← 3개월 이상이면 안정성 축 활성화
// (금액 단위: 원)
export const postRank = (payload) => postJson('/api/rank', payload);
