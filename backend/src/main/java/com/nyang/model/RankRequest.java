package com.nyang.model;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;

/**
 * 순위 산출 요청.
 * monthlySales / monthlyExpense 단위: 원(KRW).
 * weights 는 선택 (매출/순수익/비용효율), 미지정 시 0.5/0.3/0.2.
 */
public record RankRequest(
        @NotBlank String industryCode,
        @PositiveOrZero double monthlySales,
        @PositiveOrZero double monthlyExpense,
        Weights weights
) {
    public record Weights(double sales, double profit, double margin) {}
}
