package com.nyang.simulation.application.dto;

import com.fasterxml.jackson.annotation.JsonAlias;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.PositiveOrZero;

import java.math.BigDecimal;
import java.util.List;

/**
 * Simulation request. Monetary values are KRW and rates are decimals (3.5% = 0.035).
 */
public record SimulationRequest(
        @NotEmpty List<@PositiveOrZero BigDecimal> monthlySales,
        @PositiveOrZero BigDecimal fixedCost,
        @DecimalMin("0.0") @DecimalMax("1.0") Double variableCostRatio,
        @PositiveOrZero BigDecimal currentCash,
        @JsonAlias("existingMonthlyRepayment") @PositiveOrZero BigDecimal existingMonthlyPayment,
        @JsonAlias("existingDebtTotal") @PositiveOrZero BigDecimal existingDebtBalance,
        @DecimalMin("0.0") Double existingLoanInterestRate,
        @PositiveOrZero Integer existingLoanRemainingMonths,
        @Valid CostStructure costStructure,
        @DecimalMin("0.0") @DecimalMax("1.0") Double taxReserveRatio,
        // Legacy field retained for existing clients.
        @PositiveOrZero BigDecimal minimumCashBuffer,
        String safetyThresholdType,
        @PositiveOrZero BigDecimal customSafetyThreshold,
        Integer horizonMonths,
        Integer simulationCount,
        Long randomSeed,
        Diagnosis diagnosis,
        @Valid List<SelectedItem> selectedItems
) {
    public record Diagnosis(
            @DecimalMin("0.0") Double industryCv,
            String marketRiskLevel,
            String industryCode,
            String region
    ) {}

    /**
     * totalExpense is a reconciliation value, not an additional expense.
     */
    public record CostStructure(
            @PositiveOrZero BigDecimal totalExpense,
            @PositiveOrZero BigDecimal rent,
            @PositiveOrZero BigDecimal laborCost,
            @PositiveOrZero BigDecimal otherFixedExpense,
            @PositiveOrZero BigDecimal materialCost,
            @DecimalMin("0.0") @DecimalMax("1.0") Double salesLinkedExpenseRate
    ) {}

    public record SelectedItem(
            String sourceType,
            String id,
            String name,
            String type,
            @PositiveOrZero BigDecimal amount,
            @DecimalMin("0.0") Double annualRate,
            @PositiveOrZero Integer totalTermMonths,
            @PositiveOrZero Integer graceMonths,
            String repaymentType,
            @PositiveOrZero Integer disbursementMonth,
            @PositiveOrZero BigDecimal upfrontFee,
            @DecimalMin("0.0") Double feeRate,
            List<CashEvent> projectSpendingSchedule,
            @DecimalMin("0.0") @DecimalMax("1.0") Double selfFundingRatio,
            String paymentMethod,
            @DecimalMin("0.0") @DecimalMax("1.0") Double costReductionRatio,
            @DecimalMin("0.0") @DecimalMax("1.0") Double salesUpliftRatio,
            @PositiveOrZero BigDecimal requiredFundingAmount,
            String eligibilityStatus,
            String duplicateGroup,
            @PositiveOrZero BigDecimal monthlyContribution,
            @DecimalMin("0.0") Double assetAnnualRate,
            @PositiveOrZero Integer maturityMonth,
            String protectionType,
            String protectionBasis
    ) {}

    public record CashEvent(
            @PositiveOrZero Integer month,
            @PositiveOrZero BigDecimal amount
    ) {}
}
