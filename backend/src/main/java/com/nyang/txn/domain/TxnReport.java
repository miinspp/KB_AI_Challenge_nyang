package com.nyang.txn.domain;

import java.util.List;

/**
 * 거래 분류 리포트 — 파이프라인(pipeline/txn/report.py)이 마이데이터·홈택스·KB
 * 거래를 카테고리로 분류·집계한 산출물. reco 파이프라인과 동일하게 Python이
 * 사전계산한 JSON을 그대로 로드·서빙한다(런타임 분류 추론 없음).
 *
 * months      : 월별 손익(P&L)·현금흐름 + 카테고리별 합계
 * reviewQueue : 신뢰도가 낮아 사용자 확인이 필요한 거래(레이어⑤ 게이트 통과분)
 * suggestions : 부담률·원가율 진단(임계값 기반 — 추후 업종평균 벤치마크로 교체)
 */
public record TxnReport(
        Meta meta,
        List<MonthlySummary> months,
        List<ReviewItem> reviewQueue,
        List<Suggestion> suggestions
) {
    public record Meta(String generatedFor, List<String> months, int txnCount) {}

    /**
     * 손익과 현금흐름을 분리해 담는다. 대출 원금상환은 현금유출(cashOut)엔 잡히지만
     * 손익상 비용(expense)에는 들어가지 않는다 — 부채 감소일 뿐이라 비용 과대계상 방지.
     */
    public record MonthlySummary(
            String month,
            long income,
            long expense,
            long profit,      // income - expense (손익)
            long cashIn,
            long cashOut,
            long netCash,     // cashIn - cashOut (현금흐름)
            List<CategoryAmount> categories
    ) {}

    /** group: 수입 | 고정비 | 변동비 | 금융 (중립 카테고리는 리포트 합계에서 제외됨) */
    public record CategoryAmount(String code, String label, String group, long amount, int count) {}

    public record ReviewItem(String txnId, String date, long amount, String merchant, String guess) {}

    /** status: "ok" | "warn" — value 는 백분율(%) */
    public record Suggestion(String metric, double value, String status, String message) {}
}
