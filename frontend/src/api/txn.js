// 거래 분류 리포트 조회 + 사용자 교정.
//   GET  /api/txn/report      마이데이터·홈택스·KB 거래를 카테고리로 자동 분류·집계한 리포트
//   POST /api/txn/correction  확인필요 거래를 올바른 카테고리로 바로잡기(레이어⑥)
import { getJson, postJson } from './http';

// 응답: { meta, months[], reviewQueue[], suggestions[] }
//   months[]:      { month, income, expense, profit, cashIn, cashOut, netCash, categories[] }
//   categories[]:  { code, label, group("수입|고정비|변동비|금융"), amount, count }
//   reviewQueue[]: { txnId, date, amount, merchant, guess } — 신뢰도 낮아 확인 필요
//   suggestions[]: { metric, value(%), status("ok|warn"), message }
export const getTxnReport = () => getJson('/api/txn/report');

// payload: { merchant(상호 원문), category(카테고리 코드 예: "RENT") }
// 응답: { ok, remaining(남은 확인필요 건수) }
export const postTxnCorrection = (merchant, category) =>
  postJson('/api/txn/correction', { merchant, category });
