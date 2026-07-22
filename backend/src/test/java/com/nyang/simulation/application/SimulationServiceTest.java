package com.nyang.simulation.application;

import com.nyang.simulation.application.dto.SimulationRequest;
import com.nyang.simulation.application.dto.SimulationResponse;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
class SimulationServiceTest {
    @Autowired
    private SimulationService service;

    @Test
    void kbLoanDefaultUsesGracePeriodInterestAndFee() {
        SimulationRequest.SelectedItem loan = item("KB_PRODUCT", "L006", "LOAN", bd(15_000_000));
        SimulationResponse result = service.simulate(baseRequest(List.of(loan)));

        SimulationResponse.MonthlyCashFlow first = result.selectedScenario().monthlyCashFlows().get(0);
        assertEquals(15_000_000, first.financingInflow(), 1);
        assertEquals(43_750, first.newRepayment(), 1);
        assertEquals(150_000, first.financingFee(), 1);
        assertTrue(result.financingResult().maxMonthlyRepayment() >= 900_000);
    }

    @Test
    void reimbursementGrantSpendsBeforeSubsidyArrives() {
        SimulationRequest.SelectedItem grant = new SimulationRequest.SelectedItem(
                "CUSTOM", "GRANT_DEMO", "Reimbursement grant", "GRANT", bd(4_000_000),
                null, null, null, null, 3, null, null, null, .2, "REIMBURSEMENT",
                null, null, bd(5_000_000), "UNKNOWN", "grant-demo",
                null, null, null, null, null);

        SimulationResponse result = service.simulate(baseRequest(List.of(grant)));
        assertEquals(5_000_000, result.selectedScenario().monthlyCashFlows().get(0).projectSpending(), 1);
        assertEquals(4_000_000, result.selectedScenario().monthlyCashFlows().get(2).subsidyInflow(), 1);
    }

    @Test
    void largerCurrentCashReducesBufferBreachRisk() {
        SimulationResponse low = service.simulate(request(List.of(), bd(500_000), bd(900_000), null, "ONE_MONTH_FIXED_COST"));
        SimulationResponse high = service.simulate(request(List.of(), bd(20_000_000), bd(900_000), null, "ONE_MONTH_FIXED_COST"));

        assertTrue(high.baseline().stochastic().bufferBreachProbability()
                < low.baseline().stochastic().bufferBreachProbability());
    }

    @Test
    void existingMonthlyPaymentIsIncludedInCashFlowAndDebtBurden() {
        SimulationResponse withPayment = service.simulate(request(List.of(), bd(6_000_000), bd(900_000), null, "ONE_MONTH_FIXED_COST"));
        SimulationResponse withoutPayment = service.simulate(request(List.of(), bd(6_000_000), ZERO, null, "ONE_MONTH_FIXED_COST"));

        assertEquals(900_000, withPayment.baseline().monthlyCashFlows().get(0).existingRepayment(), 1);
        assertTrue(withPayment.baseline().deterministic().endingCash()
                < withoutPayment.baseline().deterministic().endingCash());
    }

    @Test
    void costComponentsCannotExceedTotalExpense() {
        SimulationRequest.CostStructure duplicated = new SimulationRequest.CostStructure(
                bd(4_000_000), bd(2_000_000), bd(2_000_000), bd(1_000_000), bd(1_000_000), .2);

        IllegalArgumentException error = assertThrows(IllegalArgumentException.class,
                () -> service.simulate(request(List.of(), bd(6_000_000), bd(900_000), duplicated, "ONE_MONTH_FIXED_COST")));
        assertTrue(error.getMessage().contains("duplicated"));
    }

    @Test
    void amountOverProductMaximumIsRejected() {
        SimulationRequest.SelectedItem loan = item("KB_PRODUCT", "L001", "LOAN", bd(100_000_001));
        assertThrows(IllegalArgumentException.class, () -> service.simulate(baseRequest(List.of(loan))));
    }

    @Test
    void closedPolicyIsRejectedBeforeCalculation() {
        SimulationRequest.SelectedItem closed = item(
                "SEOUL_POLICY", "PBLN_000000000124321", "GRANT", bd(1_000_000));
        IllegalArgumentException error = assertThrows(IllegalArgumentException.class,
                () -> service.simulate(baseRequest(List.of(closed))));
        assertTrue(error.getMessage().contains("closed"));
    }

    @Test
    void duplicateProductIsRejected() {
        SimulationRequest.SelectedItem loan = item("KB_PRODUCT", "L001", "LOAN", bd(10_000_000));
        assertThrows(IllegalArgumentException.class,
                () -> service.simulate(baseRequest(List.of(loan, loan))));
    }

    @Test
    void savingsContributionBecomesAssetAndReturnsAtMaturity() {
        SimulationRequest.SelectedItem savings = item("KB_PRODUCT", "SV001", "SAVINGS", ZERO);
        SimulationResponse result = service.simulate(baseRequest(List.of(savings)));

        SimulationResponse.MonthlyCashFlow first = result.selectedScenario().monthlyCashFlows().get(0);
        SimulationResponse.MonthlyCashFlow maturity = result.selectedScenario().monthlyCashFlows().get(5);
        assertEquals(300_000, first.financialAssetContribution(), 1);
        assertTrue(first.financialAssetBalance() > 300_000);
        assertTrue(maturity.financialAssetMaturityInflow() > 1_800_000);
        assertEquals(0, maturity.financialAssetBalance(), 1);
    }

    @Test
    void insurancePremiumAffectsCashButProtectionIsNotInvented() {
        SimulationRequest.SelectedItem insurance = new SimulationRequest.SelectedItem(
                "CUSTOM", "INS-1", "Fire insurance", "INSURANCE", ZERO,
                null, null, null, null, null, null, null, null, null, null,
                null, null, null, "PASS", "insurance",
                bd(45_000), null, null, "FIRE_DAMAGE", "Policy terms");

        SimulationResponse result = service.simulate(baseRequest(List.of(insurance)));
        assertEquals(45_000, result.selectedScenario().monthlyCashFlows().get(0).financialAssetContribution(), 1);
        assertEquals(0, result.selectedScenario().monthlyCashFlows().get(0).financialAssetBalance(), 1);
        assertTrue(result.protection().protectionSelected());
        assertNull(result.protection().protectionScore());
        assertEquals("NOT_ESTIMATED", result.protection().scoreStatus());
    }

    @Test
    void refinancingRequiresExistingDebt() {
        SimulationRequest.SelectedItem refinance = new SimulationRequest.SelectedItem(
                "CUSTOM", "refi", "Low-rate refinance", "LOAN", bd(5_000_000),
                .04, 24, 0, "EQUAL_PAYMENT", 1, ZERO, 0d, null, null, null,
                null, null, null, "PASS", "refi",
                null, null, null, null, null);
        SimulationRequest noDebt = new SimulationRequest(
                sales(), bd(4_200_000), .38, bd(6_000_000), bd(900_000), ZERO,
                .08, 24, null, .08, null, "ONE_MONTH_FIXED_COST", null,
                12, 500, 42L, new SimulationRequest.Diagnosis(.15, "MEDIUM", "CAFE", "SEOUL"),
                List.of(refinance));
        assertThrows(IllegalArgumentException.class, () -> service.simulate(noDebt));
    }

    @Test
    void customSafetyThresholdChangesRiskDefinition() {
        SimulationResponse standard = service.simulate(request(List.of(), bd(6_000_000), bd(900_000), null, "ONE_MONTH_FIXED_COST"));
        SimulationResponse strict = service.simulate(new SimulationRequest(
                sales(), bd(4_200_000), .38, bd(6_000_000), bd(900_000), bd(12_000_000),
                .08, 24, null, .08, null, "CUSTOM", bd(20_000_000),
                12, 500, 42L, new SimulationRequest.Diagnosis(.15, "MEDIUM", "CAFE", "SEOUL"), List.of()));
        assertTrue(strict.baseline().stochastic().bufferBreachProbability()
                > standard.baseline().stochastic().bufferBreachProbability());
    }

    @Test
    void monteCarloIsReproducibleAndMonthlyCumulativeRiskIsMonotonic() {
        SimulationRequest request = baseRequest(List.of());
        SimulationResponse first = service.simulate(request);
        SimulationResponse second = service.simulate(request);

        assertEquals(first.baseline().stochastic().bufferBreachProbability(),
                second.baseline().stochastic().bufferBreachProbability());
        assertEquals(first.baseline().stochastic().endingCashP5(),
                second.baseline().stochastic().endingCashP5());
        List<SimulationResponse.MonthlyRisk> risks = first.baseline().stochastic().monthlyRisks();
        assertEquals(12, risks.size());
        for (int i = 1; i < risks.size(); i++) {
            assertTrue(risks.get(i).bufferBreachProbability() >= risks.get(i - 1).bufferBreachProbability());
        }
    }

    private SimulationRequest.SelectedItem item(String source, String id, String type, BigDecimal amount) {
        return new SimulationRequest.SelectedItem(
                source, id, null, type, amount, null, null, null, null, null,
                null, null, null, null, null, null, null, null, "UNKNOWN", id,
                null, null, null, null, null);
    }

    private SimulationRequest baseRequest(List<SimulationRequest.SelectedItem> items) {
        return request(items, bd(6_000_000), bd(900_000), null, "ONE_MONTH_FIXED_COST");
    }

    private SimulationRequest request(List<SimulationRequest.SelectedItem> items, BigDecimal currentCash,
                                      BigDecimal monthlyPayment, SimulationRequest.CostStructure cost,
                                      String thresholdType) {
        return new SimulationRequest(
                sales(), bd(4_200_000), .38, currentCash, monthlyPayment, bd(12_000_000),
                .08, 24, cost, .08, null, thresholdType, null,
                12, 500, 42L, new SimulationRequest.Diagnosis(.15, "MEDIUM", "CAFE", "SEOUL"), items);
    }

    private static List<BigDecimal> sales() {
        return List.of(bd(8_200_000), bd(7_900_000), bd(8_500_000),
                bd(8_800_000), bd(9_100_000), bd(8_700_000));
    }

    private static BigDecimal bd(long value) {
        return BigDecimal.valueOf(value);
    }

    private static final BigDecimal ZERO = BigDecimal.ZERO;
}
