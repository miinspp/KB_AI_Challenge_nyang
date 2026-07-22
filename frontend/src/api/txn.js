// 거래 분류 리포트 조회.
//   GET /api/txn/report  마이데이터·홈택스·KB 거래를 카테고리로 자동 분류·집계한 리포트
import { getJson } from './http';

// 응답: { meta, months[], reviewQueue[], suggestions[] }
//   months[]:      { month, income, expense, profit, cashIn, cashOut, netCash, categories[] }
//   categories[]:  { code, label, group("수입|고정비|변동비|금융"), amount, count }
//   reviewQueue[]: { txnId, date, amount, merchant, guess } — 신뢰도 낮아 확인 필요
//   suggestions[]: { metric, value(%), status("ok|warn"), message }
export const getTxnReport = () => getJson('/api/txn/report');
