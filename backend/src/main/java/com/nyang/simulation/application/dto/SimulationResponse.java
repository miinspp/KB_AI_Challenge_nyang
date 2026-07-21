package com.nyang.simulation.application.dto;

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
            List<MonthlyCashFlow> monthlyCashFlows
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
            boolean negativeCash
    ) {}

    public record DeterministicResult(
            Integer firstBufferBreachMonth,
            Integer firstNegativeCashMonth,
            double endingCash,
            double minimumCashBalance
    ) {}

    public record StochasticResult(
            int simulationCount,
            long randomSeed,
            double bufferBreachProbability,
            double negativeCashProbability,
            double endingCashP50,
            double endingCashP5
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
            double industryCv,
            double mixedCv,
            double personalCv,
            double personalCvWeight,
            double maxMonthlyTrendRatio,
            double repaymentBurdenLimit,
            double excessFundingRatioLimit,
            String seasonalitySource
    ) {}

    public record Confidence(
            String level,
            String reason
    ) {}
}
