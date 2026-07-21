package com.nyang.rank.application.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;

import java.util.List;

/**
 * 순위 산출 요청.
 * monthlySales / monthlyExpense 단위: 원(KRW).
 * weights 는 선택 (매출/순수익/비용효율), 미지정 시 0.5/0.3/0.2.
 * areaType 은 선택 — 지정 시 동일 상권유형(골목/발달/전통시장) 내 상위 %를 함께 산출.
 *
 * v2 보정 입력 (모두 선택 — 있으면 종합점수에 보정축이 추가된다):
 *  - costBreakdown: 월 지출 세부(매입·인건비·임대료·기타, 원). rent 가 있어야 비용 구조 축이 활성화.
 *  - salesHistory : 최근 월별 매출(과거→최근, 3개월 이상). 매출 안정성 축이 활성화.
 *    홈택스 연동 시 자동으로 채워지며, 수동 입력 경로에서도 부분 제공 가능.
 */
public record RankRequest(
        @NotBlank String industryCode,
        @PositiveOrZero double monthlySales,
        @PositiveOrZero double monthlyExpense,
        String areaType,
        Weights weights,
        CostBreakdown costBreakdown,
        List<MonthlyAmount> salesHistory
) {
    /** v1 호환 생성자 (보정 입력 없음). */
    public RankRequest(String industryCode, double monthlySales, double monthlyExpense,
                       String areaType, Weights weights) {
        this(industryCode, monthlySales, monthlyExpense, areaType, weights, null, null);
    }

    public record Weights(double sales, double profit, double margin) {}

    /** 월 지출 세부 (원). 모르는 항목은 null. */
    public record CostBreakdown(Double purchaseCost, Double laborCost, Double rent, Double otherExpense) {}

    /** 월별 매출 (month: "YYYY-MM", amount: 원). */
    public record MonthlyAmount(String month, double amount) {}
}
