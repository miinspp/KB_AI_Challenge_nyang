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
    void interestOnlyLoanRepaysPrincipalAtMaturity() {
        SimulationResponse result = service.simulate(baseRequest(List.of(item("KB_PRODUCT", "L001", "LOAN", bd(10_000_000)))));

        SimulationResponse.MonthlyCashFlow maturity = result.selectedScenario().monthlyCashFlows().get(11);
        assertEquals(10_050_417, maturity.newRepayment(), 1);
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
    void linkedMonthlyExpensesLoansAndTaxScheduleDriveMonthlyCashFlow() {
        List<SimulationRequest.MonthlyExpense> expenses = List.of(
                new SimulationRequest.MonthlyExpense("2025-08", bd(5_600_000), bd(1_000_000), bd(1_000_000), bd(3_000_000), bd(100_000), bd(500_000)),
                new SimulationRequest.MonthlyExpense("2025-09", bd(5_800_000), bd(1_000_000), bd(1_000_000), bd(3_200_000), bd(100_000), bd(500_000)),
                new SimulationRequest.MonthlyExpense("2025-10", bd(6_000_000), bd(1_000_000), bd(1_000_000), bd(3_400_000), bd(100_000), bd(500_000)));
        List<SimulationRequest.ExistingLoan> loans = List.of(
                new SimulationRequest.ExistingLoan("bullet", "Bullet loan", bd(1_200_000), .12,
                        "BULLET", bd(12_000), 12, "2026-08-15", "2027-07-15"),
                new SimulationRequest.ExistingLoan("principal", "Principal loan", bd(2_400_000), .12,
                        "EQUAL_PRINCIPAL", bd(224_000), 12, "2026-08-25", "2027-07-25"));
        List<SimulationRequest.ScheduledTaxPayment> taxes = List.of(
                new SimulationRequest.ScheduledTaxPayment(2, "VAT", "2026-09-25", bd(500_000)));
        List<SimulationRequest.MonthlyAccountCashFlow> accountFlows = List.of(
                new SimulationRequest.MonthlyAccountCashFlow("2025-08", bd(8_000_000), bd(6_000_000), bd(2_000_000)),
                new SimulationRequest.MonthlyAccountCashFlow("2025-09", bd(8_400_000), bd(6_200_000), bd(2_200_000)),
                new SimulationRequest.MonthlyAccountCashFlow("2025-10", bd(8_100_000), bd(6_500_000), bd(1_600_000)));
        SimulationRequest linked = new SimulationRequest(
                sales(), bd(4_200_000), .38, bd(6_000_000), bd(236_000), bd(3_600_000),
                .12, 12, null, null, null, "ONE_MONTH_FIXED_COST", null,
                12, 500, 42L, new SimulationRequest.Diagnosis(null, "MEDIUM", "CAFE", "SEOUL"),
                List.of(), expenses, loans, taxes,
                List.of("2025-08", "2025-09", "2025-10", "2025-11", "2025-12", "2026-01"),
                accountFlows);

        SimulationResponse result = service.simulate(linked);
        assertEquals(2_500_000, result.baseline().monthlyCashFlows().get(0).fixedCost(), 1);
        assertEquals(236_000, result.baseline().monthlyCashFlows().get(0).existingRepayment(), 1);
        assertEquals(0, result.baseline().monthlyCashFlows().get(0).taxReserve(), 1);
        assertEquals(500_000, result.baseline().monthlyCashFlows().get(1).taxReserve(), 1);
        assertTrue(result.inputAssumptions().messages().stream()
                .anyMatch(message -> message.contains("account cash flows")));
    }

    @Test
    void largerCurrentCashReducesBufferBreachRisk() {
        SimulationResponse low = service.simulate(request(List.of(), bd(500_000), bd(900_000), null, "ONE_MONTH_FIXED_COST"));
        SimulationResponse high = service.simulate(request(List.of(), bd(20_000_000), bd(900_000), null, "ONE_MONTH_FIXED_COST"));

        assertTrue(low.baseline().stochastic().bufferBreachProbability() > 0);
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
    void missingExistingMonthlyPaymentIsRejectedInsteadOfAssumingZero() {
        SimulationRequest missingPayment = new SimulationRequest(
                sales(), bd(4_200_000), .38, bd(6_000_000), null, bd(12_000_000),
                .12, 12, null, .08, null, "ONE_MONTH_FIXED_COST", null,
                12, 500, 42L, new SimulationRequest.Diagnosis(.15, "MEDIUM", "CAFE", "SEOUL"), List.of());

        IllegalArgumentException error = assertThrows(IllegalArgumentException.class,
                () -> service.simulate(missingPayment));
        assertTrue(error.getMessage().contains("existingMonthlyPayment is required"));
    }

    @Test
    void missingDebtDeclarationIsRejectedInsteadOfAssumingZero() {
        SimulationRequest missingDebt = new SimulationRequest(
                sales(), bd(4_200_000), .38, bd(6_000_000), ZERO, null,
                null, 0, null, null, null, "ONE_MONTH_FIXED_COST", null,
                12, 500, 42L, new SimulationRequest.Diagnosis(null, "MEDIUM", "CAFE", "SEOUL"), List.of());

        IllegalArgumentException error = assertThrows(IllegalArgumentException.class,
                () -> service.simulate(missingDebt));
        assertTrue(error.getMessage().contains("existingDebtBalance is required"));
    }

    @Test
    void missingTaxHistoryDoesNotApplyTheOldEightPercentDefault() {
        SimulationRequest noTaxHistory = new SimulationRequest(
                sales(), bd(4_200_000), .38, bd(6_000_000), bd(900_000), bd(12_000_000),
                .08, 24, null, null, null, "ONE_MONTH_FIXED_COST", null,
                12, 500, 42L, new SimulationRequest.Diagnosis(null, "MEDIUM", "CAFE", "SEOUL"), List.of());

        SimulationResponse result = service.simulate(noTaxHistory);
        assertEquals(0, result.assumptions().taxReserveRatio(), 1e-9);
        assertTrue(result.warnings().stream().anyMatch(message -> message.contains("Tax reserve was not estimated")));
    }

    @Test
    void missingIndustryVolatilityUsesOnlyObservedStoreHistory() {
        SimulationRequest noIndustryCv = new SimulationRequest(
                sales(), bd(4_200_000), .38, bd(6_000_000), bd(900_000), bd(12_000_000),
                .08, 24, null, .07, null, "ONE_MONTH_FIXED_COST", null,
                12, 500, 42L, new SimulationRequest.Diagnosis(null, "MEDIUM", "CAFE", "SEOUL"), List.of());

        SimulationResponse result = service.simulate(noIndustryCv);
        assertEquals(result.assumptions().personalCv(), result.assumptions().industryCv(), 1e-9);
        assertEquals(1, result.assumptions().personalCvWeight(), 1e-9);
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
    void recommendedPolicyUsesCatalogTermsAndCapsItsDefaultAmountAtThePublishedLimit() {
        SimulationRequest.SelectedItem policy = item("SEOUL_POLICY", "PBLN_000000000123842", null, null);

        SimulationResponse result = service.simulate(baseRequest(List.of(policy)));

        SimulationResponse.ItemResult selected = result.selectedItems().get(0);
        assertEquals("LOAN", selected.type());
        assertEquals(0, bd(3_000_000).compareTo((BigDecimal) selected.verifiedInputs().get("amount")));
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
    void mutuallyExclusiveDebtRestructuringProductsAreRejected() {
        SimulationRequest.SelectedItem installment = item("KB_PRODUCT", "D002", "LOAN", bd(6_000_000));
        SimulationRequest.SelectedItem extension = item("KB_PRODUCT", "D003", "LOAN", bd(6_000_000));

        IllegalArgumentException error = assertThrows(IllegalArgumentException.class,
                () -> service.simulate(baseRequest(List.of(installment, extension))));
        assertTrue(error.getMessage().contains("KB_119PLUS_RESTRUCTURING"));
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
            assertTrue(risks.get(i).bufferBreachProbability() >= risks.get(i).bufferBreachAtMonthProbability());
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
                12, 500, 42L, new SimulationRequest.Diagnosis(.15, "MEDIUM", "CAFE", "SEOUL"), items,
                null, null, null, null);
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
