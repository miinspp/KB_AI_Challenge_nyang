package com.nyang.simulation.application.dto;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/** 시뮬레이션 결과. 숫자는 계산 엔진 산출값이며, LLM/Agent가 임의로 수정하면 안 된다. */
public record SimulationResponse(
        String scenarioId,
        String scenarioName,
        int horizonMonths,
        List<ItemResult> selectedItems,
        ScenarioResult baseline,
        ScenarioResult selectedScenario,
        BaselineComparison baselineComparison,
        FinancingResult financingResult,
        ConstraintResult constraints,
        AssumptionsUsed assumptions,
        InputAssumptions inputAssumptions,
        ProtectionResult protection,
        SalesForecastInfo salesForecast,
        Confidence confidence,
        String status,
        List<String> warnings,
        List<String> agentHints
) {
    public record ItemResult(
            String sourceType,
            String id,
            String name,
            String type,
            String category,
            String sourceUrl,
            String applicationUrl,
            String eligibilityStatus,
            Map<String, Object> verifiedInputs,
            Map<String, Object> assumptions
    ) {}

    public record ScenarioResult(
            DeterministicResult deterministic,
            StochasticResult stochastic,
            List<MonthlyCashFlow> monthlyCashFlows,
            ScenarioMetrics metrics
    ) {}

    public record MonthlyCashFlow(
            int month,
            double openingCash,
            double financingInflow,
            double subsidyInflow,
            double projectSpending,
            double expectedSales,
            double variableCost,
            double fixedCost,
            double taxReserve,
            double existingRepayment,
            double newRepayment,
            double financingFee,
            double operatingCashFlow,
            double closingCash,
            boolean bufferBreached,
            boolean negativeCash,
            double financialAssetContribution,
            double financialAssetInterest,
            double financialAssetMaturityInflow,
            double financialAssetBalance
    ) {}

    public record DeterministicResult(
            Integer firstBufferBreachMonth,
            Integer firstNegativeCashMonth,
            double endingCash,
            double minimumCashBalance,
            double financialAssetBalance
    ) {}

    public record StochasticResult(
            int simulationCount,
            long randomSeed,
            double bufferBreachProbability,
            double negativeCashProbability,
            double endingCashP50,
            double endingCashP5,
            List<MonthlyRisk> monthlyRisks,
            int bufferBreachProbabilityDisplayPercent,
            int negativeCashProbabilityDisplayPercent
    ) {}

    /** 해당 월까지 한 번이라도 안전자금선/0원 아래로 내려간 누적 확률. */
    public record MonthlyRisk(
            int month,
            double bufferBreachProbability,
            double negativeCashProbability,
            double bufferBreachAtMonthProbability,
            double negativeCashAtMonthProbability
    ) {}

    public record BaselineComparison(
            double bufferBreachProbabilityBefore,
            double bufferBreachProbabilityAfter,
            double bufferBreachProbabilityDelta,
            double negativeCashProbabilityBefore,
            double negativeCashProbabilityAfter,
            double negativeCashProbabilityDelta,
            double endingCashP5Delta
    ) {}

    public record FinancingResult(
            double totalInterest,
            double totalFees,
            double totalFinancingCost,
            double maxMonthlyRepayment,
            double maxRepaymentBurdenRatio,
            double totalFundingAmount,
            double requiredFundingAmount,
            double excessFundingAmount
    ) {}

    public record ConstraintResult(
            boolean repaymentBurdenPassed,
            boolean eligibilityPassedOrUnknown,
            boolean duplicateBenefitPassed,
            boolean excessFundingPassed,
            List<String> violations
    ) {}

    public record AssumptionsUsed(
            double taxReserveRatio,
            double minimumCashBuffer,
            String safetyThresholdType,
            double industryCv,
            double mixedCv,
            double personalCv,
            double personalCvWeight,
            double maxMonthlyTrendRatio,
            double salesShockAutocorrelation,
            double repaymentBurdenLimit,
            double excessFundingRatioLimit,
            String seasonalitySource
    ) {}

    public record ScenarioMetrics(
            BigDecimal averageMonthlyNetCashFlow,
            BigDecimal finalCashBalance,
            BigDecimal minimumCashBalance,
            Integer firstCashShortageMonth,
            double cashShortageProbability,
            int cashShortageProbabilityDisplayPercent,
            BigDecimal p5FinalCashBalance,
            BigDecimal maximumMonthlyDebtPayment,
            BigDecimal financialAssetBalance
    ) {}

    public record InputAssumptions(
            boolean currentCashAssumed,
            boolean existingDebtAssumed,
            boolean existingMonthlyPaymentAssumed,
            boolean legacyCostModelUsed,
            List<String> messages
    ) {}

    public record ProtectionResult(
            boolean protectionSelected,
            Double protectionScore,
            String scoreStatus,
            List<ProtectionItem> items
    ) {}

    public record ProtectionItem(
            String id,
            String name,
            String protectionType,
            String basis
    ) {}

    public record SalesForecastInfo(
            String provider,
            String modelVersion,
            String dataSource,
            boolean fallback,
            List<SalesForecastPoint> monthlyForecasts
    ) {}

    public record SalesForecastPoint(
            int month,
            BigDecimal p10,
            BigDecimal p50,
            BigDecimal p90
    ) {}

    public record Confidence(
            String level,
            String reason
    ) {}
}
