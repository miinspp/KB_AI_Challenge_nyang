// 성향분석(리스크 프로파일) — 사업 확장의지·부채태도·유동성선호·혁신투자성향·변동성감내도 5축.
// 추천 화면과 시뮬레이터 사이에 들어가, 응답을 시뮬레이터/에이전트 입력값으로 넘긴다.
// 각 보기는 -1(보수) / 0(중립) / +1(공격) 로 점수화되고, 5문항 합산 점수(-5~+5)로 최종 3분류를 정한다.

export const RISK_QUESTIONS = [
  {
    key: 'growth',
    label: '가게 확장 의향',
    options: [
      { score: -1, label: '지금 규모를 유지하며 매출을 안정적으로 지키고 싶어요' },
      { score: 0, label: '상황을 보면서 유연하게 정하고 싶어요' },
      { score: 1, label: '매장을 확장하거나 새로 낼 계획이 있어요' },
    ],
  },
  {
    key: 'debt',
    label: '추가 대출 의향',
    options: [
      { score: -1, label: '가능하면 대출을 더 늘리고 싶지 않아요' },
      { score: 0, label: '필요하면 받되, 무리하진 않을 거예요' },
      { score: 1, label: '사업 기회가 있다면 대출을 더 받을 의향이 있어요' },
    ],
  },
  {
    key: 'liquidity',
    label: '현금 확보 선호',
    options: [
      { score: -1, label: '여유자금을 넉넉히 쌓아두고 싶어요' },
      { score: 0, label: '지금 정도의 현금흐름이면 괜찮아요' },
      { score: 1, label: '현금을 쌓아두기보다 사업에 재투자하고 싶어요' },
    ],
  },
  {
    key: 'innovation',
    label: '신규 투자 성향',
    options: [
      { score: -1, label: '지금 방식대로 안정적으로 운영하고 싶어요' },
      { score: 0, label: '괜찮은 기회가 보이면 검토는 해볼게요' },
      { score: 1, label: '신메뉴·설비·디지털 전환 등 새로운 시도에 적극 투자하고 싶어요' },
    ],
  },
  {
    key: 'volatility',
    label: '매출 변동 감내도',
    options: [
      { score: -1, label: '들쭉날쭉한 것보단 꾸준한 매출이 좋아요' },
      { score: 0, label: '어느 정도 오르내림은 감수할 수 있어요' },
      { score: 1, label: '매출이 불안정해도 더 큰 성장 기회를 좇고 싶어요' },
    ],
  },
];

// 3분류 메타 — 시뮬레이터/에이전트에 그대로 넘길 profile 코드값 + 화면 표시용 라벨·설명.
export const RISK_PROFILE_META = {
  AGGRESSIVE: { label: '공격형', blurb: '성장 기회에 적극적으로 투자하는 걸 선호해요' },
  BALANCED: { label: '균형형', blurb: '안정과 성장 사이 균형을 원해요' },
  CONSERVATIVE: { label: '보수형', blurb: '안정적인 현금흐름과 리스크 관리를 우선해요' },
};

export function classifyRiskProfile(totalScore) {
  const type = totalScore <= -2 ? 'CONSERVATIVE' : totalScore >= 2 ? 'AGGRESSIVE' : 'BALANCED';
  return { type, ...RISK_PROFILE_META[type] };
}

export function scoreRiskAnswers(answers) {
  return RISK_QUESTIONS.reduce((sum, q) => sum + (answers[q.key] ?? 0), 0);
}
