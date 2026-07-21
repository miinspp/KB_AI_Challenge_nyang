package com.nyang.simulation.application.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.PositiveOrZero;

import java.util.List;

/**
 * 정책/금융상품 선택 후 12개월 자금흐름을 비교하기 위한 요청.
 * 모든 금액 단위는 원(KRW), 금리는 연율 소수(예: 3.5% = 0.035)이다.
 */
public record SimulationRequest(
        @NotEmpty List<@PositiveOrZero Double> monthlySales,
        @PositiveOrZero double fixedCost,
        @DecimalMin("0.0") @DecimalMax("1.0") double variableCostRatio,
        @PositiveOrZero double currentCash,
        @PositiveOrZero double existingMonthlyRepayment,
        @PositiveOrZero double existingDebtTotal,
        @DecimalMin("0.0") @DecimalMax("1.0") Double taxReserveRatio,
        @PositiveOrZero Double minimumCashBuffer,
        Integer horizonMonths,
        Integer simulationCount,
        Long randomSeed,
        Diagnosis diagnosis,
        @Valid List<SelectedItem> selectedItems
) {
    public record Diagnosis(
            @DecimalMin("0.0") Double industryCv,
            String marketRiskLevel
    ) {}

    /**
     * sourceType: KB_PRODUCT, SEOUL_POLICY, CUSTOM.
     * type: LOAN, GRANT, COST_REDUCTION, SALES_UPLIFT, CASH_MANAGEMENT.
     * repaymentType: EQUAL_PAYMENT, EQUAL_PRINCIPAL, BULLET, INTEREST_ONLY, NONE.
     */
    public record SelectedItem(
            String sourceType,
            String id,
            String name,
            String type,
            @PositiveOrZero Double amount,
            @DecimalMin("0.0") Double annualRate,
            @PositiveOrZero Integer totalTermMonths,
            @PositiveOrZero Integer graceMonths,
            String repaymentType,
            @PositiveOrZero Integer disbursementMonth,
            @PositiveOrZero Double upfrontFee,
            @DecimalMin("0.0") Double feeRate,
            List<CashEvent> projectSpendingSchedule,
            @DecimalMin("0.0") @DecimalMax("1.0") Double selfFundingRatio,
            String paymentMethod,
            @DecimalMin("0.0") @DecimalMax("1.0") Double costReductionRatio,
            @DecimalMin("0.0") @DecimalMax("1.0") Double salesUpliftRatio,
            @PositiveOrZero Double requiredFundingAmount,
            String eligibilityStatus,
            String duplicateGroup
    ) {}

    public record CashEvent(
            @PositiveOrZero Integer month,
            @PositiveOrZero double amount
    ) {}
}
